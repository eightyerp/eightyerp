import { createClient } from "@/lib/supabase-server";

export type NotificationEventType =
  | "material_approval_request"
  | "material_approved"
  | "material_change_request"
  | "material_reapproval_request"
  | "material_all_approved"
  | "external_inquiry_registered"
  | "customer_assigned"
  | "collection_reported"
  | "collection_confirmed";

/**
 * 카카오 알림톡 연동 전 단계: 이벤트 + message_logs(recorded)만 남긴다.
 */
export async function enqueueNotificationEvent(input: {
  event_type: NotificationEventType;
  customer_id?: string | null;
  project_id?: string | null;
  material_id?: string | null;
  payload?: Record<string, unknown>;
  recipient?: string | null;
  body?: string | null;
}) {
  const supabase = await createClient();

  const { data: event, error } = await supabase
    .from("notification_events")
    .insert({
      event_type: input.event_type,
      customer_id: input.customer_id ?? null,
      project_id: input.project_id ?? null,
      material_id: input.material_id ?? null,
      payload: input.payload ?? {},
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[notifications] event insert failed", error.message);
    return null;
  }

  const { error: logError } = await supabase.from("message_logs").insert({
    notification_event_id: event.id,
    channel: "kakao",
    recipient: input.recipient ?? null,
    template_code: input.event_type,
    body:
      input.body ??
      `[에잇티] ${input.event_type} — 카카오 연동 대기`,
    provider_status: "recorded",
    provider_payload: {
      stub: true,
      ready_for_kakao: true,
      event_type: input.event_type,
    },
  });

  if (logError) {
    console.error("[notifications] message_log insert failed", logError.message);
  }

  return event.id as string;
}
