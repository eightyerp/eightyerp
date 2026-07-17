import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase-env";

let browserClient: SupabaseClient | undefined;

/** Browser Supabase client (singleton). Uses createBrowserClient for cookie sessions. */
export function createClient(): SupabaseClient {
  const { url, publishableKey } = getSupabaseEnv();

  if (!browserClient) {
    browserClient = createBrowserClient(url, publishableKey);
  }

  return browserClient;
}
