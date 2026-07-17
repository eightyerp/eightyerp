import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("Missing Supabase environment variables.");
  process.exit(1);
}

const supabase = createClient(url, key);

const healthResponse = await fetch(`${url}/auth/v1/health`, {
  headers: { apikey: key },
});

if (!healthResponse.ok) {
  console.error(`Auth health check failed: ${healthResponse.status}`);
  process.exit(1);
}

const { error } = await supabase.auth.getSession();

if (error) {
  console.error(`Supabase client error: ${error.message}`);
  process.exit(1);
}

console.log("Supabase connection verified successfully.");
console.log(`Project URL: ${url}`);
