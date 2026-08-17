import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { saveCrmConsultationAction } from "@/app/actions/crm-mobile";
import {
  getCrmCustomerDetail,
  listCrmCustomerRecentConsults,
  listCrmCustomerUpcomingSchedules,
  type CrmCustomerDetail,
  type CrmCustomerRecentConsult,
  type CrmCustomerUpcomingSchedule,
} from "@/lib/crm/crm-customer-detail";
import { getCustomerAgeDays } from "@/lib/crm/customer-age";
import { listCustomerCollectionReceipts } from "@/lib/crm/collections";
import {
  listCustomerContractSummaries,
  type CustomerContractSummary,
} from "@/lib/crm/contracts";

const TERMINAL_STATUSES = new Set(["완료", "보류", "연락두절", "취소"]);
const INACTIVE_CONTRACT_STATUSES = new Set(["draft", "cancelled", "terminated"]);
const WINDOW_LAB_MARKER = /^\[window lab\]\s*/i;

type UpcomingPromise = ReturnType<typeof listCrmCustomerUpcomingSchedules>;
type ConsultPromise = ReturnType<typeof listCrmCustomerRecentConsults>;
type ContractPromise = ReturnType<typeof listCustomerContractSummaries>;
type CollectionPromise = ReturnType<typeof listCustomerCollectionReceipts>;

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function contractBasisAmount(contract: CustomerContractSummary) {
  return Number(contract.cumulative_contract_amount ?? contract.contract_amount ?? 0);
}

function contractOutstandingAmount(contract: CustomerContractSummary) {
  return Math.max(0, contractBasisAmount(contract) - Number(contract.received_amount ?? 0));
}

