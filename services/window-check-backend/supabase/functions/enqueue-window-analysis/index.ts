import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

type AnalysisRequest = {
  inspection_id: string;
  location_id: string;
  window_unit_id: string;
  photo_ids?: string[];
  symptoms?: Record<string, unknown>;
  idempotency_key?: string;
  prompt_version?: string;
  schema_version?: string;
};

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function readText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function includesText(value: unknown, target: string): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => readText(entry).includes(target));
  }
  return readText(value).includes(target);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return response(405, { error: "method_not_allowed" });
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization) {
    return response(401, { error: "unauthorized" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return response(500, { error: "server_configuration_error" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData.user;
  if (userError || !user) {
    return response(401, { error: "unauthorized" });
  }

  let payload: AnalysisRequest;
  try {
    payload = await req.json();
  } catch {
    return response(400, { error: "invalid_json" });
  }

  const { inspection_id, location_id, window_unit_id } = payload;
  if (!inspection_id || !location_id || !window_unit_id) {
    return response(400, { error: "missing_required_fields" });
  }

  const { data: employee, error: employeeError } = await admin
    .from("window_employee_links")
    .select("role, active")
    .eq("window_auth_user_id", user.id)
    .maybeSingle();

  if (employeeError || !employee?.active) {
    return response(403, { error: "inactive_or_unlinked_employee" });
  }

  const { data: inspection, error: inspectionError } = await admin
    .from("window_inspections")
    .select("id, created_by, assigned_employee_id, deleted_at")
    .eq("id", inspection_id)
    .maybeSingle();

  if (inspectionError || !inspection || inspection.deleted_at) {
    return response(404, { error: "inspection_not_found" });
  }

  const manager = ["manager", "admin", "owner"].includes(employee.role);
  const permitted =
    manager ||
    inspection.created_by === user.id ||
    inspection.assigned_employee_id === user.id;

  if (!permitted) {
    return response(403, { error: "forbidden" });
  }

  const { data: unit, error: unitError } = await admin
    .from("window_units")
    .select("id, unit_name, inspection_id, location_id, deleted_at")
    .eq("id", window_unit_id)
    .eq("inspection_id", inspection_id)
    .eq("location_id", location_id)
    .maybeSingle();

  if (unitError || !unit || unit.deleted_at) {
    return response(404, { error: "window_unit_not_found" });
  }

  const { data: location } = await admin
    .from("window_inspection_locations")
    .select("location_name")
    .eq("id", location_id)
    .maybeSingle();

  let photoQuery = admin
    .from("window_photos")
    .select("id, category, file_hash, employee_description")
    .eq("inspection_id", inspection_id)
    .eq("location_id", location_id)
    .eq("window_unit_id", window_unit_id)
    .eq("selected_for_analysis", true)
    .is("deleted_at", null);

  if (payload.photo_ids?.length) {
    photoQuery = photoQuery.in("id", payload.photo_ids);
  }

  const { data: photos, error: photoError } = await photoQuery.order("sequence");

  if (photoError) {
    return response(500, { error: "photo_query_failed" });
  }

  const photoRows = photos ?? [];
  const required = ["whole_window", "frame_corner", "glass", "lower_rail", "handle_lock"];
  const categories = new Set(photoRows.map((photo) => photo.category));
  const missing = required.filter((category) => !categories.has(category));

  const sourceKey = JSON.stringify({
    inspection_id,
    location_id,
    window_unit_id,
    photo_hashes: photoRows.map((photo) => photo.file_hash).sort(),
    symptoms: payload.symptoms ?? {},
    prompt_version: payload.prompt_version ?? "window-v1",
    schema_version: payload.schema_version ?? "1.0",
    mode: "mock",
  });
  const idempotencyKey = payload.idempotency_key || (await sha256(sourceKey));

  const { data: existingJob } = await admin
    .from("window_analysis_jobs")
    .select("id, status")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingJob) {
    const { data: existingResult } = await admin
      .from("window_ai_results")
      .select("id, validated_result_json")
      .eq("analysis_job_id", existingJob.id)
      .maybeSingle();

    return response(200, {
      reused: true,
      job_id: existingJob.id,
      status: existingJob.status,
      analysis_id: existingResult?.id ?? null,
      result: existingResult?.validated_result_json ?? null,
    });
  }

  if (missing.length > 0) {
    const { data: retakeJob, error: retakeJobError } = await admin
      .from("window_analysis_jobs")
      .insert({
        inspection_id,
        location_id,
        window_unit_id,
        requested_by: user.id,
        idempotency_key: idempotencyKey,
        status: "needs_retake",
        prompt_version: payload.prompt_version ?? "window-v1",
        schema_version: payload.schema_version ?? "1.0",
        model_name: "mock-window-v1",
        completed_at: new Date().toISOString(),
        error_code: "missing_required_photos",
        error_message: missing.join(","),
      })
      .select("id")
      .single();

    if (retakeJobError) {
      return response(500, { error: "analysis_job_create_failed" });
    }

    return response(422, {
      error: "insufficient_photo_quality",
      status: "needs_retake",
      job_id: retakeJob.id,
      missing_categories: missing,
      retake_requests: missing.map((category) => ({
        required_category: category,
        reason: "필수 촬영 부위가 등록되지 않았습니다.",
        instruction: `${category} 항목이 선명하게 보이도록 다시 촬영해 주세요.`,
      })),
    });
  }

  const startedAt = Date.now();
  const { data: job, error: jobError } = await admin
    .from("window_analysis_jobs")
    .insert({
      inspection_id,
      location_id,
      window_unit_id,
      requested_by: user.id,
      idempotency_key: idempotencyKey,
      status: "processing",
      prompt_version: payload.prompt_version ?? "window-v1",
      schema_version: payload.schema_version ?? "1.0",
      model_name: "mock-window-v1",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (jobError) {
    return response(500, { error: "analysis_job_create_failed" });
  }

  const symptom = payload.symptoms ?? {};
  const hasCondensation =
    categories.has("condensation") ||
    categories.has("insulated_glass_fogging") ||
    includesText(symptom.condensation_frequency, "자주") ||
    includesText(symptom.condensation_locations, "유리");

  const hasLeak =
    categories.has("external_water_leak") ||
    includesText(symptom.leak_frequency, "발생") ||
    includesText(symptom.leak_locations, "상부");

  const hasSealant = categories.has("sealant");
  const hasHardware = categories.has("hardware_damage");
  const hasFrame = categories.has("frame_damage");
  const hasDrainage = categories.has("drainage");

  const preliminaryLevel = hasLeak
    ? "expert_check"
    : hasFrame || hasHardware
      ? "repair_check"
      : hasCondensation || hasSealant || hasDrainage
        ? "maintenance"
        : "good";

  const observedFacts: Record<string, unknown>[] = [];
  if (hasCondensation) {
    observedFacts.push({
      evidence_photo_ids: photoRows
        .filter((photo) => ["condensation", "insulated_glass_fogging", "glass"].includes(photo.category))
        .map((photo) => photo.id),
      finding_code: "moisture_trace",
      observation: "결로 또는 유리 주변 수분 현상을 확인하기 위한 사진이 등록되었습니다.",
      severity: "medium",
      confidence: 0.62,
      limitation: "표면 결로와 복층유리 내부 습기는 현장 확인 없이 확정할 수 없습니다.",
    });
  }
  if (hasLeak) {
    observedFacts.push({
      evidence_photo_ids: photoRows
        .filter((photo) => ["external_water_leak", "upper_frame", "wall_joint", "lower_rail"].includes(photo.category))
        .map((photo) => photo.id),
      finding_code: "water_intrusion_trace",
      observation: "외부 유입 또는 물자국 확인을 위한 사진과 증상이 등록되었습니다.",
      severity: "high",
      confidence: 0.66,
      limitation: "창호 코킹, 외벽, 상부 구조 또는 배수 중 원인을 사진만으로 확정할 수 없습니다.",
    });
  }
  if (hasSealant) {
    observedFacts.push({
      evidence_photo_ids: photoRows.filter((photo) => photo.category === "sealant").map((photo) => photo.id),
      finding_code: "sealant_check",
      observation: "실리콘·코킹 상태를 확인하기 위한 근접 사진이 등록되었습니다.",
      severity: "medium",
      confidence: 0.58,
      limitation: "Mock 분석은 실제 갈라짐 범위를 판독하지 않습니다.",
    });
  }

  const result = {
    schema_version: payload.schema_version ?? "1.0",
    analysis_status: "completed",
    ai_mode: "mock",
    window_unit: {
      inspection_id,
      location_id,
      window_unit_id,
      location_name: location?.location_name ?? "미지정 공간",
      unit_name: unit.unit_name,
    },
    photo_quality: {
      overall: "pass",
      issues: [],
      retake_requests: [],
    },
    observed_facts: observedFacts,
    component_status: {
      frame: hasFrame ? "suspected_issue" : "check",
      glass: hasCondensation ? "check" : "good",
      sealant: hasSealant ? "check" : "undetermined",
      rail_drainage: hasDrainage || hasLeak ? "check" : "undetermined",
      hardware: hasHardware ? "suspected_issue" : "good",
    },
    moisture_assessment: {
      surface_condensation: hasCondensation ? "possible" : "undetermined",
      insulated_glass_fogging: categories.has("insulated_glass_fogging") ? "possible" : "undetermined",
      water_intrusion_trace: hasLeak ? "possible" : "undetermined",
      active_water_visible: Boolean(symptom.active_water_visible),
      cause_confirmed: false,
      possible_causes: hasLeak
        ? [
            { code: "external_sealant", label: "외부 코킹 점검 필요", confidence: "low", reason: "외부누수 관련 사진 또는 증상이 등록됨" },
            { code: "wall_entry", label: "벽체 접합부 점검 필요", confidence: "low", reason: "사진만으로 유입경로를 확정할 수 없음" },
          ]
        : hasCondensation
          ? [
              { code: "indoor_condensation", label: "실내 결로 가능성", confidence: "low", reason: "결로 관련 사진 또는 증상이 등록됨" },
            ]
          : [
              { code: "unknown", label: "사진만으로 판단 불가", confidence: "low", reason: "추가 현장정보 필요" },
            ],
      limitations: ["Mock 분석이며 실제 이미지 픽셀을 판독하지 않습니다.", "최종 원인과 조치는 담당직원 검토가 필요합니다."],
    },
    preliminary_level: preliminaryLevel,
    urgent_flags: [],
    required_field_checks: [
      "창짝 개폐와 잠금 밀착 확인",
      "하부 배수구와 레일 상태 확인",
      ...(hasLeak ? ["창 상부·측면·외부 코킹과 벽체 접합부 확인"] : []),
    ],
    staff_questions: [
      "증상이 발생하는 날씨와 시간대를 확인했습니까?",
      "최근 실리콘·코킹·유리·하드웨어 보수이력이 있습니까?",
    ],
    recommended_actions: [
      { priority: 1, action_code: "field_inspection", description: "담당직원이 사진과 증상을 현장에서 확인합니다.", requires_field_confirmation: true },
      ...(hasLeak
        ? [{ priority: 2, action_code: "water_test", description: "외부 유입과 배수 문제를 구분하기 위한 점검을 검토합니다.", requires_field_confirmation: true }]
        : []),
      ...(hasCondensation
        ? [{ priority: 2, action_code: "glass_check", description: "유리 표면 결로와 복층유리 내부 습기를 구분합니다.", requires_field_confirmation: true }]
        : []),
    ],
    summary_for_staff: `개발 Mock 분석입니다. ${unit.unit_name}에 등록된 사진 분류와 증상 입력을 기준으로 직원 검토 초안을 생성했습니다.`,
    draft_customer_summary: "촬영사진과 입력 증상을 기준으로 추가 점검 항목을 정리했습니다. 정확한 원인과 조치방법은 담당직원의 현장확인 후 안내드립니다.",
    disclaimer: "사진 기반 예비관찰이며 최종판정은 담당직원과 현장점검을 통해 확정해야 합니다.",
  };

  const { data: analysis, error: resultError } = await admin
    .from("window_ai_results")
    .insert({
      analysis_job_id: job.id,
      inspection_id,
      location_id,
      window_unit_id,
      model_name: "mock-window-v1",
      prompt_version: payload.prompt_version ?? "window-v1",
      schema_version: payload.schema_version ?? "1.0",
      raw_result_json: result,
      validated_result_json: result,
      input_photo_count: photoRows.length,
      processing_time_ms: Date.now() - startedAt,
      estimated_cost: 0,
    })
    .select("id")
    .single();

  if (resultError) {
    await admin
      .from("window_analysis_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_code: "result_store_failed",
        error_message: resultError.message,
      })
      .eq("id", job.id);
    return response(500, { error: "result_store_failed" });
  }

  await admin
    .from("window_analysis_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  return response(200, {
    reused: false,
    job_id: job.id,
    analysis_id: analysis.id,
    status: "completed",
    ai_mode: "mock",
    result,
  });
});
