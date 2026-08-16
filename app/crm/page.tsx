import Link from "next/link";
import { Suspense } from "react";
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

function SummarySkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${wide ? "col-span-2" : ""}`}
    >
      <div className="h-3 w-16 rounded bg-slate-100" />
      <div className="mt-3 h-7 w-10 rounded bg-slate-100" />
    </div>
  );
}

function PrimarySummarySkeleton() {
  return (
    <>
      <SummarySkeleton />
      <SummarySkeleton />
      <SummarySkeleton />
      <SummarySkeleton />
    </>
  );
}

function PrioritySkeleton() {
  return (
    <section className="space-y-3" aria-hidden="true">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-4 w-20 rounded bg-slate-100" />
          <div className="mt-2 h-3 w-48 rounded bg-slate-100" />
        </div>
      </div>
      <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="h-4 w-24 rounded bg-slate-100" />
        <div className="mt-3 h-3 w-40 rounded bg-slate-100" />
      </div>
    </section>
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

type HomeBundlePromise = ReturnType<typeof getCrmMobileHomeBundle>;
type NewCustomerPromise = ReturnType<typeof listCrmMobileCustomers>;
type NextActionPromise = ReturnType<typeof listCrmCustomersWithoutNextAction>;

async function PrimarySummaryCards({
  bundlePromise,
  newCustomerPromise,
}: {
  bundlePromise: HomeBundlePromise;
  newCustomerPromise: NewCustomerPromise;
}) {
  const [bundleResult, newCustomerResult] = await Promise.allSettled([
    bundlePromise,
    newCustomerPromise,
  ]);
  const bundle = bundleResult.status === "fulfilled" ? bundleResult.value : null;
  const newCustomerCount =
    newCustomerResult.status === "fulfilled" ? newCustomerResult.value.total : 0;
  const todayScheduleCount = bundle
    ? bundle.summary.todayConsult +
      bundle.summary.todaySurvey +
      bundle.summary.todayQuoteWrite +
      bundle.summary.todayQuoteSend +
      bundle.summary.todayContract
    : 0;

  return (
    <>
      <SummaryCard label="신규 문의" value={newCustomerCount} href="/crm/customers?status=신규" />
      <SummaryCard label="오늘 연락" value={bundle?.summary.todayContact ?? 0} href="/crm/schedules?focus=contact" />
      <SummaryCard label="오늘 일정" value={todayScheduleCount} href="/crm/schedules" />
      <SummaryCard
        label="미처리"
        value={bundle?.summary.overdue ?? 0}
        href="/crm/schedules?focus=overdue"
        alert
      />
      {bundleResult.status === "rejected" && (
        <div className="col-span-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {bundleResult.reason instanceof Error
            ? bundleResult.reason.message
            : "오늘 할 일을 불러오지 못했습니다."}
        </div>
      )}
    </>
  );
}

async function NextActionSummaryCard({
  nextActionPromise,
}: {
  nextActionPromise: NextActionPromise;
}) {
  const result = await Promise.allSettled([nextActionPromise]);
  const nextActionItems = result[0].status === "fulfilled" ? result[0].value : [];
  return (
    <SummaryCard
      label="다음 행동 없음"
      value={nextActionItems.length}
      href="/crm/schedules?focus=next_action"
      alert
      wide
    />
  );
}

async function PrioritySection({
  bundlePromise,
  nextActionPromise,
}: {
  bundlePromise: HomeBundlePromise;
  nextActionPromise: NextActionPromise;
}) {
  const [bundleResult, nextActionResult] = await Promise.allSettled([
    bundlePromise,
    nextActionPromise,
  ]);
  const bundleItems = bundleResult.status === "fulfilled" ? bundleResult.value.items : [];
  const nextActionItems =
    nextActionResult.status === "fulfilled" ? nextActionResult.value : [];
  const priorityItems = mergePriorityItems(bundleItems, nextActionItems);

  return (
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
  );
}

export default async function CrmHomePage() {
  const access = await getCurrentUserAccess();
  const employeeId = access.profile?.employee_id ?? null;

  // 느린 업무 데이터가 CRM 앱 셸/인사말의 첫 렌더를 막지 않도록
  // Promise만 시작하고 Suspense 경계 안에서 병렬 스트리밍한다.
  const bundlePromise = getCrmMobileHomeBundle({ employeeId });
  const newCustomerPromise = listCrmMobileCustomers({
    status: "신규",
    employeeId: employeeId ?? undefined,
    page: 1,
    pageSize: 1,
  });
  const nextActionPromise = listCrmCustomersWithoutNextAction({ employeeId, limit: 50 });

  const profileEmployeeName = access.profile?.employees?.name?.trim();
  const profileName = access.profile?.full_name?.trim();
  const userName =
    profileEmployeeName ||
    (profileName ? profileName.split(/\s+/)[0] : null) ||
    "직원";

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

      <section className="grid grid-cols-2 gap-3">
        <Suspense fallback={<PrimarySummarySkeleton />}>
          <PrimarySummaryCards
            bundlePromise={bundlePromise}
            newCustomerPromise={newCustomerPromise}
          />
        </Suspense>
        <Suspense fallback={<SummarySkeleton wide />}>
          <NextActionSummaryCard nextActionPromise={nextActionPromise} />
        </Suspense>
      </section>

      <Suspense fallback={<PrioritySkeleton />}>
        <PrioritySection
          bundlePromise={bundlePromise}
          nextActionPromise={nextActionPromise}
        />
      </Suspense>

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