function formatKoreaDateTime(value: string | null | undefined) {
  if (!value) return "-";
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

function formatReceivedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function scheduleStatusClass(status: string) {
  if (status === "미처리") return "bg-red-50 text-red-700";
  if (status === "연기") return "bg-amber-50 text-amber-800";
  return "bg-sky-50 text-sky-700";
}

function PanelSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="h-4 w-28 rounded bg-slate-100" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-10 rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

function UpcomingSchedule({ schedule }: { schedule: CrmCustomerUpcomingSchedule }) {
  return (
    <Link
      href={`/crm/schedules/${schedule.id}`}
      prefetch={false}
      className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-950">{schedule.title}</p>
          <p className="mt-1 text-xs text-slate-500">
            {formatKoreaDateTime(schedule.start_at)} · {schedule.schedule_type}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${scheduleStatusClass(schedule.status)}`}>
          {schedule.status}
        </span>
      </div>
    </Link>
  );
}

function ConsultLog({ log }: { log: CrmCustomerRecentConsult }) {
  const isWindowLab = WINDOW_LAB_MARKER.test(log.consult_content);
  const content = isWindowLab
    ? log.consult_content.replace(WINDOW_LAB_MARKER, "").trim()
    : log.consult_content;
  const shouldCollapse = isWindowLab && (content.length > 240 || content.split("\n").length > 6);

  return (
    <div className="border-b border-slate-100 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">
            {log.consult_type}
          </span>
          {isWindowLab && (
            <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-800 ring-1 ring-inset ring-blue-200">
              Window Lab · 창호상담
            </span>
          )}
        </div>
        <span className="text-[11px] text-slate-400">{formatKoreaDateTime(log.created_at)}</span>
      </div>
      {shouldCollapse ? (
        <details className="mt-2 rounded-xl bg-blue-50/60 px-3 py-2">
          <summary className="cursor-pointer text-sm font-bold text-blue-900">창호 상담요약 보기</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{content}</p>
        </details>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{content}</p>
      )}
      {log.next_contact_date && (
        <p className="mt-2 text-xs font-semibold text-amber-700">다음 연락 {log.next_contact_date}</p>
      )}
    </div>
  );
}

async function NextActionWarning({
  customer,
  upcomingPromise,
}: {
  customer: CrmCustomerDetail;
  upcomingPromise: UpcomingPromise;
}) {
  const result = await Promise.allSettled([upcomingPromise]);
  const upcoming = result[0].status === "fulfilled" ? result[0].value : [];
  const needsNextAction =
    !TERMINAL_STATUSES.has(customer.status) &&
    upcoming.length === 0 &&
    !customer.next_contact_at;

  if (!needsNextAction) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-amber-900">다음 행동이 없습니다</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">
            진행 중인 고객입니다. 다음 연락 또는 일정을 잡아두면 CRM 홈에서 놓치지 않게 관리됩니다.
          </p>
        </div>
        <a href="#consult" className="shrink-0 rounded-xl bg-amber-900 px-3 py-2 text-xs font-black text-white">
          바로 등록
        </a>
      </div>
    </div>
  );
}

async function UpcomingSchedulesSection({ upcomingPromise }: { upcomingPromise: UpcomingPromise }) {
  const result = await Promise.allSettled([upcomingPromise]);
  const upcoming = result[0].status === "fulfilled" ? result[0].value : [];

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-950">예정 일정</h2>
          <p className="mt-0.5 text-xs text-slate-500">가장 가까운 고객 일정만 표시합니다.</p>
        </div>
        <Link href="/crm/schedules" className="text-xs font-bold text-navy-900">전체 일정</Link>
      </div>
      <div className="space-y-2.5">
        {upcoming.map((schedule) => <UpcomingSchedule key={schedule.id} schedule={schedule} />)}
        {upcoming.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-7 text-center text-sm text-slate-500">
            예정된 일정이 없습니다.
          </div>
        )}
      </div>
    </section>
  );
}

async function RecentConsultSection({ consultPromise }: { consultPromise: ConsultPromise }) {
  const result = await Promise.allSettled([consultPromise]);
  const consultLogs = result[0].status === "fulfilled" ? result[0].value : [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-black text-slate-950">최근 상담</h2>
        <span className="text-xs font-semibold text-slate-400">최근 {consultLogs.length}건</span>
      </div>
      <div className="mt-2">
        {consultLogs.map((log) => <ConsultLog key={log.id} log={log} />)}
        {consultLogs.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">등록된 상담기록이 없습니다.</p>
        )}
      </div>
    </section>
  );
}

async function FinanceSummarySection({
  customerId,
  contractPromise,
  collectionPromise,
}: {
  customerId: string;
  contractPromise: ContractPromise;
  collectionPromise: CollectionPromise;
}) {
  const [contractResult, collectionResult] = await Promise.allSettled([
    contractPromise,
    collectionPromise,
  ]);
  const financeReady = contractResult.status === "fulfilled" && collectionResult.status === "fulfilled";
  const contracts = contractResult.status === "fulfilled" ? contractResult.value : [];
  const collectionReceipts = collectionResult.status === "fulfilled" ? collectionResult.value : [];
  const activeContracts = contracts.filter(
    (contract) => contract.contract_kind === "original" && !INACTIVE_CONTRACT_STATUSES.has(contract.status),
  );
  const contractTotal = activeContracts.reduce((sum, contract) => sum + contractBasisAmount(contract), 0);
  const receivedTotal = activeContracts.reduce((sum, contract) => sum + Number(contract.received_amount ?? 0), 0);
  const outstandingTotal = activeContracts.reduce((sum, contract) => sum + contractOutstandingAmount(contract), 0);
  const pendingTotal = collectionReceipts
    .filter((receipt) => receipt.status === "pending")
    .reduce((sum, receipt) => sum + Number(receipt.amount ?? 0), 0);
  const financeHref = `/finance/collections?customerId=${encodeURIComponent(customerId)}`;

  return (
    <section className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-950">계약 · 수금 현황</h2>
          <p className="mt-0.5 text-xs text-slate-500">영업 확인용 요약이며 등록·승인은 ERP에서 처리합니다.</p>
        </div>
        <Link href={financeHref} prefetch={false} className="shrink-0 rounded-xl bg-emerald-800 px-3 py-2 text-xs font-black text-white">
          상세
        </Link>
      </div>
      {financeReady ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-sky-50 px-3 py-3">
            <p className="text-[11px] font-semibold text-sky-700">계약 기준금액</p>
            <p className="mt-1 text-sm font-black text-sky-950">{formatMoney(contractTotal)}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 px-3 py-3">
            <p className="text-[11px] font-semibold text-emerald-700">확정 수금</p>
            <p className="mt-1 text-sm font-black text-emerald-950">{formatMoney(receivedTotal)}</p>
          </div>
          <div className="rounded-xl bg-red-50 px-3 py-3">
            <p className="text-[11px] font-semibold text-red-700">미수금</p>
            <p className="mt-1 text-sm font-black text-red-900">{formatMoney(outstandingTotal)}</p>
          </div>
          <div className="rounded-xl bg-amber-50 px-3 py-3">
            <p className="text-[11px] font-semibold text-amber-700">확인대기</p>
            <p className="mt-1 text-sm font-black text-amber-900">{formatMoney(pendingTotal)}</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-800">
          수금 현황을 불러오지 못했습니다. 금액을 0원으로 추정하지 않고 ERP에서 다시 확인합니다.
        </div>
      )}
    </section>
  );
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
};

export default async function CrmCustomerDetailPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const customer = await getCrmCustomerDetail(id);
  if (!customer || customer.deleted_at) notFound();

  // 고객 기본정보/전화 버튼의 첫 렌더를 막지 않도록 독립 데이터는 Promise만 시작한다.
  const upcomingPromise = listCrmCustomerUpcomingSchedules(id, 3);
  const consultPromise = listCrmCustomerRecentConsults(id, 8);
  const contractPromise = listCustomerContractSummaries(id);
  const collectionPromise = listCustomerCollectionReceipts(id, 100);

  const assignee = customer.employees
    ? [customer.employees.name, customer.employees.title].filter(Boolean).join(" ")
    : "미배정";
  const ageDays = getCustomerAgeDays(customer.created_at);
  const windowLabBase = (
    process.env.NEXT_PUBLIC_WINDOW_LAB_BASE_URL || "https://eighty-window-lab.vercel.app"
  ).replace(/\/+$/, "");
  const windowLabHref = `${windowLabBase}/?${new URLSearchParams({ customerId: id }).toString()}`;

  return (
    <div className="space-y-5">
      <section>
        <Link href="/crm/customers" className="text-xs font-bold text-slate-500">← 고객</Link>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-black tracking-tight text-slate-950">{customer.name}</h1>
              <span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-700 ring-1 ring-inset ring-sky-200">
                {customer.status}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-700">{customer.phone}</p>
            {customer.address && <p className="mt-1 text-sm text-slate-500">{customer.address}</p>}
          </div>
          <div className="shrink-0 text-right">
            <span className="inline-flex rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{assignee}</span>
            <p className="mt-2 text-[11px] font-semibold text-slate-400">접수 D+{ageDays}</p>
          </div>
        </div>
      </section>

      {query.saved === "consult" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          상담기록을 저장했습니다. 다음 연락시간을 입력했다면 재연락 일정도 함께 등록되었습니다.
        </div>
      )}

      <Suspense fallback={null}>
        <NextActionWarning customer={customer} upcomingPromise={upcomingPromise} />
      </Suspense>

      <section className="grid grid-cols-3 gap-2">
        <a href={`tel:${customer.phone}`} className="rounded-2xl bg-navy-900 px-2 py-3 text-center text-xs font-bold text-white">전화</a>
        <a href={`sms:${customer.phone}`} className="rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center text-xs font-bold text-slate-700">문자</a>
        <a href="#consult" className="rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center text-xs font-bold text-slate-700">상담기록</a>
        <Link href={`/crm/customers/${customer.id}/schedule/new`} prefetch={false} className="rounded-2xl border border-amber-200 bg-amber-50 px-2 py-3 text-center text-xs font-black text-amber-900">일정 잡기</Link>
        <Link href={`/crm/customers/${customer.id}/status`} prefetch={false} className="rounded-2xl border border-sky-200 bg-sky-50 px-2 py-3 text-center text-xs font-bold text-sky-800">상태 변경</Link>
        <Link href={`/quotes/new?customerId=${customer.id}`} prefetch={false} className="rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center text-xs font-bold text-slate-700">견적</Link>
      </section>

      <a
        href={windowLabHref}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm"
      >
        <div>
          <p className="text-sm font-black text-blue-950">창호 전문상담 연결</p>
          <p className="mt-0.5 text-xs text-blue-800">같은 고객정보로 Window Lab 창호상담을 시작합니다.</p>
        </div>
        <span className="shrink-0 text-sm font-black text-blue-900">열기 ↗</span>
      </a>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div><p className="text-slate-400">상담 유형</p><p className="mt-1 font-bold text-slate-800">{customer.consultation_type || "-"}</p></div>
          <div><p className="text-slate-400">유입 경로</p><p className="mt-1 font-bold text-slate-800">{customer.lead_sources?.name || "-"}</p></div>
          <div><p className="text-slate-400">다음 연락일</p><p className="mt-1 font-bold text-slate-800">{customer.next_contact_at || "미정"}</p></div>
          <div><p className="text-slate-400">현재 단계</p><p className="mt-1 font-bold text-slate-800">{customer.status}</p></div>
          <div><p className="text-slate-400">접수일</p><p className="mt-1 font-bold text-slate-800">{formatReceivedDate(customer.created_at)}</p></div>
          <div>
            <p className="text-slate-400">접수 경과</p>
            <p className={`mt-1 font-black ${ageDays >= 14 ? "text-red-700" : ageDays >= 7 ? "text-amber-800" : "text-slate-800"}`}>D+{ageDays}</p>
          </div>
        </div>
      </section>

      <Suspense fallback={<PanelSkeleton rows={2} />}>
        <UpcomingSchedulesSection upcomingPromise={upcomingPromise} />
      </Suspense>

      <section id="consult" className="scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-base font-black text-slate-950">상담기록 · 다음 연락</h2>
          <p className="mt-0.5 text-xs text-slate-500">고객 반응을 짧게 남기고 다음 연락시간까지 한 번에 잡습니다.</p>
        </div>
        <form action={saveCrmConsultationAction} className="mt-4 space-y-3">
          <input type="hidden" name="customer_id" value={customer.id} />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-slate-600">
              상담유형
              <select name="consult_type" defaultValue="전화" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-800 outline-none focus:border-navy-900">
                <option>전화</option><option>방문</option><option>카카오톡</option><option>문자</option><option>이메일</option><option>기타</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600">
              다음 연락시간
              <input type="datetime-local" name="next_contact_at" className="mt-1.5 w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-slate-800 outline-none focus:border-amber-700" />
            </label>
          </div>
          <label className="block text-xs font-bold text-slate-600">
            상담내용
            <textarea name="consult_content" required rows={3} placeholder="예: 견적 검토 중, 목요일 오후 다시 연락" className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-navy-900" />
          </label>
          <button type="submit" className="w-full rounded-xl bg-navy-900 px-4 py-3 text-sm font-black text-white">상담기록 저장</button>
          {!customer.assigned_employee_id && (
            <p className="text-xs font-semibold text-amber-700">담당자가 없는 고객은 먼저 담당자를 배정한 뒤 다음 연락 일정을 등록해 주세요.</p>
          )}
        </form>
      </section>

      <Suspense fallback={<PanelSkeleton rows={3} />}>
        <RecentConsultSection consultPromise={consultPromise} />
      </Suspense>

      <Suspense fallback={<PanelSkeleton rows={2} />}>
        <FinanceSummarySection
          customerId={customer.id}
          contractPromise={contractPromise}
          collectionPromise={collectionPromise}
        />
      </Suspense>
    </div>
  );
}
