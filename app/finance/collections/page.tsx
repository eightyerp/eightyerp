import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CollectionLedgerTable from "@/components/finance/CollectionLedgerTable";
import CollectionsWorkspace from "@/components/finance/CollectionsWorkspace";
import FinanceDateRangeToolbar from "@/components/finance/FinanceDateRangeToolbar";
import FinanceLedgerPagination from "@/components/finance/FinanceLedgerPagination";
import { getCurrentUserAccess } from "@/lib/crm/access";
import {
  COLLECTION_LEDGER_DATE_FIELDS,
  listCollectionLedgerPage,
  listCollectionPendingQueue,
  normalizeCollectionLedgerDateField,
} from "@/lib/crm/collection-ledger";
import { listCollectionContracts } from "@/lib/crm/collections";
import { normalizeDateRange } from "@/lib/date-range";

const FINANCE_ADMIN_ROLES = new Set(["owner", "director", "admin"]);

type CollectionsPageProps = {
  searchParams: Promise<{
    customerId?: string;
    dateField?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

export default async function CollectionsPage({
  searchParams,
}: CollectionsPageProps) {
  const params = await searchParams;
  const access = await getCurrentUserAccess();
  if (!access.isAuthenticated) redirect("/login");
  if (!access.canAccessErp) redirect("/pending-approval");

  const dateField = normalizeCollectionLedgerDateField(params.dateField);
  const normalizedRange = normalizeDateRange(params.from, params.to);
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const isFinanceAdmin = Boolean(
    access.companyRole && FINANCE_ADMIN_ROLES.has(access.companyRole),
  );

  let loadError: string | null = normalizedRange.error;
  let lookupWarning: string | null = null;
  let contracts = [] as Awaited<ReturnType<typeof listCollectionContracts>>;
  let ledger = {
    receipts: [],
    total: 0,
    page,
    totalPages: 1,
  } as Awaited<ReturnType<typeof listCollectionLedgerPage>>;
  let pendingQueue = {
    receipts: [],
    total: 0,
    truncated: false,
  } as Awaited<ReturnType<typeof listCollectionPendingQueue>>;

  if (!loadError) {
    const [contractsResult, ledgerResult, pendingResult] = await Promise.allSettled([
      listCollectionContracts(),
      listCollectionLedgerPage({
        dateField,
        from: normalizedRange.from,
        to: normalizedRange.to,
        page,
        customerId: params.customerId,
      }),
      isFinanceAdmin
        ? listCollectionPendingQueue()
        : Promise.resolve(pendingQueue),
    ]);

    if (contractsResult.status === "fulfilled") {
      contracts = contractsResult.value;
    } else {
      loadError = "수금 등록용 계약 목록을 불러오지 못했습니다.";
    }

    if (ledgerResult.status === "fulfilled") {
      ledger = ledgerResult.value;
    } else {
      loadError =
        loadError ||
        (ledgerResult.reason instanceof Error
          ? ledgerResult.reason.message
          : "수금 원장을 불러오지 못했습니다.");
    }

    if (pendingResult.status === "fulfilled") {
      pendingQueue = pendingResult.value;
    } else if (isFinanceAdmin) {
      lookupWarning =
        "수금 원장은 정상 조회되지만 직원 수금 확인대기 업무함을 불러오지 못했습니다.";
    }
  }

  const initialContractId = params.customerId
    ? contracts.find((contract) => contract.customers?.id === params.customerId)?.id
    : undefined;
  const dateFieldLabel =
    COLLECTION_LEDGER_DATE_FIELDS.find((item) => item.value === dateField)?.label ??
    "실제 수금일";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-slate-700">회계·정산</p>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-950">수금관리</h1>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-600">
            계약별 실제 수금 원장을 관리합니다. 조회기간은 원장에만 적용되고,
            직원 수금 확인대기는 기간과 무관하게 계속 표시됩니다.
          </p>
        </div>

        <FinanceDateRangeToolbar
          pathname="/finance/collections"
          dateField={dateField}
          defaultDateField="received_at"
          from={normalizedRange.from}
          to={normalizedRange.to}
          dateFields={COLLECTION_LEDGER_DATE_FIELDS}
          label="수금 조회기간"
        />

        {lookupWarning ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            {lookupWarning}
          </div>
        ) : null}

        {pendingQueue.truncated ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            확인대기 총 {pendingQueue.total.toLocaleString("ko-KR")}건 중 최근 {pendingQueue.receipts.length.toLocaleString("ko-KR")}건을 상세 표시합니다.
            원장 조회기간과 무관한 업무함이며, 오래된 대기건이 있다는 사실은 숨기지 않습니다.
          </div>
        ) : null}

        {loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {loadError}
          </div>
        ) : (
          <>
            <div
              className={
                isFinanceAdmin
                  ? "[&>div>section:nth-of-type(4)]:hidden"
                  : "[&>div>section:nth-of-type(3)]:hidden"
              }
            >
              <CollectionsWorkspace
                contracts={contracts}
                receipts={isFinanceAdmin ? pendingQueue.receipts : []}
                isFinanceAdmin={isFinanceAdmin}
                initialContractId={initialContractId}
              />
            </div>

            <CollectionLedgerTable
              receipts={ledger.receipts}
              total={ledger.total}
              isFinanceAdmin={isFinanceAdmin}
              dateFieldLabel={dateFieldLabel}
              range={{ from: normalizedRange.from, to: normalizedRange.to }}
            />

            <FinanceLedgerPagination
              pathname="/finance/collections"
              page={ledger.page}
              totalPages={ledger.totalPages}
              total={ledger.total}
              searchParams={{
                customerId: params.customerId,
                dateField:
                  dateField === "received_at" ? undefined : dateField,
                from: normalizedRange.from || undefined,
                to: normalizedRange.to || undefined,
              }}
            />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
