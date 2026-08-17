import Link from "next/link";
import { notFound } from "next/navigation";
import { createCrmScheduleAction } from "@/app/actions/crm-mobile";
import { getCustomerById } from "@/lib/crm/customers";

const SCHEDULE_TYPES = [
  "전화상담",
  "방문상담",
  "실측",
  "견적작성",
  "견적발송",
  "계약상담",
  "재연락",
  "해피콜",
  "기타",
] as const;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ conflict?: string }>;
};

export default async function CrmNewSchedulePage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const customer = await getCustomerById(id);
  if (!customer || customer.deleted_at) notFound();

  const assignee = customer.employees
    ? [customer.employees.name, customer.employees.title].filter(Boolean).join(" ")
    : "미배정";

  return (
    <div className="space-y-5">
      <section>
        <Link href={`/crm/customers/${id}`} className="text-xs font-bold text-slate-500">
          ← 고객 상세
        </Link>
        <p className="mt-4 text-xs font-semibold text-slate-500">고객 일정</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
          일정 등록
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {customer.name} · 담당 {assignee}
        </p>
      </section>

      {query.conflict === "1" && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-black text-red-900">담당자 일정이 겹칩니다.</p>
          <p className="mt-1 text-xs leading-5 text-red-800">
            같은 시간대에 이미 등록된 일정이 있습니다. 다른 시간을 선택해 주세요.
          </p>
        </div>
      )}

      {!customer.assigned_employee_id ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-black text-amber-900">담당자를 먼저 지정해 주세요.</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">
            담당자가 없는 고객은 직원 일정과 PUSH 대상을 정할 수 없습니다.
          </p>
          <Link
            href={`/customers/${customer.id}/edit`}
            className="mt-4 inline-flex rounded-xl bg-amber-900 px-4 py-2.5 text-xs font-black text-white"
          >
            담당자 지정
          </Link>
        </div>
      ) : (
        <form action={createCrmScheduleAction} className="space-y-4">
          <input type="hidden" name="customer_id" value={customer.id} />

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="space-y-4">
              <label className="block text-xs font-bold text-slate-600">
                일정 유형
                <select
                  name="schedule_type"
                  defaultValue="방문상담"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3.5 text-sm font-bold text-slate-800 outline-none focus:border-navy-900"
                >
                  {SCHEDULE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-bold text-slate-600">
                일정 시간
                <input
                  type="datetime-local"
                  name="start_at"
                  required
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3.5 text-sm text-slate-800 outline-none focus:border-navy-900"
                />
              </label>

              <label className="block text-xs font-bold text-slate-600">
                장소 · 선택
                <input
                  name="location"
                  defaultValue={customer.address ?? ""}
                  placeholder="상담 장소 또는 현장주소"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-navy-900"
                />
              </label>

              <label className="block text-xs font-bold text-slate-600">
                메모 · 선택
                <textarea
                  name="description"
                  rows={3}
                  placeholder="준비사항이나 고객 요청만 짧게 입력"
                  className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-navy-900"
                />
              </label>
            </div>
          </section>

          <button
            type="submit"
            className="w-full rounded-2xl bg-navy-900 px-4 py-4 text-sm font-black text-white"
          >
            일정 등록
          </button>

          <p className="px-2 text-center text-[11px] leading-5 text-slate-400">
            등록된 일정은 CRM 일정과 알림 기준으로 바로 사용됩니다.
          </p>
        </form>
      )}
    </div>
  );
}
