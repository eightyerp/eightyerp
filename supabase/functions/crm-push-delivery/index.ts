// @ts-nocheck
import { sendNotification, setVapidDetails } from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.110.6";

type QueueEvent = {
  table: "notification_events" | "schedule_alert_events";
  id: string;
  eventType: string;
  employeeId: string;
  customerId: string | null;
  scheduleId: string | null;
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

function allowedInternalPayloadUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.startsWith("/crm") || value.startsWith("/customers/")) return value;
  return null;
}

function pushPayload(event: QueueEvent) {
  const scheduleDeepLink =
    event.scheduleId &&
    ["schedule_changed", "consult_remind_1h", "consult_unhandled"].includes(event.eventType)
      ? `/crm/schedules/${event.scheduleId}`
      : null;
  const payloadUrl = allowedInternalPayloadUrl(event.payload.url);
  const url =
    scheduleDeepLink ||
    payloadUrl ||
    (event.customerId ? `/crm/customers/${event.customerId}` : "/crm");

  if (event.eventType === "customer_assigned") {
    return {
      title: "새 고객이 배분되었습니다",
      body: "내 담당 고객이 추가되었습니다. CRM에서 확인해 주세요.",
      url,
      tag: `crm-assigned-${event.id}`,
    };
  }

  if (event.eventType === "customer_assignment_uncontacted_30m") {
    return {
      title: "배분 후 30분 미연락 고객",
      body: "신규 배분 고객의 첫 연락이 아직 확인되지 않았습니다.",
      url,
      tag: `crm-assigned-uncontacted-${event.id}`,
    };
  }

  if (event.eventType === "customer_unassigned_10m") {
    return {
      title: "담당자 미배정 신규문의",
      body: "신규 고객이 10분 이상 미배정 상태입니다. 담당자를 지정해 주세요.",
      url,
      tag: `crm-unassigned-${event.id}`,
    };
  }

  if (event.eventType === "schedule_changed") {
    const action = event.payload.action === "create" ? "등록" : "변경";
    return {
      title: `고객 일정이 ${action}되었습니다`,
      body: "상담·실측·재연락 일정을 CRM에서 확인해 주세요.",
      url,
      tag: `crm-schedule-changed-${event.id}`,
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

  if (event.eventType === "customer_stale_3d") {
    return {
      title: "3일 이상 후속 없는 고객",
      body: "최근 활동과 다음 일정이 없습니다. 고객 진행상태를 확인해 주세요.",
      url,
      tag: `crm-stale-3d-${event.id}`,
    };
  }

  if (event.eventType === "customer_stale_7d") {
    return {
      title: "7일 이상 장기 방치 고객",
      body: "장기간 후속 행동이 없습니다. 연락·재예약·보류 여부를 확인해 주세요.",
      url,
      tag: `crm-stale-7d-${event.id}`,
    };
  }

  return {
    title: "미처리 고객 확인",
    body: "예정 시간이 30분 이상 지났습니다. 처리 또는 재예약해 주세요.",
    url,
    tag: `crm-unhandled-${event.id}`,
  };
}

function ttlFor(eventType: string) {
  if (eventType === "customer_assigned") return 86400;
  if (eventType === "customer_assignment_uncontacted_30m") return 14400;
  if (eventType === "customer_unassigned_10m") return 21600;
  if (eventType === "customer_stale_3d" || eventType === "customer_stale_7d") return 43200;
  if (eventType === "schedule_changed") return 21600;
  return 3600;
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

    setVapidDetails(
      env("CRM_WEB_PUSH_VAPID_SUBJECT"),
      env("CRM_WEB_PUSH_VAPID_PUBLIC_KEY"),
      env("CRM_WEB_PUSH_VAPID_PRIVATE_KEY"),
    );

    // 동일 worker가 예약/미처리, 장기방치, 신규배분 첫 연락 누락, 미배정 문의를 함께 판정한다.
    // 운영 scheduler는 하나만 유지해 알림 판정 로직의 중복을 막는다.
    const [
      scheduleEnqueueResult,
      staleEnqueueResult,
      assignmentFollowupResult,
      unassignedResult,
    ] = await Promise.all([
      supabase.rpc("enqueue_due_crm_schedule_alerts"),
      supabase.rpc("enqueue_due_crm_stale_customer_alerts"),
      supabase.rpc("enqueue_due_crm_assignment_followups"),
      supabase.rpc("enqueue_due_crm_unassigned_customer_alerts"),
    ]);
    if (scheduleEnqueueResult.error) throw scheduleEnqueueResult.error;
    if (staleEnqueueResult.error) throw staleEnqueueResult.error;
    if (assignmentFollowupResult.error) throw assignmentFollowupResult.error;
    if (unassignedResult.error) throw unassignedResult.error;

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
        .select("id, event_type, schedule_id, customer_id, assigned_employee_id, payload")
        .eq("status", "pending")
        .in("event_type", [
          "schedule_changed",
          "consult_remind_1h",
          "consult_unhandled",
          "customer_assignment_uncontacted_30m",
          "customer_unassigned_10m",
          "customer_stale_3d",
          "customer_stale_7d",
        ])
        .order("created_at", { ascending: true })
        .limit(200),
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
        scheduleId: null,
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
        scheduleId: row.schedule_id,
        payload: (row.payload ?? {}) as Record<string, unknown>,
      });
    }

    if (events.length === 0) {
      return new Response(JSON.stringify({ processed: 0, sent: 0, skipped: 0, failed: 0 }), {
        headers: { "content-type": "application/json" },
      });
    }

    // 본인이 자기 일정을 등록/변경한 즉시 자기 자신에게 다시 PUSH가 오는 것은 피한다.
    // 다만 1시간 전/미처리 알림은 실제 리마인더이므로 그대로 발송한다.
    const selfScheduleChangedEventIds = new Set<string>();
    const scheduleChangedEvents = events.filter(
      (event) => event.eventType === "schedule_changed" && event.scheduleId,
    );
    if (scheduleChangedEvents.length > 0) {
      const scheduleIds = [
        ...new Set(scheduleChangedEvents.map((event) => event.scheduleId).filter(Boolean)),
      ];
      const { data: actorSchedules, error: actorScheduleError } = await supabase
        .from("customer_schedules")
        .select("id, created_by, updated_by")
        .in("id", scheduleIds);

      if (!actorScheduleError) {
        const actorUserIds = [
          ...new Set(
            (actorSchedules ?? [])
              .flatMap((row) => [row.created_by, row.updated_by])
              .filter(Boolean),
          ),
        ];
        let profileByUser = new Map<string, string>();
        if (actorUserIds.length > 0) {
          const { data: actorProfiles } = await supabase
            .from("profiles")
            .select("id, employee_id")
            .in("id", actorUserIds);
          profileByUser = new Map(
            (actorProfiles ?? [])
              .filter((row) => row.id && row.employee_id)
              .map((row) => [row.id, row.employee_id]),
          );
        }
        const scheduleById = new Map(
          (actorSchedules ?? []).map((row) => [row.id, row]),
        );

        for (const event of scheduleChangedEvents) {
          const schedule = scheduleById.get(event.scheduleId);
          if (!schedule) continue;
          const actorUserId =
            event.payload.action === "create"
              ? schedule.created_by
              : schedule.updated_by || schedule.created_by;
          const actorEmployeeId = actorUserId
            ? profileByUser.get(actorUserId) ?? null
            : null;
          if (actorEmployeeId && actorEmployeeId === event.employeeId) {
            selfScheduleChangedEventIds.add(event.id);
          }
        }
      }
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
      if (selfScheduleChangedEventIds.has(event.id)) {
        await supabase
          .from(event.table)
          .update({
            status: "skipped",
            processed_at: new Date().toISOString(),
            payload: { ...event.payload, skip_reason: "self_schedule_change" },
          })
          .eq("id", event.id);
        skipped += 1;
        continue;
      }

      const targets = byEmployee.get(event.employeeId) ?? [];
      let eventSent = 0;
      let eventFailed = 0;

      for (const subscription of targets) {
        try {
          await sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth_key,
              },
            },
            JSON.stringify(pushPayload(event)),
            { TTL: ttlFor(event.eventType) },
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
