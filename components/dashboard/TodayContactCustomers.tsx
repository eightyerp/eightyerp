import Link from "next/link";
import { STATUS_BADGE_CLASS, formatEmployeeLabel } from "@/lib/crm/constants";
import type { ContactScheduleItem, Employee } from "@/types/database";

type TodayContactCustomersProps = {
  items: ContactScheduleItem[];
  employees: Employee[];
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ko-KR");
}

export default function TodayContactCustomers({
  items,
  employees,
}: TodayContactCustomersProps) {
  const employeeMap = new Map(
    employees.map((employee) => [employee.id, employee]),
  );

  return (
    <section className="dashboard-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="dashboard-section-title">오늘 연락 고객</h2>
          <p className="mt-1 text-xs text-slate-600">
            next_contact_at 기준 · CRM 고객관리와 자동 연동
          </p>
        </div>
        <Link
          href="/customers?contact=today"
          className="text-xs font-medium text-navy-800 hover:underline"
        >
          전체 보기 →
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-slate-600">
          오늘 연락 예정인 고객이 없습니다.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-50">
          {items.slice(0, 8).map((item) => {
            const employee = item.assigned_employee_id
              ? employeeMap.get(item.assigned_employee_id)
              : null;
            return (
              <li key={item.id}>
                <Link
                  href={`/customers/${item.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-slate-100/80"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {item.name}
                    </p>
                    <p className="text-xs text-slate-600">
                      {item.phone}
                      {employee
                        ? ` · ${formatEmployeeLabel(employee.name, employee.title)}`
                        : " · 미배정"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        STATUS_BADGE_CLASS[item.status] ??
                        "bg-slate-100 text-slate-900"
                      }`}
                    >
                      {item.status}
                    </span>
                    <span className="text-xs text-gold-600">
                      {formatDate(item.next_contact_at)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
