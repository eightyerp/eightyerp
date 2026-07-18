export type TodayFocus =
  | "all"
  | "consult"
  | "survey"
  | "quote_write"
  | "quote_send"
  | "contract"
  | "overdue"
  | "contact"
  | "expiring"
  | "task"
  | "quote"
  | "unhandled"
  | "done";

export type TodayWorkBadge =
  | "상담"
  | "실측"
  | "견적"
  | "연락"
  | "내부업무"
  | "경고"
  | "계약";

export type TodayWorkItem = {
  id: string;
  kind: string;
  badge: TodayWorkBadge;
  title: string;
  customerId: string | null;
  customerName: string | null;
  phone: string | null;
  address: string | null;
  employeeId: string | null;
  employeeName: string | null;
  priority: string | null;
  status: string | null;
  startAt: string | null;
  dueAt: string | null;
  amount: number | null;
  memo: string | null;
  completedAt: string | null;
  source: "schedule" | "customer" | "quote" | "task";
  sourceId: string;
  isCompleted: boolean;
  isOverdue: boolean;
  isUrgent: boolean;
  scheduleType?: string | null;
  quoteId?: string | null;
  recentConsult?: string | null;
};

export type AssigneeTodayStats = {
  employeeId: string;
  employeeName: string;
  todayCount: number;
  overdueCount: number;
  completedCount: number;
  totalCount: number;
  completionRate: number;
  hasUrgent: boolean;
  hasNoSchedule: boolean;
  oldestOverdueHours: number | null;
};

export type TodayWorkBundleAccess = {
  canViewAll: boolean;
  canViewTeam: boolean;
  employeeId: string | null;
  teamId: string | null;
  role: string | null;
  userName: string | null;
};

export type TodayWorkSummary = {
  todayConsult: number;
  todaySurvey: number;
  todayQuoteWrite: number;
  todayQuoteSend: number;
  todayContract: number;
  overdue: number;
  todayContact: number;
  expiringQuotes: number;
};

export function filterTodayItems(
  items: TodayWorkItem[],
  focus: TodayFocus,
  showCompleted: boolean,
): TodayWorkItem[] {
  let rows = items;
  if (!showCompleted) rows = rows.filter((i) => !i.isCompleted);

  switch (focus) {
    case "consult":
      return rows.filter(
        (i) =>
          i.source === "schedule" &&
          ["전화상담", "방문상담", "재연락", "해피콜", "기타"].includes(
            i.scheduleType ?? "",
          ),
      );
    case "survey":
      return rows.filter((i) => i.kind === "survey" || i.scheduleType === "실측");
    case "quote_write":
      return rows.filter(
        (i) => i.kind === "quote_write" || i.scheduleType === "견적작성",
      );
    case "quote_send":
      return rows.filter(
        (i) => i.kind === "quote_send" || i.scheduleType === "견적발송",
      );
    case "contract":
      return rows.filter(
        (i) =>
          i.kind === "contract" ||
          i.kind === "quote_contract" ||
          i.scheduleType === "계약상담",
      );
    case "overdue":
    case "unhandled":
      return rows.filter((i) => i.isOverdue || i.kind === "overdue");
    case "contact":
      return rows.filter((i) => i.kind === "contact");
    case "expiring":
      return rows.filter((i) => i.kind === "expiring");
    case "task":
      return rows.filter((i) => i.kind === "task");
    case "quote":
      return rows.filter(
        (i) =>
          i.badge === "견적" ||
          i.kind.startsWith("quote") ||
          i.scheduleType === "견적작성" ||
          i.scheduleType === "견적발송",
      );
    case "done":
      return items.filter((i) => i.isCompleted);
    default:
      return rows;
  }
}

export function formatOverdueLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return "방금 지남";
  if (hours < 24) return `${hours}시간 지남`;
  const days = Math.floor(hours / 24);
  return `${days}일 지남`;
}
