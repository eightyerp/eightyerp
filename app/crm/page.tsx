import Link from "next/link";
import CrmTodayWorkList from "@/components/crm/CrmTodayWorkList";
import { getCurrentUserAccess } from "@/lib/crm/access";
import { listCrmMobileCustomers } from "@/lib/crm/crm-mobile-customer-list";
import { getCrmMobileHomeBundle } from "@/lib/crm/crm-mobile-home";
import { listCrmCustomersWithoutNextAction } from "@/lib/crm/next-action";
import type { TodayWorkItem } from "@/lib/crm/today-work-shared";

function SummaryCard({
  label,
  value,
  href,
  alert = false,
  wide = false,
}: {
  label: string;
  value: number;
  href: string;
  alert?: boolean;
  wide?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        alert && value > 0 ? "border-red-200" : "border-slate-200"
      } ${wide ? "col-span-2" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className={`text-xs font-semibold ${alert && value > 0 ? "text-red-600" : "text-slate-500"}`}>
          {label}
        </p>
        {wide && value > 0 && <span className="text-xs font-bold text-slate-400">확인 ›</span>}
      </div>
      <p className={`mt-2 text-2xl font-black tracking-tight ${alert && value > 0 ? "text-red-700" : "text-slate-950"}`}>
        {value}
      </p>
    </Link>
  );
}

function mergePriorityItems(
  bundleItems: TodayWorkItem[],
  nextActionItems: TodayWorkItem[],
): TodayWorkItem[] {
  const overdue = bundleItems.filter((item) => item.isOverdue);
  const normal = bundleItems.filter((item) => !item.isOverdue);
  return [...overdue, ...nextActionItems, ...normal];
}

export default async function CrmHomePage() {
  const access = await getCurrentUserAccess();
  const employeeId = access.profile?.employee_id ?? null;

  const [bundleResult, newCustomerResult, nextActionResult] = await Promise.allSettled([
    getCrmMobileHomeBundle({ employeeId }),
    listCrmMobileCustomers({
      status: "신규",
      page: 1,
      pageSize: 1,
    }),
    listCrmCustomersWithoutNextAction({ employeeId, limit: 50 }),
  ]);

  const bundle = bundleResult.status === "fulfilled" ? bundleResult.value : null;
  const newCustomerCount =
    newCustomerResult.status === "fulfilled" ? newCustomerResult.value.total : 0;
  const nextActionItems =
    nextActionResult.status === "fulfilled" ? nextActionResult.value : [];
  const priorityItems = mergePriorityItems(bundle?.items ?? [], nextActionItems);
  const loadError =
    bundleResult.status === "rejected"
      ? bundleResult.reason instanceof Error
        ? bundleResult.reason.message
        : "오늘 할 일을 불러오지 못했습니다."
      : null;

  const profileEmployeeName = access.profile?.employees?.name?.trim();
  const profileName = access.profile?.full_name?.trim();
  const userName =
    profileEmployeeName ||
    (profileName ? profileName.split(/\s+/)[0] : null) ||
    "직원";
  const todayScheduleCount = bundle
    ? bundle.summary.todayConsult +
      bundle.summary.todaySurvey +
      bundle.summary.todayQuoteWrite +
      bundle.summary.todayQuoteSend +
      bundle.summary.todayContract
    : 0;

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold text-slate-500">오늘의 영업</p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight text-slate-950">
              {userName}님, 오늘 할 일입니다.
            </h1>
            <p className="mt-1 text-sm text-slate-500">고객을 놓치지 않도록 급한 순서부터 보여드립니다.</p>
          </div>
          <Link
            href="/crm/customers"
            className="shrink-0 rounded-full bg-navy-900 px-4 py-2 text-xs font-bold text-white"
          >
            고객 찾기
          </Link>
        </div>
      </section>

      {loadError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3">
        <SummaryCard label="신규 문의" value={newCustomerCount} href="/crm/customers?status=신규" />
        <SummaryCard label="오늘 연락" value={bundle?.summary.todayContact ?? 0} href="/crm/schedules?focus=contact" />
        <SummaryCard label="오늘 일정" value={todayScheduleCount} href="/crm/schedules" />
        <SummaryCard
          label="미처리"
          value={bundle?.summary.overdue ?? 0}
          href="/crm/schedules?focus=overdue"
          alert
        />
        <SummaryCard
          label="다음 행동 없음"
          value={nextActionItems.length}
          href="/crm/schedules?focus=next_action"
          alert
          wide
        />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-slate-950">우선 처리</h2>
            <p className="mt-0.5 text-xs text-slate-500">미처리 → 다음 행동 없음 → 긴급·예정시간 순으로 확인합니다.</p>
          </div>
          <Link href="/crm/schedules" className="text-xs font-bold text-navy-900">
            전체 보기
          </Link>
        </div>
        <CrmTodayWorkList items={priorityItems} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-900">영업 파이프라인</p>
            <p className="mt-0.5 text-xs text-slate-500">신규 → 상담 → 견적 → 계약 진행 고객을 확인합니다.</p>
          </div>
          <Link
            href="/crm/customers?view=pipeline"
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
          >
            열기
          </Link>
        </div>
      </section>
    </div>
  );
}
