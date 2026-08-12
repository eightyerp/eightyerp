import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ExpensesWorkspace from "@/components/finance/ExpensesWorkspace";
import MissingExpenseEvidencePanel from "@/components/finance/MissingExpenseEvidencePanel";
import { listExpenseProjectsResilient } from "@/lib/crm/expense-projects";
import {
  getExpenseAccess,
  listExpenseAdjustmentEmployees,
  listExpenseRequests,
  listSettlementAdjustments,
  listVendors,
} from "@/lib/crm/expenses";

export default async function ExpensePaymentsPage() {
  let access;
  try {
    access = await getExpenseAccess();
  } catch {
    redirect("/login");
  }

  const [projects, vendors, requests, adjustmentEmployees, adjustments] =
    await Promise.all([
      listExpenseProjectsResilient().catch(() => []),
      listVendors().catch(() => []),
      listExpenseRequests().catch(() => []),
      access.isFinanceAdmin
        ? listExpenseAdjustmentEmployees().catch(() => [])
        : Promise.resolve([]),
      listSettlementAdjustments().catch(() => []),
    ]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-slate-700">회계 · 정산</p>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-950">지출관리</h1>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-700">
            현장을 선택해 금액만 먼저 등록할 수도 있고, 영수증·거래명세서가 있으면 촬영·첨부해
            자동인식할 수 있습니다. 정산완료 현장은 사후지출로 자동 분류하고 실제 현장비용과 다음
            정산 조정까지 이력을 보존합니다.
          </p>
        </div>

        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <p className="font-bold">법인카드 영수증은 없어도 등록할 수 있습니다.</p>
          <p className="mt-1 text-xs leading-relaxed">
            직원이 먼저 금액을 등록하거나, 관리자가 카드 승인문자·법인카드 내역을 확인해 직접 등록할 수 있습니다.
            영수증이 나중에 확보되면 별도로 증빙을 추가하면 됩니다.
          </p>
        </div>

        {access.isFinanceAdmin ? (
          <MissingExpenseEvidencePanel requests={requests} />
        ) : null}

        <ExpensesWorkspace
          projects={projects}
          vendors={vendors}
          requests={requests}
          adjustmentEmployees={adjustmentEmployees}
          adjustments={adjustments}
          isFinanceAdmin={access.isFinanceAdmin}
        />
      </div>
    </DashboardLayout>
  );
}
