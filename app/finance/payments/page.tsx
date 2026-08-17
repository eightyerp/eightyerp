import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ExpenseEntrySearchV3 from "@/components/finance/ExpenseEntrySearchV3";
import ExpenseLedgerTable from "@/components/finance/ExpenseLedgerTable";
import ExpenseTaxEvidencePanel from "@/components/finance/ExpenseTaxEvidencePanel";
import ExpenseWorkspaceV2 from "@/components/finance/ExpenseWorkspaceV2";
import FinanceDateRangeToolbar from "@/components/finance/FinanceDateRangeToolbar";
import FinanceLedgerPagination from "@/components/finance/FinanceLedgerPagination";
import MissingExpenseEvidencePanel from "@/components/finance/MissingExpenseEvidencePanel";
import {
  AdminExpenseWorkCockpit,
  StaffExpenseMyStatus,
} from "@/components/finance/ExpenseWorkCockpit";
import { listExpenseProjectsResilient } from "@/lib/crm/expense-projects";
import {
  EXPENSE_LEDGER_DATE_FIELDS,
  listExpenseActionQueue,
  listExpenseLedgerPage,
  listExpenseMissingEvidenceQueue,
  listExpenseTaxEvidenceQueue,
  normalizeExpenseLedgerDateField,
  type ExpenseWorkQueueResult,
} from "@/lib/crm/expense-ledger";
import type { ExpenseRequestRecord } from "@/lib/crm/expense-shared";
import {
  getExpenseAccess,
  listExpenseAdjustmentEmployees,
  listExpenseRequests,
  listSettlementAdjustments,
  listVendors,
} from "@/lib/crm/expenses";
import { normalizeDateRange } from "@/lib/date-range";

