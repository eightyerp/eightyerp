import Link from "next/link";
import type { CustomerSchedule } from "@/types/database";

type Props = {
  items?: CustomerSchedule[];
};

export default function TodaySchedule({ items = [] }: Props) {
  return (
    <div className="dashboard-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="dashboard-section-title">오늘 상담 일정</h3>
        <Link
          href="/schedules/customers"
          className="text-xs text-navy-800 underline"
        >
          전체
        </Link>
      </div>

      <div className="mt-4 space-y-3">
        {items.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-600">
            오늘 예정된 상담 일정이 없습니다.
          </p>
        )}
        {items.slice(0, 6).map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-3 rounded-lg border border-gray-100 px-3 py-2.5"
          >
            <span className="shrink-0 text-sm font-semibold text-gold-600">
              {new Date(item.start_at).toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">{item.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-navy-800/5 px-2 py-0.5 text-xs font-medium text-navy-800">
                  {item.schedule_type}
                </span>
                <span className="text-xs text-slate-600">
                  {item.customers?.name ?? "-"}
                  {item.employees ? ` · ${item.employees.name}` : ""}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
