import Link from "next/link";
import CrmTodayWorkList from "@/components/crm/CrmTodayWorkList";
import { getCurrentUserAccess } from "@/lib/crm/access";
import { listCrmCustomersWithoutNextAction } from "@/lib/crm/next-action";
import { getTodayWorkBundle } from "@/lib/crm/today-work";
import {
  filterTodayItems,
  type TodayFocus,
} from "@/lib/crm/today-work-shared";

const FOCUS_ITEMS: Array<{ key: TodayFocus; label: string }> = [
  { key: "all", label: "전체" },
  { key: "contact", label: "연락" },
  { key: "consult", label: "상담" },
  { key: "survey", label: "실측" },
  { key: "overdue", label: "미처리" },
  { key: "next_action", label: "다음 행동 없음" },
];

function parseFocus(value?: string): TodayFocus {
  return FOCUS_ITEMS.some((item) => item.key === value)
    ? (value as TodayFocus)
    : "all";
}

type Props = {
  searchParams: Promise<{ focus?: string }>;
};

export default async function CrmSchedulesPage({ searchParams }: Props) {
  const { focus: focusRaw } = await searchParams;
  const focus = parseFocus(focusRaw);
  const access = await getCurrentUserAccess();
  const employeeId = access.profile?.employee_id ?? null;
  const bundle = await getTodayWorkBundle({ employeeId });
  const items =
    focus === "next_action"
      ? await listCrmCustomersWithoutNextAction({ employeeId, limit: 100 })
      : filterTodayItems(bundle.items, focus, false);

  return (
    <div className="space-y-4">
      <section>
        <p className="text-xs font-semibold text-slate-500">오늘·예정 업무</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">일정</h1>
        <p className="mt-1 text-sm text-slate-500">연락·상담·실측·미처리와 다음 행동 없는 고객을 한곳에서 확인합니다.</p>
      </section>

      <div className="-mx-4 overflow-x-auto px-4 pb-1">
        <div className="flex w-max gap-2">
          {FOCUS_ITEMS.map((item) => {
            const active = item.key === focus;
            const warning = item.key === "overdue" || item.key === "next_action";
            return (
              <Link
                key={item.key}
                href={item.key === "all" ? "/crm/schedules" : `/crm/schedules?focus=${item.key}`}
                className={`rounded-full px-3 py-2 text-xs font-bold whitespace-nowrap ${
                  active
                    ? warning
                      ? "bg-red-600 text-white"
                      : "bg-navy-900 text-white"
                    : warning
                      ? "border border-red-200 bg-white text-red-600"
                      : "border border-slate-200 bg-white text-slate-600"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">처리할 업무 {items.length}건</p>
        <Link href="/schedules" className="text-xs font-bold text-slate-500">
          ERP 전체 일정
        </Link>
      </div>

      <CrmTodayWorkList items={items} />
    </div>
  );
}
