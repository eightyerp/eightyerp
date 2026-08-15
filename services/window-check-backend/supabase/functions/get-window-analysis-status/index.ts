import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const authorization = req.headers.get("Authorization");
  if (!authorization) return reply(401, { error: "unauthorized" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return reply(500, { error: "server_configuration_error" });

  const client = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return reply(401, { error: "unauthorized" });

  let payload: { job_id?: string; inspection_id?: string; window_unit_id?: string };
  try { payload = await req.json(); } catch { return reply(400, { error: "invalid_json" }); }

  let query = client
    .from("window_analysis_jobs")
    .select("id, inspection_id, location_id, window_unit_id, status, attempt_count, error_code, error_message, queued_at, started_at, completed_at, window_ai_results(id, validated_result_json)");

  if (payload.job_id) query = query.eq("id", payload.job_id);
  else if (payload.inspection_id && payload.window_unit_id) query = query.eq("inspection_id", payload.inspection_id).eq("window_unit_id", payload.window_unit_id).order("queued_at", { ascending: false }).limit(1);
  else return reply(400, { error: "job_or_unit_required" });

  const { data, error } = await query.maybeSingle();
  if (error) return reply(500, { error: "status_query_failed" });
  if (!data) return reply(404, { error: "analysis_job_not_found" });

  const resultRows = Array.isArray(data.window_ai_results) ? data.window_ai_results : [];
  return reply(200, {
    job_id: data.id,
    inspection_id: data.inspection_id,
    location_id: data.location_id,
    window_unit_id: data.window_unit_id,
    status: data.status,
    attempt_count: data.attempt_count,
    error_code: data.error_code,
    error_message: data.error_message,
    queued_at: data.queued_at,
    started_at: data.started_at,
    completed_at: data.completed_at,
    analysis_id: resultRows[0]?.id ?? null,
    result: resultRows[0]?.validated_result_json ?? null,
  });
});
