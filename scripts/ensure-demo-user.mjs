import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.DEMO_EMAIL || "demo@eighty-erp.local";
const password = process.env.DEMO_PASSWORD || "EightyDemo123!";

if (!url || !key) {
  console.error("MISSING_ENV");
  process.exit(1);
}

const supabase = createClient(url, key);

const signIn = await supabase.auth.signInWithPassword({ email, password });
if (!signIn.error) {
  console.log("DEMO_USER_READY");
  process.exit(0);
}

const signUp = await supabase.auth.signUp({ email, password });
if (signUp.error) {
  console.error(`SIGNUP_FAILED: ${signUp.error.message}`);
  process.exit(1);
}

const retry = await supabase.auth.signInWithPassword({ email, password });
if (retry.error) {
  console.error(`LOGIN_FAILED: ${retry.error.message}`);
  // Email confirmation may be required
  console.error("CONFIRMATION_MAY_BE_REQUIRED");
  process.exit(2);
}

console.log("DEMO_USER_CREATED");
process.exit(0);
