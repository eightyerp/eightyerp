import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ExpensesWorkspace from "@/components/finance/ExpensesWorkspace";
import {
  getExpenseAccess,
  listExpenseAdjustmentEmployees,
  listExpenseProjects,
  listExpenseRequests,
  listSettlementAdjustments,
  listVendors,
} from "@/lib/crm/expenses";

export default async function ExpensePaymentsPage() {
  let access;
  try { access = await getExpenseAccess(); } catch { redirect("/login"); }

  const [projects, vendors, requests, adjustmentEmployees, adjustments] = await Promise.all([
    listExpenseProjects().catch(() => []),
    listVendors().catch(() => []),
    listExpenseRequests().catch(() => []),
    access.isFinanceAdmin ? listExpenseAdjustmentEmployees().catch(() => []) : Promise.resolve([]),
    listSettlementAdjustments().catch(() => []),
  ]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-slate-700">회계 · 정산</p>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-950">지출관리</h1>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-700">
            현장을 고르고 증빙을 촬영·첨부하면 자동인식 초안을 만듭니다. 정산완료 현장은 사후지출로 자동 분류하고,
            실제 현장비용과 다음 정산 조정까지 이력을 보존합니다.
          </p>
        </div>
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