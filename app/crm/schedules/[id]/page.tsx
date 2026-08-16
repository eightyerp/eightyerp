import Link from "next/link";
import { notFound } from "next/navigation";
import { completeCrmScheduleAction } from "@/app/actions/crm-mobile";
import { getCustomerSchedule } from "@/lib/crm/customer-schedules";

function formatKoreaDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function statusClass(status: string) {
  if (status === "미처리") return "bg-red-50 text-red-700 ring-red-200";
  if (status === "완료") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "연기") return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-sky-50 text-sky-700 ring-sky-200";
}

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CrmScheduleDetailPage({ params }: Props) {
  const { id } = await params;
  const schedule = await getCustomerSchedule(id);
  if (!schedule || schedule.deleted_at) notFound();

  const customer = schedule.customers;
  if (!customer) notFound();
  const isClosed = ["완료", "취소"].includes(schedule.status);

  return (
    <div className="space-y-5">
      <section>
        <Link href="/crm/schedules" className="text-xs font-bold text-slate-500">
          ← 일정
        </Link>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">{schedule.schedule_type}</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{schedule.title}</h1>
            <p className="mt-2 text-sm font-bold text-slate-800">{formatKoreaDateTime(schedule.start_at)}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1.5 text-xs font-black ring-1 ring-inset ${statusClass(schedule.status)}`}>
            {schedule.status}
          </span>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/crm/customers/${customer.id}`} className="text-lg font-black text-slate-950">
              {customer.name}
            </Link>
            <p className="mt-1 text-sm font-semibold text-slate-700">{customer.phone}</p>
            {customer.address && <p className="mt-1 text-xs leading-5 text-slate-500">{customer.address}</p>}
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
            {customer.status}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href={`tel:${customer.phone}`} className="rounded-xl bg-navy-900 px-3 py-3 text-center text-sm font-black text-white">
            전화하기
          </a>
          <Link href={`/crm/customers/${customer.id}#consult`} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-sm font-bold text-slate-700">
            고객 상세
          </Link>
        </div>
      </section>

      {schedule.description && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400">일정 메모</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{schedule.description}</p>
        </section>
      )}

      {isClosed ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-black text-emerald-900">이미 처리된 일정입니다.</p>
          {schedule.result_note && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-800">{schedule.result_note}</p>
          )}
          <Link href={`/crm/customers/${customer.id}`} className="mt-4 inline-flex rounded-xl bg-emerald-900 px-4 py-2.5 text-xs font-black text-white">
            고객으로 이동
          </Link>
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-base font-black text-slate-950">일정 처리</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              결과 한 줄만 남기고 완료하세요. 다시 연락해야 하면 다음 연락시간을 같이 잡습니다.
            </p>
          </div>

          <form action={completeCrmScheduleAction} className="mt-4 space-y-3">
            <input type="hidden" name="schedule_id" value={schedule.id} />
            <input type="hidden" name="customer_id" value={customer.id} />

            <label className="block text-xs font-bold text-slate-600">
              처리 결과
              <textarea
                name="result_note"
                required
                rows={3}
                placeholder="예: 견적 검토 중, 목요일 다시 연락 요청"
                className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-navy-900"
              />
            </label>

            <label className="block text-xs font-bold text-slate-600">
              다음 연락시간 · 선택
              <input
                type="datetime-local"
                name="next_contact_at"
                className="mt-1.5 w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-slate-800 outline-none focus:border-amber-700"
              />
            </label>

            <button type="submit" className="w-full rounded-xl bg-navy-900 px-4 py-3.5 text-sm font-black text-white">
              완료 처리
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
