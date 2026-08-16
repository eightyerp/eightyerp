import Link from "next/link";
import { notFound } from "next/navigation";
import { updateCrmCustomerStatusAction } from "@/app/actions/crm-mobile";
import { getCustomerById } from "@/lib/crm/customers";
import type { CustomerStatus } from "@/types/database";

const STATUS_OPTIONS: Array<{ value: CustomerStatus; label: string; group: string }> = [
  { value: "신규", label: "신규", group: "초기" },
  { value: "미연락", label: "미연락", group: "초기" },
  { value: "1차 연락완료", label: "1차 연락완료", group: "상담" },
  { value: "상담중", label: "상담중", group: "상담" },
  { value: "방문예약", label: "방문예약", group: "일정" },
  { value: "실측예약", label: "실측예약", group: "일정" },
  { value: "견적작성중", label: "견적작성중", group: "견적" },
  { value: "견적제출", label: "견적제출", group: "견적" },
  { value: "계약협의", label: "계약협의", group: "계약" },
  { value: "계약완료", label: "계약완료", group: "계약" },
  { value: "시공예정", label: "시공예정", group: "시공" },
  { value: "시공중", label: "시공중", group: "시공" },
  { value: "완료", label: "완료", group: "종료" },
  { value: "보류", label: "보류", group: "종료" },
  { value: "연락두절", label: "연락두절", group: "종료" },
  { value: "취소", label: "취소", group: "종료" },
];

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CrmCustomerStatusPage({ params }: Props) {
  const { id } = await params;
  const customer = await getCustomerById(id);
  if (!customer || customer.deleted_at) notFound();

  return (
    <div className="space-y-5">
      <section>
        <Link href={`/crm/customers/${id}`} className="text-xs font-bold text-slate-500">
          ← 고객 상세
        </Link>
        <p className="mt-4 text-xs font-semibold text-slate-500">빠른 진행단계 변경</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{customer.name}</h1>
        <p className="mt-1 text-sm text-slate-500">현재 상태를 바꾸면 파이프라인과 고객카드에 즉시 반영됩니다.</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-slate-500">현재 단계</span>
          <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-700 ring-1 ring-inset ring-sky-200">
            {customer.status}
          </span>
        </div>

        <form action={updateCrmCustomerStatusAction} className="mt-5 space-y-4">
          <input type="hidden" name="customer_id" value={customer.id} />
          <label className="block text-xs font-bold text-slate-600">
            변경할 단계
            <select
              name="status"
              defaultValue={customer.status}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3.5 text-sm font-bold text-slate-800 outline-none focus:border-navy-900"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.group} · {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="w-full rounded-xl bg-navy-900 px-4 py-3.5 text-sm font-black text-white">
            상태 변경 저장
          </button>
        </form>
      </section>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        진행 중 고객을 `보류·연락두절·취소·완료`로 바꿀 때는 실제 고객 상황을 확인한 뒤 변경합니다. 상태 변경 이력은 기존 고객 활동 기록에 남습니다.
      </div>
    </div>
  );
}
