import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase-server";

const RAILWAY_PREVIEW_ALLOWED_PATHS = [
  "/login",
  "/pending-approval",
  "/dashboard/finance-preview",
  "/finance/payments-preview",
  "/finance/collections-preview",
  "/finance/work-preview",
] as const;

function isRailwayPreviewAllowed(pathname: string) {
  return (
    RAILWAY_PREVIEW_ALLOWED_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    ) || pathname.startsWith("/auth/")
  );
}

export async function proxy(request: NextRequest) {
  const railwayPreviewMode = process.env.RAILWAY_PREVIEW_MODE === "1";

  if (railwayPreviewMode) {
    const pathname = request.nextUrl.pathname;
    const isSafeMethod = request.method === "GET" || request.method === "HEAD";
    const isLoginPost = request.method === "POST" && pathname === "/login";
    const isAuthPost = request.method === "POST" && pathname.startsWith("/auth/");

    // Railway is used only as a finance Preview viewer. Keep the production
    // Supabase project read-only from this deployment by blocking all normal ERP
    // routes and all write requests except authentication.
    if (!isRailwayPreviewAllowed(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard/finance-preview";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (!isSafeMethod && !isLoginPost && !isAuthPost) {
      return NextResponse.json(
        {
          error: "Railway Preview는 읽기 전용입니다. 운영 데이터 변경은 Vercel Production에서만 가능합니다.",
        },
        { status: 403 },
      );
    }
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|xlsx|xls|pdf)$).*)",
  ],
};
