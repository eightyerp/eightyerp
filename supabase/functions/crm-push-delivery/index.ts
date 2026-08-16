// @ts-nocheck
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.110.6";

type QueueEvent = {
  table: "notification_events" | "schedule_alert_events";
  id: string;
  eventType: string;
  employeeId: string;
  customerId: string | null;
  payload: Record<string, unknown>;
};

type SubscriptionRow = {
  id: string;
  employee_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function getSupabaseSecretKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) return legacy;

  const raw = Deno.env.get("SUPABASE_SECRET_KEYS")?.trim();
  if (!raw) throw new Error("missing_supabase_secret_key");
  const parsed = JSON.parse(raw) as Record<string, string>;
  const candidate = parsed.default || Object.values(parsed)[0];
  if (!candidate) throw new Error("missing_supabase_secret_key");
  return candidate;
}

function assignmentEmployeeId(payload: Record<string, unknown>): string | null {
  const value = payload.assigned_employee_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function pushPayload(event: QueueEvent) {
  const url =
    typeof event.payload.url === "string" && event.payload.url.startsWith("/crm")
      ? event.payload.url
      : event.customerId
        ? `/crm/customers/${event.customerId}`
        : "/crm";

  if (event.eventType === "customer_assigned") {
    return {
      title: "새 고객이 배분되었습니다",
      body: "내 담당 고객이 추가되었습니다. CRM에서 확인해 주세요.",
      url,
      tag: `crm-assigned-${event.id}`,
    };
  }
  if (event.eventType === "consult_remind_1h") {
    return {
      title: "1시간 후 고객 일정",
      body: "예약된 상담·실측·재연락 일정을 확인해 주세요.",
      url,
      tag: `crm-remind-${event.id}`,
    };
  }
  return {
    title: "미처리 고객 확인",
    body: "예정 시간이 30분 이상 지났습니다. 처리 또는 재예약해 주세요.",
    url,
    tag: `crm-unhandled-${event.id}`,
  };
}

Deno.serve(async (req: Request) => {
  try {
    const expectedWorkerSecret = env("CRM_PUSH_WORKER_SECRET");
    const suppliedSecret = req.headers.get("x-crm-push-secret")?.trim() ?? "";
    if (suppliedSecret !== expectedWorkerSecret) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const supabase = createClient(env("SUPABASE_URL"), getSupabaseSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    webpush.setVapidDetails(
      env("CRM_WEB_PUSH_VAPID_SUBJECT"),
      env("CRM_WEB_PUSH_VAPID_PUBLIC_KEY"),
      env("CRM_WEB_PUSH_VAPID_PRIVATE_KEY"),
    );

    // 동일 worker가 시간 이벤트 생성과 delivery를 함께 처리해 scheduler를 하나로 유지한다.
    await supabase.rpc("enqueue_due_crm_schedule_alerts");

    const [assignmentResult, scheduleResult] = await Promise.all([
      supabase
        .from("notification_events")
        .select("id, event_type, customer_id, payload")
        .eq("status", "pending")
        .eq("event_type", "customer_assigned")
        .order("created_at", { ascending: true })
        .limit(50),
      supabase
        .from("schedule_alert_events")
        .select("id, event_type, customer_id, assigned_employee_id, payload")
        .eq("status", "pending")
        .in("event_type", ["consult_remind_1h", "consult_unhandled"])
        .order("created_at", { ascending: true })
        .limit(100),
    ]);

    if (assignmentResult.error) throw assignmentResult.error;
    if (scheduleResult.error) throw scheduleResult.error;

    const events: QueueEvent[] = [];
    for (const row of assignmentResult.data ?? []) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const employeeId = assignmentEmployeeId(payload);
      if (!employeeId) continue;
      events.push({
        table: "notification_events",
        id: row.id,
        eventType: row.event_type,
        employeeId,
        customerId: row.customer_id,
        payload,
      });
    }
    for (const row of scheduleResult.data ?? []) {
      if (!row.assigned_employee_id) continue;
      events.push({
        table: "schedule_alert_events",
        id: row.id,
        eventType: row.event_type,
        employeeId: row.assigned_employee_id,
        customerId: row.customer_id,
        payload: (row.payload ?? {}) as Record<string, unknown>,
      });
    }

    if (events.length === 0) {
      return new Response(JSON.stringify({ processed: 0, sent: 0, skipped: 0, failed: 0 }), {
        headers: { "content-type": "application/json" },
      });
    }

    const employeeIds = [...new Set(events.map((event) => event.employeeId))];
    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("crm_push_subscriptions")
      .select("id, employee_id, endpoint, p256dh, auth_key")
      .in("employee_id", employeeIds)
      .eq("is_active", true);
    if (subscriptionError) throw subscriptionError;

    const byEmployee = new Map<string, SubscriptionRow[]>();
    for (const row of (subscriptions ?? []) as SubscriptionRow[]) {
      const list = byEmployee.get(row.employee_id) ?? [];
      list.push(row);
      byEmployee.set(row.employee_id, list);
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const event of events) {
      const targets = byEmployee.get(event.employeeId) ?? [];
      let eventSent = 0;
      let eventFailed = 0;

      for (const subscription of targets) {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth_key,
              },
            },
            JSON.stringify(pushPayload(event)),
            { TTL: event.eventType === "customer_assigned" ? 86400 : 3600 },
          );
          eventSent += 1;
          await supabase
            .from("crm_push_subscriptions")
            .update({ last_success_at: new Date().toISOString(), last_error: null, last_error_at: null })
            .eq("id", subscription.id);
        } catch (error) {
          eventFailed += 1;
          const statusCode = Number(error?.statusCode ?? 0);
          const permanent = statusCode === 404 || statusCode === 410;
          await supabase
            .from("crm_push_subscriptions")
            .update({
              is_active: permanent ? false : true,
              last_error_at: new Date().toISOString(),
              last_error: String(error?.message ?? "web_push_failed").slice(0, 500),
            })
            .eq("id", subscription.id);
        }
      }

      const status =
        eventSent > 0 ? "sent" : targets.length === 0 ? "skipped" : "failed";
      await supabase
        .from(event.table)
        .update({ status, processed_at: new Date().toISOString() })
        .eq("id", event.id);

      if (status === "sent") sent += 1;
      else if (status === "skipped") skipped += 1;
      else failed += 1;

      if (eventFailed > 0 && eventSent === 0) {
        console.error("[crm-push] all subscriptions failed", {
          eventId: event.id,
          eventType: event.eventType,
          failures: eventFailed,
        });
      }
    }

    return new Response(
      JSON.stringify({ processed: events.length, sent, skipped, failed }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (error) {
    console.error("[crm-push] worker failed", error);
    return new Response(JSON.stringify({ error: "crm_push_worker_failed" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
