import Link from "next/link";
import type { TodayWorkItem } from "@/lib/crm/today-work-shared";

function formatTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function badgeClass(item: TodayWorkItem) {
  if (item.isOverdue || item.badge === "경고") {
    return "bg-red-50 text-red-700 ring-red-200";
  }
  if (item.badge === "계약") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (item.badge === "견적") return "bg-violet-50 text-violet-700 ring-violet-200";
  if (item.badge === "실측") return "bg-sky-50 text-sky-700 ring-sky-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function itemHref(item: TodayWorkItem) {
  if (item.source === "schedule") return `/crm/schedules/${item.sourceId}`;
  if (item.customerId) return `/crm/customers/${item.customerId}`;
  if (item.quoteId) return `/quotes/${item.quoteId}`;
  return "/crm/schedules";
}

export default function CrmTodayWorkList({ items }: { items: TodayWorkItem[] }) {
  const activeItems = items.filter((item) => !item.isCompleted).slice(0, 8);

  if (activeItems.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-9 text-center shadow-sm">
        <p className="text-sm font-semibold text-slate-800">지금 처리할 업무가 없습니다.</p>
        <p className="mt-1 text-xs text-slate-500">새 일정이나 다음 연락이 생기면 여기에 바로 표시됩니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {activeItems.map((item) => {
        const time = formatTime(item.startAt ?? item.dueAt);
        return (
          <Link
            key={item.id}
            href={itemHref(item)}
            className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-1 text-[11px] font-bold ring-1 ring-inset ${badgeClass(item)}`}>
                    {item.isOverdue ? "미처리" : item.badge}
                  </span>
                  {time && <span className="text-xs font-semibold text-slate-500">{time}</span>}
                </div>
                <p className="mt-2 truncate text-base font-bold text-slate-950">
                  {item.customerName || item.title}
                </p>
                {item.customerName && (
                  <p className="mt-0.5 truncate text-xs text-slate-600">{item.title}</p>
                )}
                {item.address && (
                  <p className="mt-1 truncate text-xs text-slate-500">{item.address}</p>
                )}
              </div>
              <span className="shrink-0 text-xs font-semibold text-slate-400">›</span>
            </div>
            {(item.employeeName || item.phone) && (
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span className="truncate">{item.employeeName ? `담당 ${item.employeeName}` : "담당자 확인"}</span>
                {item.phone && <span className="font-medium text-slate-700">{item.phone}</span>}
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}
