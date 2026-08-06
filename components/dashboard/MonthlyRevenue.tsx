import { monthlyRevenue } from "@/lib/sample-data";

export default function MonthlyRevenue() {
  const maxValue = Math.max(
    ...monthlyRevenue.map((d) => Math.max(d.revenue, d.profit))
  );

  return (
    <div className="dashboard-card p-5">
      <h3 className="dashboard-section-title">월별 매출 및 순이익 현황</h3>
      <p className="mt-1 text-xs text-slate-600">단위: 백만원</p>

      <div className="mt-6 flex items-end justify-between gap-2 sm:gap-4">
        {monthlyRevenue.map((item) => (
          <div key={item.month} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-40 w-full items-end justify-center gap-1">
              <div
                className="w-3 rounded-t bg-navy-700 sm:w-4"
                style={{ height: `${(item.revenue / maxValue) * 100}%` }}
                title={`매출 ${item.revenue}`}
              />
              <div
                className="w-3 rounded-t bg-gold-500 sm:w-4"
                style={{ height: `${(item.profit / maxValue) * 100}%` }}
                title={`순이익 ${item.profit}`}
              />
            </div>
            <span className="text-xs text-slate-600">{item.month}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-center gap-6 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-navy-700" />
          매출
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-gold-500" />
          순이익
        </span>
      </div>
    </div>
  );
}
