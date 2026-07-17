import { todaySchedule } from "@/lib/sample-data";

const typeColor: Record<string, string> = {
  현장: "bg-blue-100 text-blue-700",
  상담: "bg-purple-100 text-purple-700",
  검수: "bg-green-100 text-green-700",
  수금: "bg-amber-100 text-amber-700",
  회의: "bg-navy-800 text-gold-400",
};

export default function TodaySchedule() {
  return (
    <div className="dashboard-card p-5">
      <h3 className="dashboard-section-title">오늘 일정</h3>

      <div className="mt-4 space-y-3">
        {todaySchedule.map((item) => (
          <div
            key={item.time + item.title}
            className="flex items-start gap-3 rounded-lg border border-gray-100 px-3 py-2.5"
          >
            <span className="shrink-0 text-sm font-semibold text-gold-600">
              {item.time}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-800">{item.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeColor[item.type]}`}
                >
                  {item.type}
                </span>
                <span className="text-xs text-gray-400">{item.manager}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
