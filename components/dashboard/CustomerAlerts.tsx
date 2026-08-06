import { alertCustomers } from "@/lib/sample-data";

const statusStyle: Record<string, string> = {
  미연락: "bg-red-50 text-red-600",
  관리필요: "bg-amber-100 text-amber-900",
};

export default function CustomerAlerts() {
  return (
    <div className="dashboard-card p-5">
      <h3 className="dashboard-section-title">미연락 및 관리 필요 고객</h3>

      <div className="mt-4 space-y-3">
        {alertCustomers.map((customer) => (
          <div
            key={customer.name}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2.5 hover:bg-slate-100"
          >
            <div>
              <p className="text-sm font-medium text-slate-900">
                {customer.name}
              </p>
              <p className="text-xs text-slate-600">{customer.phone}</p>
            </div>
            <div className="text-right">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[customer.status]}`}
              >
                {customer.status}
              </span>
              <p className="mt-1 text-xs text-slate-600">
                {customer.lastContact} · {customer.manager}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
