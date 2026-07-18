import Link from "next/link";
import type { CustomerSchedule, ProjectProcessSchedule } from "@/types/database";

export type AssigneeScheduleSummary = {
  employeeId: string;
  employeeName: string;
  todayCount: number;
  unhandledCount: number;
  delayedCount: number;
  weekCount: number;
};

type Props = {
  customerToday: CustomerSchedule[];
  customerUnhandled: CustomerSchedule[];
  todaySurvey: CustomerSchedule[];
  todayQuoteSend: CustomerSchedule[];
  weekUpcoming: CustomerSchedule[];
  processToday: ProjectProcessSchedule[];
  processDelayed: ProjectProcessSchedule[];
  byAssignee?: AssigneeScheduleSummary[];
};

export default function ScheduleDashboardCards({
  customerToday,
  customerUnhandled,
  todaySurvey,
  todayQuoteSend,
  weekUpcoming,
  processToday,
  processDelayed,
  byAssignee,
}: Props) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="dashboard-section-title">일정 현황</h2>
        <div className="flex gap-2 text-xs">
          <Link href="/schedules/customers" className="text-navy-800 underline">
            고객상담 스케줄
          </Link>
          <span className="text-gray-300">·</span>
          <Link href="/schedules/processes" className="text-navy-800 underline">
            공사 스케줄
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          title="오늘 상담 일정"
          count={customerToday.length}
          href="/schedules/customers"
          accent="navy"
        >
          {customerToday.slice(0, 4).map((s) => (
            <li key={s.id} className="truncate">
              <span className="text-gray-400">{formatTime(s.start_at)}</span>{" "}
              {s.customers?.name ?? "-"} · {s.title}
            </li>
          ))}
        </SummaryCard>

        <SummaryCard
          title="지난 미처리 일정"
          count={customerUnhandled.length}
          href="/schedules/customers"
          accent="red"
        >
          {customerUnhandled.slice(0, 4).map((s) => (
            <li key={s.id} className="truncate">
              {s.customers?.name ?? "-"} · {s.title}
            </li>
          ))}
        </SummaryCard>

        <SummaryCard
          title="오늘 실측 일정"
          count={todaySurvey.length}
          href="/schedules/customers"
          accent="navy"
        >
          {todaySurvey.slice(0, 4).map((s) => (
            <li key={s.id} className="truncate">
              <span className="text-gray-400">{formatTime(s.start_at)}</span>{" "}
              {s.customers?.name ?? "-"}
            </li>
          ))}
        </SummaryCard>

        <SummaryCard
          title="오늘 견적발송 일정"
          count={todayQuoteSend.length}
          href="/schedules/customers"
          accent="navy"
        >
          {todayQuoteSend.slice(0, 4).map((s) => (
            <li key={s.id} className="truncate">
              <span className="text-gray-400">{formatTime(s.start_at)}</span>{" "}
              {s.customers?.name ?? "-"}
            </li>
          ))}
        </SummaryCard>

        <SummaryCard
          title="7일 이내 예정 상담"
          count={weekUpcoming.length}
          href="/schedules/customers"
          accent="navy"
        >
          {weekUpcoming.slice(0, 4).map((s) => (
            <li key={s.id} className="truncate">
              {new Date(s.start_at).toLocaleDateString("ko-KR")} ·{" "}
              {s.customers?.name ?? "-"}
            </li>
          ))}
        </SummaryCard>

        <SummaryCard
          title="오늘 진행 공정"
          count={processToday.length}
          href="/schedules/processes"
          accent="navy"
        >
          {processToday.slice(0, 4).map((s) => (
            <li key={s.id} className="truncate">
              {s.projects?.name ?? s.customers?.name ?? "-"} · {s.process_name}
            </li>
          ))}
        </SummaryCard>
      </div>

      {processDelayed.length > 0 && (
        <SummaryCard
          title="지연된 공정"
          count={processDelayed.length}
          href="/schedules/processes"
          accent="red"
        >
          {processDelayed.slice(0, 4).map((s) => (
            <li key={s.id} className="truncate">
              {s.projects?.name ?? s.customers?.name ?? "-"} · {s.process_name}
            </li>
          ))}
        </SummaryCard>
      )}

      {byAssignee && byAssignee.length > 0 && (
        <div className="dashboard-card overflow-x-auto">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-navy-900">
              담당자별 미처리 현황
            </h3>
          </div>
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                <th className="px-3 py-2">담당자</th>
                <th className="px-3 py-2">오늘 상담</th>
                <th className="px-3 py-2">이번주 상담</th>
                <th className="px-3 py-2">미처리</th>
                <th className="px-3 py-2">지연 공정</th>
              </tr>
            </thead>
            <tbody>
              {byAssignee.map((a) => (
                <tr key={a.employeeId} className="border-b border-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {a.employeeName}
                  </td>
                  <td className="px-3 py-2">{a.todayCount}</td>
                  <td className="px-3 py-2">{a.weekCount}</td>
                  <td
                    className={`px-3 py-2 ${a.unhandledCount > 0 ? "font-semibold text-red-600" : ""}`}
                  >
                    {a.unhandledCount}
                  </td>
                  <td
                    className={`px-3 py-2 ${a.delayedCount > 0 ? "font-semibold text-red-600" : ""}`}
                  >
                    {a.delayedCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SummaryCard({
  title,
  count,
  href,
  accent,
  children,
}: {
  title: string;
  count: number;
  href: string;
  accent: "navy" | "red";
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="dashboard-card block p-4 transition hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            accent === "red"
              ? "bg-red-50 text-red-700"
              : "bg-navy-800/5 text-navy-800"
          }`}
        >
          {count}건
        </span>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-gray-600">
        {children}
        {count === 0 && <li className="text-gray-300">해당 일정이 없습니다.</li>}
      </ul>
    </Link>
  );
}
