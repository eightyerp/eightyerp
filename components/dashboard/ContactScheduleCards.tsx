import Link from "next/link";
import type { DashboardCrmStats } from "@/types/database";

type ContactScheduleCardsProps = {
  stats: DashboardCrmStats;
};

const cards = [
  {
    key: "today" as const,
    label: "오늘 연락할 고객",
    href: "/customers?contact=today",
    color: "border-l-gold-500",
    getValue: (s: DashboardCrmStats) => s.todayContactCount,
  },
  {
    key: "overdue" as const,
    label: "연락기한 경과 고객",
    href: "/customers?contact=overdue",
    color: "border-l-red-500",
    getValue: (s: DashboardCrmStats) => s.overdueCount,
  },
  {
    key: "week" as const,
    label: "이번 주 연락예정 고객",
    href: "/customers?contact=this_week",
    color: "border-l-orange-500",
    getValue: (s: DashboardCrmStats) => s.weekContactCount,
  },
];

export default function ContactScheduleCards({
  stats,
}: ContactScheduleCardsProps) {
  return (
    <section className="space-y-3">
      <h2 className="dashboard-section-title">다음 연락 관리</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className={`dashboard-card border-l-4 ${card.color} block p-4 transition hover:bg-gray-50`}
          >
            <p className="text-xs text-gray-500">{card.label}</p>
            <p className="mt-1 text-xl font-bold text-gray-900">
              {card.getValue(stats)}
              <span className="ml-0.5 text-sm font-normal text-gray-500">건</span>
            </p>
            <p className="mt-2 text-xs text-navy-800">고객 목록에서 확인 →</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