type ExpensePaymentsPageProps = {
  searchParams: Promise<{
    dateField?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

function emptyQueue(): ExpenseWorkQueueResult {
  return { requests: [], total: 0, truncated: false };
}

function mergeExpenseRequests(
  primary: ExpenseRequestRecord[],
  secondary: ExpenseRequestRecord[],
): ExpenseRequestRecord[] {
  const merged = new Map<string, ExpenseRequestRecord>();
  for (const row of [...primary, ...secondary]) merged.set(row.id, row);
  return Array.from(merged.values()).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}

export default async function ExpensePaymentsPage({
  searchParams,
}: ExpensePaymentsPageProps) {
  const params = await searchParams;
  let access;
  try {
    access = await getExpenseAccess();
  } catch {
    redirect("/login");
  }

  const dateField = normalizeExpenseLedgerDateField(params.dateField);
  const normalizedRange = normalizeDateRange(params.from, params.to);
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  let loadError: string | null = normalizedRange.error;
  let supportWarning: string | null = null;
  let projects = [] as Awaited<ReturnType<typeof listExpenseProjectsResilient>>;
  let vendors = [] as Awaited<ReturnType<typeof listVendors>>;
  let ledger = {
    requests: [],
    total: 0,
    page,
    totalPages: 1,
  } as Awaited<ReturnType<typeof listExpenseLedgerPage>>;
  let actionQueue = emptyQueue();
  let missingEvidenceQueue = emptyQueue();
  let taxEvidenceQueue = emptyQueue();
  let staffRecentRequests: ExpenseRequestRecord[] = [];
  let adjustmentEmployees = [] as Awaited<
    ReturnType<typeof listExpenseAdjustmentEmployees>
  >;
  let adjustments = [] as Awaited<ReturnType<typeof listSettlementAdjustments>>;

  if (!loadError) {
    const [
      projectResult,
      vendorResult,
      ledgerResult,
      actionResult,
      missingEvidenceResult,
      taxEvidenceResult,
      staffRecentResult,
      employeeResult,
      adjustmentResult,
    ] = await Promise.allSettled([
      listExpenseProjectsResilient(),
      listVendors(),
      listExpenseLedgerPage({
        dateField,
        from: normalizedRange.from,
        to: normalizedRange.to,
        page,
      }),
      listExpenseActionQueue(),
      access.isFinanceAdmin
        ? listExpenseMissingEvidenceQueue()
        : Promise.resolve(emptyQueue()),
      access.isFinanceAdmin
        ? listExpenseTaxEvidenceQueue()
        : Promise.resolve(emptyQueue()),
      access.isFinanceAdmin
        ? Promise.resolve([] as ExpenseRequestRecord[])
        : listExpenseRequests(100),
      access.isFinanceAdmin
        ? listExpenseAdjustmentEmployees()
        : Promise.resolve([]),
      listSettlementAdjustments(),
    ]);

    if (projectResult.status === "fulfilled") projects = projectResult.value;
    else supportWarning = "현장 목록을 불러오지 못했습니다.";

    if (vendorResult.status === "fulfilled") vendors = vendorResult.value;
    else supportWarning = supportWarning || "거래처 목록을 불러오지 못했습니다.";

    if (ledgerResult.status === "fulfilled") ledger = ledgerResult.value;
    else {
      loadError =
        ledgerResult.reason instanceof Error
          ? ledgerResult.reason.message
          : "지출 원장을 불러오지 못했습니다.";
    }

    if (actionResult.status === "fulfilled") actionQueue = actionResult.value;
    else {
      supportWarning =
        supportWarning ||
        "지출 원장은 조회되지만 승인·지급 업무함을 불러오지 못했습니다.";
    }

    if (missingEvidenceResult.status === "fulfilled") {
      missingEvidenceQueue = missingEvidenceResult.value;
    } else if (access.isFinanceAdmin) {
      supportWarning =
        supportWarning || "증빙 미첨부 업무함을 불러오지 못했습니다.";
    }

    if (taxEvidenceResult.status === "fulfilled") {
      taxEvidenceQueue = taxEvidenceResult.value;
    } else if (access.isFinanceAdmin) {
      supportWarning =
        supportWarning || "세무증빙 미확인 업무함을 불러오지 못했습니다.";
    }

    if (staffRecentResult.status === "fulfilled") {
      staffRecentRequests = staffRecentResult.value;
    } else if (!access.isFinanceAdmin) {
      supportWarning =
        supportWarning || "내 최근 지출 상태를 불러오지 못했습니다.";
    }

    if (employeeResult.status === "fulfilled") {
      adjustmentEmployees = employeeResult.value;
    } else if (access.isFinanceAdmin) {
      supportWarning =
        supportWarning || "정산 조정용 직원 목록을 불러오지 못했습니다.";
    }

    if (adjustmentResult.status === "fulfilled") adjustments = adjustmentResult.value;
    else {
      supportWarning =
        supportWarning || "정산 조정 내역을 불러오지 못했습니다.";
    }
  }

  const workflowRequests = mergeExpenseRequests(
    actionQueue.requests,
    missingEvidenceQueue.requests,
  );
  const dateFieldLabel =
    EXPENSE_LEDGER_DATE_FIELDS.find((item) => item.value === dateField)?.label ??
    "지출일";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-bold text-slate-700">회계 · 정산</p>
          <h1 className="mt-0.5 text-2xl font-black text-slate-950">
            지출등록·관리
          </h1>
          <p className="mt-2 max-w-4xl text-sm font-medium leading-relaxed text-slate-700">
            조회기간은 지출 원장에만 적용됩니다. 승인대기·지급대기·증빙보완은 기간과 상관없이 계속 확인할 수 있습니다.
          </p>
        </div>

        <FinanceDateRangeToolbar
          pathname="/finance/payments"
          dateField={dateField}
          defaultDateField="expense_date"
          from={normalizedRange.from}
          to={normalizedRange.to}
          dateFields={EXPENSE_LEDGER_DATE_FIELDS}
          label="지출 조회기간"
        />

        {supportWarning ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            {supportWarning}
          </div>
        ) : null}

        {actionQueue.truncated ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            미처리 업무 총 {actionQueue.total.toLocaleString("ko-KR")}건 중 최근 {actionQueue.requests.length.toLocaleString("ko-KR")}건을 상세 표시합니다.
            조회기간과 무관한 업무함이며, 추가 미처리 건이 있다는 사실은 숨기지 않습니다.
          </div>
        ) : null}

        {missingEvidenceQueue.truncated ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-900">
            증빙 미첨부 총 {missingEvidenceQueue.total.toLocaleString("ko-KR")}건 중 최근 {missingEvidenceQueue.requests.length.toLocaleString("ko-KR")}건을 표시합니다.
          </div>
        ) : null}

        {taxEvidenceQueue.truncated ? (
          <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-900">
            세무증빙 미확인 총 {taxEvidenceQueue.total.toLocaleString("ko-KR")}건 중 최근 {taxEvidenceQueue.requests.length.toLocaleString("ko-KR")}건을 표시합니다.
          </div>
        ) : null}

        {loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {loadError}
          </div>
        ) : (
          <>
            {access.isFinanceAdmin ? (
              <AdminExpenseWorkCockpit requests={workflowRequests} />
            ) : null}

            <ExpenseEntrySearchV3
              initialProjects={projects}
              vendors={vendors}
              isFinanceAdmin={access.isFinanceAdmin}
            />

            {!access.isFinanceAdmin ? (
              <StaffExpenseMyStatus
                requests={staffRecentRequests}
                employeeId={access.currentEmployeeId}
              />
            ) : null}

            <div
              id="expense-admin-details"
              className={
                access.isFinanceAdmin
                  ? "scroll-mt-6 [&>div>section:first-of-type]:hidden [&>div>section:nth-of-type(2)]:hidden [&>div>section:last-of-type]:hidden"
                  : "scroll-mt-6 [&>div>section:first-of-type]:hidden [&>div>section:last-of-type]:hidden"
              }
            >
              <ExpenseWorkspaceV2
                projects={projects}
                vendors={vendors}
                requests={actionQueue.requests}
                adjustmentEmployees={adjustmentEmployees}
                adjustments={adjustments}
                isFinanceAdmin={access.isFinanceAdmin}
              />
            </div>

            <ExpenseLedgerTable
              requests={ledger.requests}
              total={ledger.total}
              dateFieldLabel={dateFieldLabel}
              range={{ from: normalizedRange.from, to: normalizedRange.to }}
            />

            <FinanceLedgerPagination
              pathname="/finance/payments"
              page={ledger.page}
              totalPages={ledger.totalPages}
              total={ledger.total}
              searchParams={{
                dateField:
                  dateField === "expense_date" ? undefined : dateField,
                from: normalizedRange.from || undefined,
                to: normalizedRange.to || undefined,
              }}
            />

            {access.isFinanceAdmin ? (
              <MissingExpenseEvidencePanel
                requests={missingEvidenceQueue.requests}
              />
            ) : null}

            {access.isFinanceAdmin ? (
              <ExpenseTaxEvidencePanel requests={taxEvidenceQueue.requests} />
            ) : null}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
