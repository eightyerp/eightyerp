import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CollectionsWorkspace from "@/components/finance/CollectionsWorkspace";
import { getCurrentUserAccess } from "@/lib/crm/access";
import {
  getCollectionAccess,
  listCollectionContracts,
  listCollectionReceipts,
} from "@/lib/crm/collections";

type CollectionsPageProps = {
  searchParams: Promise<{ customerId?: string }>;
};

export default async function CollectionsPage({
  searchParams,
}: CollectionsPageProps) {
  const { customerId } = await searchParams;
  const access = await getCurrentUserAccess();
  if (!access.isAuthenticated) redirect("/login");
  if (!access.canAccessErp) redirect("/pending-approval");

  let loadError: string | null = null;
  let collectionAccess = {
    isFinanceAdmin: false,
    companyRole: null as string | null,
    currentEmployeeId: access.profile?.employee_id ?? null,
  };
  let contracts = [] as Awaited<ReturnType<typeof listCollectionContracts>>;
  let receipts = [] as Awaited<ReturnType<typeof listCollectionReceipts>>;

  try {
    [collectionAccess, contracts, receipts] = await Promise.all([
      getCollectionAccess(),
      listCollectionContracts(),
      listCollectionReceipts(),
    ]);
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "수금관리 정보를 불러오지 못했습니다.";
  }

  const initialContractId = customerId
    ? contracts.find((contract) => contract.customers?.id === customerId)?.id
    : undefined;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-slate-700">회계·정산</p>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-950">수금관리</h1>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-600">
            계약별 실제 수금 원장을 관리합니다. 관리자는 계좌입금·카드·현금을 즉시 확정하고,
            직원은 현장에서 받은 카드·현금을 등록해 관리자 확인을 요청할 수 있습니다.
          </p>
        </div>

        {loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {loadError}
          </div>
        ) : (
          <CollectionsWorkspace
            contracts={contracts}
            receipts={receipts}
            isFinanceAdmin={collectionAccess.isFinanceAdmin}
            initialContractId={initialContractId}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
