import Link from "next/link";
import CrmPushSetupCard from "@/components/crm/CrmPushSetupCard";
import { listMyCrmAlerts, type CrmAlertItem } from "@/lib/crm/crm-alert-inbox";

function formatKoreaDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function toneClass(tone: CrmAlertItem["tone"]) {
  if (tone === "danger") return "bg-red-50 text-red-700 ring-red-200";
  if (tone === "warning") return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-sky-50 text-sky-700 ring-sky-200";
}

function eventLabel(eventType: string) {
  if (eventType === "customer_assigned") return "배분";
  if (eventType === "schedule_changed") return "일정";
  if (eventType === "consult_remind_1h") return "1시간 전";
  if (eventType === "consult_unhandled") return "미처리";
  if (eventType === "customer_assignment_uncontacted_30m") return "30분 미연락";
  if (eventType === "customer_stale_3d") return "3일 방치";
  if (eventType === "customer_stale_7d") return "7일 방치";
  return "알림";
}

export default async function CrmNotificationsPage() {
  const alerts = await listMyCrmAlerts(50);

  return (
    <div className="space-y-4">
      <section>
        <p className="text-xs font-semibold text-slate-500">고객 누락 방지</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">알림</h1>
        <p className="mt-1 text-sm text-slate-500">
          신규 배분부터 일정·미처리·장기방치까지 한곳에서 확인합니다.
        </p>
      </section>

      <CrmPushSetupCard />

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-950">내 CRM 알림</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              휴대폰 PUSH를 꺼도 앱 안의 알림 기록은 여기서 확인할 수 있습니다.
            </p>
          </div>
          <span className="shrink-0 text-xs font-bold text-slate-400">최근 {alerts.length}건</span>
        </div>

        <div className="space-y-3">
          {alerts.map((alert) => (
            <Link
              key={alert.id}
              href={alert.href}
              className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-black ring-1 ring-inset ${toneClass(alert.tone)}`}
                    >
                      {eventLabel(alert.eventType)}
                    </span>
                    {alert.status && (
                      <span className="text-[11px] font-semibold text-slate-400">{alert.status}</span>
                    )}
                  </div>
                  <p className="mt-2 truncate text-sm font-black text-slate-950">{alert.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{alert.body}</p>
                </div>
                <span className="shrink-0 text-[11px] text-slate-400">
                  {formatKoreaDateTime(alert.createdAt)}
                </span>
              </div>
            </Link>
          ))}

          {alerts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
              지금 확인할 CRM 알림이 없습니다.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
