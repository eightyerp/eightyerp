import { listEmployeeTasks } from "@/lib/crm/employee-tasks";
import { koreaDayBounds, toKoreaDateKey } from "@/lib/crm/korea-date";
import { createClient } from "@/lib/supabase-server";
import { getCurrentUserAccess } from "@/lib/crm/access";
import type { TodayWorkBadge, TodayWorkItem } from "@/lib/crm/today-work-shared";
import type { EmployeeTask } from "@/types/database";

const ACTIVE_SCHEDULE_STATUSES = ["예정", "진행중", "미처리", "연기"];
const ACTIVE_QUOTE_STATUSES = ["작성중", "검토중", "발송완료", "수정요청", "승인"];

const SCHEDULE_SELECT = `
  id, customer_id, assigned_employee_id, schedule_type, title, description,
  start_at, end_at, status, priority, result_note, next_contact_at, completed_at,
  customers ( id, name, phone, address, status ),
  employees ( id, name, title, team_id )
`;

const QUOTE_SELECT = `
  id, customer_id, assigned_employee_id, created_by, title, status,
  final_amount, memo, sent_at, created_at, valid_until, is_contract_quote,
  customers:customers!quotes_customer_id_fkey (
    id, name, phone, address, assigned_employee_id, status
  ),
  employees ( id, name, title, team_id )
`;

type PersonRelation = {
  id?: string;
  name: string;
  title?: string | null;
  team_id?: string | null;
};

type CustomerRelation = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  status?: string | null;
  assigned_employee_id?: string | null;
};

type ScheduleRow = {
  id: string;
  customer_id: string;
  assigned_employee_id: string | null;
  schedule_type: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  status: string;
  priority: string | null;
  result_note: string | null;
  next_contact_at: string | null;
  completed_at: string | null;
  customers: CustomerRelation | CustomerRelation[] | null;
  employees: PersonRelation | PersonRelation[] | null;
};

type QuoteRow = {
  id: string;
  customer_id: string;
  assigned_employee_id: string | null;
  created_by: string | null;
  title: string;
  status: string;
  final_amount: number;
  memo: string | null;
  sent_at: string | null;
  created_at: string;
  valid_until: string | null;
  is_contract_quote: boolean;
  customers: CustomerRelation | CustomerRelation[] | null;
  employees: PersonRelation | PersonRelation[] | null;
};

