import type { DashboardCrmStats } from "@/types/database";
import { STATUS_BADGE_CLASS } from "@/lib/crm/constants";

type CrmStatusPanelsProps = {
  stats: DashboardCrmStats;
};

export default function CrmStatusPanels({ stats }: CrmStatusPanelsProps) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="dashboard-card p-5">
        <h3 className="dashboard-section-title">상담단계별 고객 수</h3>
        <div className="mt-4 space-y-2">
          {stats.byStatus.length === 0 && (
            <p className="text-sm text-slate-600">표시할 데이터가 없습니다.</p>
          )}
          {stats.byStatus
            .slice()
            .sort((a, b) => b.count - a.count)
            .map((item) => (
              <div
                key={item.status}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2"
              >
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                    STATUS_BADGE_CLASS[item.status] ?? "bg-slate-100 text-slate-900"
                  }`}
                >
                  {item.status}
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {item.count}건
                </span>
              </div>
            ))}
        </div>
      </section>

      <section className="dashboard-card p-5">
        <h3 className="dashboard-section-title">담당자별 상담 고객</h3>
        <div className="mt-4 space-y-2">
          {stats.byAssignee.length === 0 && (
            <p className="text-sm text-slate-600">표시할 데이터가 없습니다.</p>
          )}
          {stats.byAssignee
            .slice()
            .sort((a, b) => b.count - a.count)
            .map((item) => (
              <div
                key={item.employeeId ?? "unassigned"}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2"
              >
                <span className="text-sm text-slate-900">{item.name}</span>
                <span className="text-sm font-semibold text-slate-900">
                  {item.count}건
                </span>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
