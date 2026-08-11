import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.DEMO_EMAIL || "demo@eighty-erp.local";
const password = process.env.DEMO_PASSWORD || "EightyDemo123!";
const displayName = process.env.DEMO_NAME || "데모 사용자";
const inviteToken = (process.env.DEMO_INVITE_TOKEN || "").trim().toLowerCase();

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

const canProvision =
  signIn.error.code === "invalid_credentials" ||
  /invalid login credentials/i.test(signIn.error.message);

if (!canProvision) {
  console.error(`LOGIN_CHECK_FAILED: ${signIn.error.message}`);
  process.exit(1);
}

if (!/^[0-9a-f]{64}$/.test(inviteToken)) {
  console.error("DEMO_INVITE_TOKEN_REQUIRED");
  console.error("새 데모 계정은 회사에서 발급한 유효한 1회용 직원 초대 토큰이 필요합니다.");
  process.exit(1);
}

const signUp = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      signup_type: "company_invite",
      invite_token: inviteToken,
      full_name: displayName,
      representative_name: displayName,
      role: "staff",
    },
  },
});
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