export type CrmMobileHomeBundle = {
  summary: {
    todayConsult: number;
    todaySurvey: number;
    todayQuoteWrite: number;
    todayQuoteSend: number;
    todayContract: number;
    overdue: number;
    todayContact: number;
    expiringQuotes: number;
  };
  items: TodayWorkItem[];
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function employeeLabel(value: PersonRelation | PersonRelation[] | null) {
  const employee = relationOne(value);
  if (!employee) return null;
  return employee.title ? `${employee.name} ${employee.title}` : employee.name;
}

function scheduleBadge(type: string): TodayWorkBadge {
  if (type === "실측") return "실측";
  if (type === "견적작성" || type === "견적발송") return "견적";
  if (type === "계약상담") return "계약";
  return "상담";
}

function scheduleToItem(schedule: ScheduleRow, nowMs: number): TodayWorkItem {
  const customer = relationOne(schedule.customers);
  const completed = schedule.status === "완료" || schedule.status === "취소";
  const overdue = !completed && new Date(schedule.start_at).getTime() < nowMs;
  return {
    id: `schedule:${schedule.id}`,
    kind:
      schedule.schedule_type === "실측"
        ? "survey"
        : schedule.schedule_type === "견적작성"
          ? "quote_write"
          : schedule.schedule_type === "견적발송"
            ? "quote_send"
            : schedule.schedule_type === "계약상담"
              ? "contract"
              : overdue
                ? "overdue"
                : "consult",
    badge: overdue ? "경고" : scheduleBadge(schedule.schedule_type),
    title: schedule.title,
    customerId: schedule.customer_id,
    customerName: customer?.name ?? null,
    phone: customer?.phone ?? null,
    address: customer?.address ?? null,
    employeeId: schedule.assigned_employee_id,
    employeeName: employeeLabel(schedule.employees),
    priority: schedule.priority,
    status: schedule.status,
    startAt: schedule.start_at,
    dueAt: schedule.next_contact_at,
    amount: null,
    memo: schedule.result_note ?? schedule.description,
    completedAt: schedule.completed_at,
    source: "schedule",
    sourceId: schedule.id,
    isCompleted: completed,
    isOverdue: overdue,
    isUrgent: schedule.priority === "긴급",
    scheduleType: schedule.schedule_type,
  };
}

function taskToItem(task: EmployeeTask): TodayWorkItem {
  const completed = task.status === "완료" || task.status === "취소";
  const overdue =
    !completed && task.due_at ? new Date(task.due_at).getTime() < Date.now() : false;
  return {
    id: `task:${task.id}`,
    kind: "task",
    badge: "내부업무",
    title: task.title,
    customerId: task.customer_id,
    customerName: task.customers?.name ?? null,
    phone: task.customers?.phone ?? null,
    address: task.customers?.address ?? null,
    employeeId: task.assigned_employee_id,
    employeeName: task.employees
      ? [task.employees.name, task.employees.title].filter(Boolean).join(" ")
      : null,
    priority: task.priority,
    status: task.status,
    startAt: task.due_at,
    dueAt: task.due_at,
    amount: null,
    memo: task.description,
    completedAt: task.completed_at,
    source: "task",
    sourceId: task.id,
    isCompleted: completed,
    isOverdue: overdue,
    isUrgent: task.priority === "긴급",
  };
}

function quoteToItem(
  quote: QuoteRow,
  kind: string,
  badge: TodayWorkBadge,
): TodayWorkItem {
  const customer = relationOne(quote.customers);
  return {
    id: `quote:${kind}:${quote.id}`,
    kind,
    badge,
    title: quote.title,
    customerId: quote.customer_id,
    customerName: customer?.name ?? null,
    phone: customer?.phone ?? null,
    address: customer?.address ?? null,
    employeeId: quote.assigned_employee_id,
    employeeName: employeeLabel(quote.employees),
    priority: null,
    status: quote.status,
    startAt: quote.sent_at ?? quote.created_at,
    dueAt: quote.valid_until,
    amount: quote.final_amount,
    memo: quote.memo,
    completedAt: null,
    source: "quote",
    sourceId: quote.id,
    isCompleted: quote.status === "계약전환" || quote.status === "취소",
    isOverdue: false,
    isUrgent: false,
    quoteId: quote.id,
  };
}

function sortItems(a: TodayWorkItem, b: TodayWorkItem) {
  if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
  if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
  if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
  const at = a.startAt ? new Date(a.startAt).getTime() : Number.MAX_SAFE_INTEGER;
  const bt = b.startAt ? new Date(b.startAt).getTime() : Number.MAX_SAFE_INTEGER;
  return at - bt;
}

function uniqueRows<T extends { id: string }>(groups: T[][]): T[] {
  const map = new Map<string, T>();
  for (const group of groups) {
    for (const row of group) map.set(row.id, row);
  }
  return [...map.values()];
}

export async function getCrmMobileHomeBundle(input: {
  employeeId?: string | null;
} = {}): Promise<CrmMobileHomeBundle> {
  const access = await getCurrentUserAccess();
  if (!access.canAccessErp) throw new Error("CRM 접근 권한이 없습니다.");

  const employeeId = input.employeeId ?? access.profile?.employee_id ?? null;
  const supabase = await createClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const { key: todayKey, start, end } = koreaDayBounds(now);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const expiryEndKey = toKoreaDateKey(new Date(nowMs + 3 * 86400000));
  const staleDraftCutoff = new Date(nowMs - 7 * 86400000).toISOString();
  const sentFollowupCutoff = new Date(nowMs - 3 * 86400000).toISOString();

  let todayScheduleQuery = supabase
    .from("customer_schedules")
    .select(SCHEDULE_SELECT)
    .is("deleted_at", null)
    .neq("status", "취소")
    .gte("start_at", startIso)
    .lte("start_at", endIso)
    .order("start_at", { ascending: true })
    .limit(100);

  let overdueScheduleQuery = supabase
    .from("customer_schedules")
    .select(SCHEDULE_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .in("status", ACTIVE_SCHEDULE_STATUSES)
    .lt("start_at", nowIso)
    .order("start_at", { ascending: true })
    .limit(100);

  let contactScheduleQuery = supabase
    .from("customer_schedules")
    .select(SCHEDULE_SELECT)
    .is("deleted_at", null)
    .in("status", ACTIVE_SCHEDULE_STATUSES)
    .not("next_contact_at", "is", null)
    .gte("next_contact_at", startIso)
    .lte("next_contact_at", endIso)
    .order("next_contact_at", { ascending: true })
    .limit(50);

  let contactCustomerQuery = supabase
    .from("customers")
    .select(
      "id, name, phone, address, next_contact_at, assigned_employee_id, status, employees ( id, name, title )",
    )
    .is("deleted_at", null)
    .eq("next_contact_at", todayKey)
    .limit(100);

  let expiringQuoteQuery = supabase
    .from("quotes")
    .select(QUOTE_SELECT)
    .is("deleted_at", null)
    .in("status", ACTIVE_QUOTE_STATUSES)
    .gte("valid_until", todayKey)
    .lte("valid_until", expiryEndKey)
    .order("valid_until", { ascending: true })
    .limit(50);

  let staleDraftQuoteQuery = supabase
    .from("quotes")
    .select(QUOTE_SELECT)
    .is("deleted_at", null)
    .eq("status", "작성중")
    .lt("created_at", staleDraftCutoff)
    .order("created_at", { ascending: false })
    .limit(50);

  let followupQuoteQuery = supabase
    .from("quotes")
    .select(QUOTE_SELECT)
    .is("deleted_at", null)
    .in("status", ["발송완료", "승인"])
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (employeeId) {
    todayScheduleQuery = todayScheduleQuery.eq("assigned_employee_id", employeeId);
    overdueScheduleQuery = overdueScheduleQuery.eq("assigned_employee_id", employeeId);
    contactScheduleQuery = contactScheduleQuery.eq("assigned_employee_id", employeeId);
    contactCustomerQuery = contactCustomerQuery.eq("assigned_employee_id", employeeId);
    expiringQuoteQuery = expiringQuoteQuery.eq("assigned_employee_id", employeeId);
    staleDraftQuoteQuery = staleDraftQuoteQuery.eq("assigned_employee_id", employeeId);
    followupQuoteQuery = followupQuoteQuery.eq("assigned_employee_id", employeeId);
  }

  const [
    todayScheduleResult,
    overdueScheduleResult,
    contactScheduleResult,
    contactCustomerResult,
    taskResult,
    expiringQuoteResult,
    staleDraftQuoteResult,
    followupQuoteResult,
  ] = await Promise.all([
    todayScheduleQuery,
    overdueScheduleQuery,
    contactScheduleQuery,
    contactCustomerQuery,
    listEmployeeTasks(
      {
        employeeId: employeeId || undefined,
        includeCompleted: true,
        todayOnly: true,
      },
    ).catch(() => [] as EmployeeTask[]),
    expiringQuoteQuery,
    staleDraftQuoteQuery,
    followupQuoteQuery,
  ]);

  const firstError = [
    todayScheduleResult.error,
    overdueScheduleResult.error,
    contactScheduleResult.error,
    contactCustomerResult.error,
    expiringQuoteResult.error,
    staleDraftQuoteResult.error,
    followupQuoteResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message || "CRM 홈을 불러오지 못했습니다.");

  const todaySchedules = (todayScheduleResult.data ?? []) as unknown as ScheduleRow[];
  const overdueSchedules = (overdueScheduleResult.data ?? []) as unknown as ScheduleRow[];
  const contactSchedules = (contactScheduleResult.data ?? []) as unknown as ScheduleRow[];
  const tasks = taskResult;
  const expiringQuotes = (expiringQuoteResult.data ?? []) as unknown as QuoteRow[];
  const staleDraftQuotes = (staleDraftQuoteResult.data ?? []) as unknown as QuoteRow[];
  const followupQuotes = (followupQuoteResult.data ?? []) as unknown as QuoteRow[];

  const contactItems = new Map<string, TodayWorkItem>();
  for (const row of contactCustomerResult.data ?? []) {
    const employee = relationOne(row.employees as PersonRelation | PersonRelation[] | null);
    contactItems.set(row.id as string, {
      id: `contact:${row.id}`,
      kind: "contact",
      badge: "연락",
      title: "오늘 다음 연락",
      customerId: row.id as string,
      customerName: row.name as string,
      phone: (row.phone as string) ?? null,
      address: (row.address as string) ?? null,
      employeeId: (row.assigned_employee_id as string) ?? null,
      employeeName: employee
        ? [employee.name, employee.title].filter(Boolean).join(" ")
        : null,
      priority: null,
      status: (row.status as string) ?? null,
      startAt: (row.next_contact_at as string) ?? null,
      dueAt: (row.next_contact_at as string) ?? null,
      amount: null,
      memo: null,
      completedAt: null,
      source: "customer",
      sourceId: row.id as string,
      isCompleted: false,
      isOverdue: false,
      isUrgent: false,
    });
  }

  for (const schedule of contactSchedules) {
    if (contactItems.has(schedule.customer_id)) continue;
    const customer = relationOne(schedule.customers);
    contactItems.set(schedule.customer_id, {
      id: `contact-sch:${schedule.id}`,
      kind: "contact",
      badge: "연락",
      title: `다음 연락 · ${schedule.title}`,
      customerId: schedule.customer_id,
      customerName: customer?.name ?? null,
      phone: customer?.phone ?? null,
      address: customer?.address ?? null,
      employeeId: schedule.assigned_employee_id,
      employeeName: employeeLabel(schedule.employees),
      priority: schedule.priority,
      status: schedule.status,
      startAt: schedule.next_contact_at,
      dueAt: schedule.next_contact_at,
      amount: null,
      memo: schedule.result_note,
      completedAt: null,
      source: "schedule",
      sourceId: schedule.id,
      isCompleted: false,
      isOverdue: false,
      isUrgent: schedule.priority === "긴급",
      scheduleType: schedule.schedule_type,
    });
  }

  const sentFollowupCandidates = followupQuotes.filter(
    (quote) =>
      quote.status === "발송완료" &&
      quote.sent_at &&
      quote.sent_at < sentFollowupCutoff,
  );
  const followupScheduleRows: Array<{
    customer_id: string;
    start_at: string;
    status: string;
  }> = [];

  if (sentFollowupCandidates.length > 0) {
    const customerIds = [...new Set(sentFollowupCandidates.map((quote) => quote.customer_id))];
    const sentTimes = sentFollowupCandidates
      .map((quote) => quote.sent_at)
      .filter((value): value is string => Boolean(value))
      .sort();
    const minSentAt = sentTimes[0];
    if (minSentAt) {
      const { data } = await supabase
        .from("customer_schedules")
        .select("customer_id, start_at, status")
        .is("deleted_at", null)
        .in("customer_id", customerIds.slice(0, 100))
        .neq("status", "취소")
        .gte("start_at", minSentAt)
        .order("start_at", { ascending: false })
        .limit(300);
      followupScheduleRows.push(...((data ?? []) as typeof followupScheduleRows));
    }
  }

  const sentNoFollowUp = sentFollowupCandidates.filter((quote) => {
    const sentAt = new Date(quote.sent_at!).getTime();
    return !followupScheduleRows.some(
      (schedule) =>
        schedule.customer_id === quote.customer_id &&
        new Date(schedule.start_at).getTime() > sentAt,
    );
  });

  const contractWaiting = followupQuotes.filter(
    (quote) =>
      !quote.is_contract_quote &&
      (quote.status === "승인" || quote.status === "발송완료"),
  );

  const todayScheduleItems = todaySchedules.map((schedule) =>
    scheduleToItem(schedule, nowMs),
  );
  const overdueScheduleItems = overdueSchedules
    .filter((schedule) => toKoreaDateKey(schedule.start_at) !== todayKey)
    .map((schedule) => scheduleToItem(schedule, nowMs));

  const items: TodayWorkItem[] = [
    ...todayScheduleItems,
    ...overdueScheduleItems,
    ...contactItems.values(),
    ...tasks.map(taskToItem),
    ...expiringQuotes.map((quote) => quoteToItem(quote, "expiring", "경고")),
    ...staleDraftQuotes.map((quote) => quoteToItem(quote, "quote_stale", "견적")),
    ...sentNoFollowUp.map((quote) => quoteToItem(quote, "quote_followup", "견적")),
    ...contractWaiting.map((quote) => quoteToItem(quote, "quote_contract", "계약")),
  ];

  const seen = new Set<string>();
  const uniqueItems = items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  uniqueItems.sort(sortItems);

  return {
    summary: {
      todayConsult: todaySchedules.filter((schedule) =>
        ["전화상담", "방문상담", "재연락", "해피콜", "기타"].includes(
          schedule.schedule_type,
        ),
      ).length,
      todaySurvey: todaySchedules.filter((schedule) => schedule.schedule_type === "실측").length,
      todayQuoteWrite: todaySchedules.filter(
        (schedule) => schedule.schedule_type === "견적작성",
      ).length,
      todayQuoteSend: todaySchedules.filter(
        (schedule) => schedule.schedule_type === "견적발송",
      ).length,
      todayContract: todaySchedules.filter(
        (schedule) => schedule.schedule_type === "계약상담",
      ).length,
      overdue: overdueScheduleResult.count ?? overdueSchedules.length,
      todayContact: contactItems.size,
      expiringQuotes: expiringQuotes.length,
    },
    items: uniqueItems,
  };
}
