import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

type ReviewPayload = {
  ai_result_id: string;
  correction_type: "accurate" | "partially_corrected" | "incorrect" | "not_judgable";
  final_result_json: Record<string, unknown>;
  final_grade: string;
  recommended_actions?: unknown[];
  customer_comment?: string;
  internal_comment?: string;
  quote_required?: boolean;
  measurement_required?: boolean;
  revisit_required?: boolean;
  confirmed?: boolean;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const authorization = req.headers.get("Authorization");
  if (!authorization) return reply(401, { error: "unauthorized" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return reply(500, { error: "server_configuration_error" });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, service, { auth: { persistSession: false } });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData.user;
  if (userError || !user) return reply(401, { error: "unauthorized" });

  let payload: ReviewPayload;
  try {
    payload = await req.json();
  } catch {
    return reply(400, { error: "invalid_json" });
  }

  if (!payload.ai_result_id || !payload.correction_type || !payload.final_grade || !payload.final_result_json) {
    return reply(400, { error: "missing_required_fields" });
  }

  const { data: employee } = await admin
    .from("window_employee_links")
    .select("role, active")
    .eq("window_auth_user_id", user.id)
    .maybeSingle();

  if (!employee?.active) return reply(403, { error: "inactive_or_unlinked_employee" });

  const { data: analysis, error: analysisError } = await admin
    .from("window_ai_results")
    .select("id, inspection_id, location_id, window_unit_id")
    .eq("id", payload.ai_result_id)
    .maybeSingle();

  if (analysisError || !analysis) return reply(404, { error: "analysis_not_found" });

  const { data: inspection } = await admin
    .from("window_inspections")
    .select("created_by, assigned_employee_id, deleted_at")
    .eq("id", analysis.inspection_id)
    .maybeSingle();

  const manager = ["manager", "admin", "owner"].includes(employee.role);
  const permitted =
    inspection &&
    !inspection.deleted_at &&
    (manager || inspection.created_by === user.id || inspection.assigned_employee_id === user.id);

  if (!permitted) return reply(403, { error: "forbidden" });

  const confirmed = Boolean(payload.confirmed);
  const reviewRecord = {
    ai_result_id: payload.ai_result_id,
    inspection_id: analysis.inspection_id,
    location_id: analysis.location_id,
    window_unit_id: analysis.window_unit_id,
    reviewed_by: user.id,
    correction_type: payload.correction_type,
    final_result_json: payload.final_result_json,
    final_grade: payload.final_grade,
    recommended_actions: payload.recommended_actions ?? [],
    customer_comment: payload.customer_comment ?? null,
    internal_comment: payload.internal_comment ?? null,
    quote_required: Boolean(payload.quote_required),
    measurement_required: Boolean(payload.measurement_required),
    revisit_required: Boolean(payload.revisit_required),
    confirmed,
    confirmed_at: confirmed ? new Date().toISOString() : null,
  };

  const { data: review, error: reviewError } = await admin
    .from("window_staff_reviews")
    .upsert(reviewRecord, { onConflict: "ai_result_id" })
    .select("id, confirmed, confirmed_at")
    .single();

  if (reviewError) return reply(500, { error: "review_store_failed" });

  if (confirmed) {
    const { count } = await admin
      .from("window_units")
      .select("id", { count: "exact", head: true })
      .eq("inspection_id", analysis.inspection_id)
      .is("deleted_at", null);

    const { count: confirmedCount } = await admin
      .from("window_staff_reviews")
      .select("id", { count: "exact", head: true })
      .eq("inspection_id", analysis.inspection_id)
      .eq("confirmed", true);

    await admin
      .from("window_inspections")
      .update({
        status: count && confirmedCount && confirmedCount >= count ? "ready_to_issue" : "staff_review",
      })
      .eq("id", analysis.inspection_id);
  }

  await admin.from("window_audit_logs").insert({
    user_id: user.id,
    action: confirmed ? "window_review_confirmed" : "window_review_saved",
    entity_type: "window_staff_review",
    entity_id: review.id,
    metadata_without_personal_data: {
      inspection_id: analysis.inspection_id,
      window_unit_id: analysis.window_unit_id,
      correction_type: payload.correction_type,
    },
  });

  return reply(200, {
    review_id: review.id,
    confirmed: review.confirmed,
    confirmed_at: review.confirmed_at,
  });
});
