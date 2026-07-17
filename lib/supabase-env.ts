export type SupabaseEnv = {
  url: string;
  publishableKey: string;
};

/**
 * IMPORTANT: Next.js only inlines NEXT_PUBLIC_* env vars into the client bundle
 * when accessed with a static property path (process.env.NEXT_PUBLIC_...).
 * Dynamic access like process.env[name] returns undefined in the browser.
 */
export function getSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL. Add it to .env.local.",
    );
  }

  if (!publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Add it to .env.local.",
    );
  }

  try {
    new URL(url);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not a valid URL. Check .env.local.",
    );
  }

  return { url, publishableKey };
}

/** Safe metadata for UI/debug — never includes secret values. */
export function getSupabasePublicMeta(): {
  host: string;
  projectId: string;
  keyKind: "publishable" | "jwt_anon" | "other" | "missing";
  configured: boolean;
  configError: string | null;
} {
  try {
    const { url, publishableKey } = getSupabaseEnv();
    const parsed = new URL(url);
    const host = parsed.hostname;
    const projectId = host.split(".")[0] ?? "";
    const keyKind = publishableKey.startsWith("sb_publishable_")
      ? "publishable"
      : publishableKey.startsWith("eyJ")
        ? "jwt_anon"
        : "other";
    return {
      host,
      projectId,
      keyKind,
      configured: true,
      configError: null,
    };
  } catch (err) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    let projectId = "";
    let host = "";
    if (url) {
      try {
        host = new URL(url).hostname;
        projectId = host.split(".")[0] ?? "";
      } catch {
        host = "";
      }
    }
    return {
      host: host || "(env missing)",
      projectId,
      keyKind: "missing",
      configured: false,
      configError:
        err instanceof Error
          ? err.message
          : "Supabase 환경 변수를 확인해 주세요.",
    };
  }
}
