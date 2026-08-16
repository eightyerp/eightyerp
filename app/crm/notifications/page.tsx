import Link from "next/link";
import { listMyCustomerPushes } from "@/lib/crm/customer-push";

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

export default async function CrmNotificationsPage() {
  const pushes = await listMyCustomerPushes(20);

  return (
    <div className="space-y-4">
      <section>
        <p className="text-xs font-semibold text-slate-500">고객 알림</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">알림</h1>
        <p className="mt-1 text-sm text-slate-500">회사에서 배분된 고객과 놓치면 안 되는 업무를 확인합니다.</p>
      </section>

      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
        <p className="text-sm font-bold text-sky-900">모바일 푸시 연결 준비 중</p>
        <p className="mt-1 text-xs leading-5 text-sky-700">현재 저장된 고객 배분 알림부터 CRM에서 확인할 수 있습니다. 기기 Web Push는 구독 저장·중복방지·시간 알림 검증 후 직원 테스트에서 활성화합니다.</p>
      </div>

      <section className="space-y-3">
        {pushes.map((push) => (
          <Link key={push.id} href={`/crm/customers/${push.customerId}`} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">배분고객</span>
                  {push.status && <span className="text-[11px] font-semibold text-slate-400">{push.status}</span>}
                </div>
                <p className="mt-2 truncate text-base font-black text-slate-950">{push.customerName}</p>
                <p className="mt-1 text-sm font-medium text-slate-700">{push.phone}</p>
                {push.address && <p className="mt-1 truncate text-xs text-slate-500">{push.address}</p>}
              </div>
              <span className="shrink-0 text-[11px] text-slate-400">{formatKoreaDateTime(push.createdAt)}</span>
            </div>
          </Link>
        ))}
        {pushes.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
            아직 받은 고객 배분 알림이 없습니다.
          </div>
        )}
      </section>
    </div>
  );
}
