import { staffPerformance, formatCurrency } from "@/lib/sample-data";

export default function StaffPerformanceTable() {
  return (
    <div className="dashboard-card overflow-hidden p-5">
      <h3 className="dashboard-section-title">담당자별 실적 현황</h3>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-slate-600">
              <th className="pb-3 pr-4 font-medium">담당자</th>
              <th className="pb-3 pr-4 font-medium text-center">상담 고객</th>
              <th className="pb-3 pr-4 font-medium text-center">계약 고객</th>
              <th className="pb-3 pr-4 font-medium text-right">계약 금액</th>
              <th className="pb-3 font-medium text-right">미수금</th>
            </tr>
          </thead>
          <tbody>
            {staffPerformance.map((staff) => (
              <tr
                key={staff.name}
                className="border-b border-gray-50 hover:bg-slate-100/80"
              >
                <td className="py-3 pr-4">
                  <p className="font-medium text-slate-900">{staff.name}</p>
                  <p className="text-xs text-slate-600">{staff.role}</p>
                </td>
                <td className="py-3 pr-4 text-center text-slate-900">
                  {staff.consulting}건
                </td>
                <td className="py-3 pr-4 text-center text-slate-900">
                  {staff.contracted}건
                </td>
                <td className="py-3 pr-4 text-right font-medium text-slate-900">
                  {formatCurrency(staff.amount)}
                </td>
                <td className="py-3 text-right text-orange-600">
                  {formatCurrency(staff.unpaid)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
