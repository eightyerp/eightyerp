import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("MISSING_ENV");
  process.exit(1);
}

const supabase = createClient(url, key);
const tables = [
  "teams",
  "employees",
  "lead_sources",
  "customers",
  "inquiry_messages",
];

let hasMissing = false;

for (const table of tables) {
  const { error } = await supabase.from(table).select("*").limit(1);
  if (!error) {
    console.log(`OK ${table}`);
    continue;
  }

  const message = error.message || "";
  const code = error.code || "";
  console.log(`DETAIL ${table}: code=${code} message=${message}`);

  if (
    message.includes("Could not find the table") ||
    message.includes("schema cache") ||
    code === "42P01" ||
    code === "PGRST205"
  ) {
    console.log(`MISSING ${table}`);
    hasMissing = true;
  } else if (
    message.includes("permission") ||
    code === "42501" ||
    code === "PGRST301"
  ) {
    console.log(`EXISTS_RLS ${table}`);
  } else {
    console.log(`ERROR ${table}`);
    hasMissing = true;
  }
}

process.exit(hasMissing ? 2 : 0);
