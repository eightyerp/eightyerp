import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ExpensesWorkspace from "@/components/finance/ExpensesWorkspace";
import { getExpenseAccess, listExpenseProjects, listExpenseRequests, listVendors } from "@/lib/crm/expenses";

export default async function ExpensePaymentsPage() {
  let access;
  try { access = await getExpenseAccess(); } catch { redirect("/login"); }

  const [projects, vendors, requests] = await Promise.all([
    listExpenseProjects().catch(() => []),
    listVendors().catch(() => []),
    listExpenseRequests().catch(() => []),
  ]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-slate-700">회계 · 정산</p>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-950">지출관리</h1>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-700">
            모든 지출은 현장을 선택해 등록합니다. 영수증·거래명세서를 첨부하면 자동인식 초안을 만들고,
            거래처 연결 또는 신규 거래처 후보 등록 후 관리자 승인·지급까지 관리합니다.
          </p>
        </div>
        <ExpensesWorkspace
          projects={projects}
          vendors={vendors}
          requests={requests}
          isFinanceAdmin={access.isFinanceAdmin}
        />
      </div>
    </DashboardLayout>
  );
}