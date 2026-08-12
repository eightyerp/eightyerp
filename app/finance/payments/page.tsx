import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ExpenseEntrySearchV3 from "@/components/finance/ExpenseEntrySearchV3";
import ExpenseTaxEvidencePanel from "@/components/finance/ExpenseTaxEvidencePanel";
import ExpenseWorkspaceV2 from "@/components/finance/ExpenseWorkspaceV2";
import MissingExpenseEvidencePanel from "@/components/finance/MissingExpenseEvidencePanel";
import {
  AdminExpenseWorkCockpit,
  StaffExpenseMyStatus,
} from "@/components/finance/ExpenseWorkCockpit";
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
          <p className="text-sm font-bold text-slate-700">회계 · 정산</p>
          <h1 className="mt-0.5 text-2xl font-black text-slate-950">
            지출등록·관리
          </h1>
          <p className="mt-2 max-w-4xl text-sm font-medium leading-relaxed text-slate-700">
            직원은 현장에서 빠르게 등록하고, 관리자는 승인·지급·사후지출·증빙누락을 위에서부터 처리합니다.
          </p>
        </div>

        {access.isFinanceAdmin ? (
          <AdminExpenseWorkCockpit requests={requests} />
        ) : null}

        <ExpenseEntrySearchV3
          initialProjects={projects}
          vendors={vendors}
          isFinanceAdmin={access.isFinanceAdmin}
        />

        {!access.isFinanceAdmin ? (
          <StaffExpenseMyStatus
            requests={requests}
            employeeId={access.currentEmployeeId}
          />
        ) : null}

        <div
          id="expense-admin-details"
          className="scroll-mt-6 [&>div>section:first-of-type]:hidden"
        >
          <ExpenseWorkspaceV2
            projects={projects}
            vendors={vendors}
            requests={requests}
            adjustmentEmployees={adjustmentEmployees}
            adjustments={adjustments}
            isFinanceAdmin={access.isFinanceAdmin}
          />
        </div>

        {access.isFinanceAdmin ? (
          <MissingExpenseEvidencePanel requests={requests} />
        ) : null}

        {access.isFinanceAdmin ? (
          <ExpenseTaxEvidencePanel requests={requests} />
        ) : null}
      </div>
    </DashboardLayout>
  );
}
