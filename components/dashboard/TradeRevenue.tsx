import { tradeRevenue, formatCurrency } from "@/lib/sample-data";

export default function TradeRevenue() {
  return (
    <div className="dashboard-card p-5">
      <h3 className="dashboard-section-title">공종별 매출 현황</h3>

      <div className="mt-4 space-y-3">
        {tradeRevenue.map((item) => (
          <div key={item.trade}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-900">{item.trade}</span>
              <span className="text-slate-600">{formatCurrency(item.amount)}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-navy-700"
                style={{ width: `${item.ratio}%` }}
              />
            </div>
            <p className="mt-0.5 text-right text-xs text-slate-600">
              {item.ratio}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
