import type { DashboardCrmStats } from "@/types/database";

type KpiCardsProps = {
  stats?: DashboardCrmStats | null;
};

const colorMap = {
  blue: "border-l-blue-500",
  red: "border-l-red-500",
  amber: "border-l-amber-500",
  indigo: "border-l-indigo-500",
  green: "border-l-emerald-500",
  orange: "border-l-orange-500",
} as const;

export default function KpiCards({ stats }: KpiCardsProps) {
  const cards = [
    {
      label: "신규 고객",
      value: String(stats?.newCount ?? 0),
      unit: "건",
      color: "blue" as const,
    },
    {
      label: "미연락 고객",
      value: String(stats?.noContactCount ?? 0),
      unit: "건",
      color: "red" as const,
    },
    {
      label: "상담중 고객",
      value: String(stats?.consultingCount ?? 0),
      unit: "건",
      color: "amber" as const,
    },
    {
      label: "견적제출 고객",
      value: String(stats?.quoteCount ?? 0),
      unit: "건",
      color: "indigo" as const,
    },
    {
      label: "계약완료 고객",
      value: String(stats?.contractedCount ?? 0),
      unit: "건",
      color: "green" as const,
    },
    {
      label: "연락기한 경과",
      value: String(stats?.overdueCount ?? 0),
      unit: "건",
      color: "orange" as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`dashboard-card border-l-4 ${colorMap[card.color]} p-4`}
        >
          <p className="text-xs text-gray-500">{card.label}</p>
          <p className="mt-1 text-lg font-bold text-gray-900 lg:text-xl">
            {card.value}
            <span className="ml-0.5 text-sm font-normal text-gray-500">
              {card.unit}
            </span>
          </p>
        </div>
      ))}
    </div>
  );
}
