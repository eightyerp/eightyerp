import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { isPendingRoute, isPublicRoute } from "@/lib/auth";
import { getSupabaseEnv } from "@/lib/supabase-env";

function isMissingSessionError(error: {
  name?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  return (
    error.name === "AuthSessionMissingError" ||
    error.message === "Auth session missing!"
  );
}

export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseEnv();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component where cookies cannot be written.
          // Proxy handles session refresh for those requests.
        }
      },
    },
  });
}

function copyAllCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value);
  });
  return to;
}

/**
 * Refresh auth session cookies and gate protected routes.
 * Must call getUser() (not only getSession) so tokens stay in sync.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const isPublic = isPublicRoute(pathname);

  let url: string;
  let publishableKey: string;
  try {
    ({ url, publishableKey } = getSupabaseEnv());
  } catch {
    // Misconfigured env: still allow /login so the UI can show a clear message.
    if (isPublic) {
      return supabaseResponse;
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        supabaseResponse = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });

        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value);
        });
      },
    },
  });

  // Do not run code between createServerClient and auth.getUser().
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // Missing session before login is expected — do not treat as an app error.
  if (userError && !isMissingSessionError(userError)) {
    console.error("[auth/proxy] getUser failed", {
      message: userError.message,
      status: userError.status,
      name: userError.name,
      path: pathname,
    });
  }

  const isAuthenticated = Boolean(user);
  const isPendingPath = isPendingRoute(pathname);

  // Unauthenticated users may always reach /login (and other public routes).
  if (!isAuthenticated && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    const redirectResponse = NextResponse.redirect(redirectUrl);
    return copyAllCookies(supabaseResponse, redirectResponse);
  }

  // Approval / active gate for authenticated users
  if (isAuthenticated && user) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_active, is_approved, approval_status")
      .eq("id", user.id)
      .maybeSingle();

    let canAccessErp = false;

    if (profileError) {
      // is_approved 컬럼 미적용 등: is_active만으로 판정. 그조차 실패하면 차단(fail-closed)
      const { data: fallback, error: fallbackError } = await supabase
        .from("profiles")
        .select("is_active")
        .eq("id", user.id)
        .maybeSingle();

      if (fallbackError || !fallback) {
        canAccessErp = false;
      } else {
        canAccessErp = fallback.is_active === true;
      }
    } else {
      const hasApprovalColumn =
        profile != null && typeof profile.is_approved === "boolean";
      const isApproved = hasApprovalColumn
        ? profile.is_approved === true
        : true;
      const status =
        (profile?.approval_status as string | undefined) ??
        (isApproved ? "approved" : "pending");
      canAccessErp =
        profile != null &&
        profile.is_active === true &&
        isApproved &&
        status === "approved";
    }

    if (!canAccessErp) {
      if (pathname === "/login" || pathname === "/signup") {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/pending-approval";
        redirectUrl.search = "";
        return copyAllCookies(
          supabaseResponse,
          NextResponse.redirect(redirectUrl),
        );
      }
      // /pending-approval 은 PUBLIC_ROUTES에 포함 — 미승인 사용자 허용
      if (!isPendingPath && !isPublic) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/pending-approval";
        redirectUrl.search = "";
        return copyAllCookies(
          supabaseResponse,
          NextResponse.redirect(redirectUrl),
        );
      }
      return supabaseResponse;
    }

    if (
      pathname === "/login" ||
      pathname === "/signup" ||
      isPendingPath
    ) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      redirectUrl.search = "";
      return copyAllCookies(
        supabaseResponse,
        NextResponse.redirect(redirectUrl),
      );
    }
  }

  return supabaseResponse;
}
