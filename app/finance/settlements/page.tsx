import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import SettlementWorkspace2026 from "@/components/finance/SettlementWorkspace2026";
import {
  getSettlementAccess,
  listSettlementEmployees,
  listSettlementLines,
  listSettlementSummaries2026,
} from "@/lib/crm/settlements";

export default async function EmployeeSettlementsPage() {
  let access;
  try {
    access = await getSettlementAccess();
  } catch {
    redirect("/login");
  }

  const [summaries, employees] = await Promise.all([
    listSettlementSummaries2026().catch(() => []),
    access.isFinanceAdmin ? listSettlementEmployees().catch(() => []) : Promise.resolve([]),
  ]);
  const lines = await listSettlementLines(summaries.map((row) => row.id)).catch(() => []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-bold text-slate-700">회계 · 정산</p>
          <h1 className="mt-0.5 text-2xl font-black text-slate-950">직원 정산</h1>
          <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-700">
            2026년 실제 지급일 기준으로 관리합니다. 기존 지급분은 큰 금액으로 간편 이관하고,
            ERP 도입 이후 정산은 현장손익·추가인센·사후조정을 연결해 관리합니다.
          </p>
        </div>

        <SettlementWorkspace2026
          summaries={summaries}
          lines={lines}
          employees={employees}
          isFinanceAdmin={access.isFinanceAdmin}
        />
      </div>
    </DashboardLayout>
  );
}
