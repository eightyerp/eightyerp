import { createClient } from "@/lib/supabase-server";
import { listCustomerSchedules } from "@/lib/crm/customer-schedules";
import { listEmployeeTasks } from "@/lib/crm/employee-tasks";
import { listQuotes } from "@/lib/crm/quote-mgmt";
import {
  getScheduleAccess,
  listEmployeesInScope,
  listTeams,
} from "@/lib/crm/schedule-access";
import { isCustomerScheduleOverdue } from "@/lib/crm/schedule-utils";
import type {
  TodayWorkBadge,
  TodayWorkItem,
  AssigneeTodayStats,
} from "@/lib/crm/today-work-shared";
import type {
  CustomerSchedule,
  Employee,
  EmployeeTask,
  ErpQuote,
  Team,
} from "@/types/database";

export type {
  TodayFocus,
  TodayWorkBadge,
  TodayWorkItem,
  AssigneeTodayStats,
} from "@/lib/crm/today-work-shared";

export { filterTodayItems, formatOverdueLabel } from "@/lib/crm/today-work-shared";

export type TodayWorkBundle = {
  access: {
    canViewAll: boolean;
    canViewTeam: boolean;
    employeeId: string | null;
    teamId: string | null;
    role: string | null;
    userName: string | null;
  };
  employees: Employee[];
  teams: Team[];
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
  progress: {
    total: number;
    completed: number;
    incomplete: number;
    rate: number;
  };
  items: TodayWorkItem[];
  schedulesToday: CustomerSchedule[];
  overdueSchedules: CustomerSchedule[];
  contactCustomers: TodayWorkItem[];
  quotes: ErpQuote[];
  tasks: EmployeeTask[];
  byAssignee: AssigneeTodayStats[];
  filterEmployeeId: string | null;
  filterTeamId: string | null;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function toDateKey(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isToday(iso: string | null | undefined) {
  if (!iso) return false;
  return toDateKey(iso) === toDateKey(new Date());
}
function empLabel(e?: { name: string; title?: string } | null) {
  if (!e) return null;
  return e.title ? `${e.name} ${e.title}` : e.name;
}

function scheduleBadge(type: string): TodayWorkBadge {
  if (type === "실측") return "실측";
  if (type === "견적작성" || type === "견적발송") return "견적";
  if (type === "계약상담") return "계약";
  return "상담";
}

function scheduleToItem(s: CustomerSchedule): TodayWorkItem {
  const done = s.status === "완료" || s.status === "취소";
  const overdue = isCustomerScheduleOverdue(s);
  return {
    id: `schedule:${s.id}`,
    kind:
      s.schedule_type === "실측"
        ? "survey"
        : s.schedule_type === "견적작성"
          ? "quote_write"
          : s.schedule_type === "견적발송"
            ? "quote_send"
            : s.schedule_type === "계약상담"
              ? "contract"
              : overdue
                ? "overdue"
                : "consult",
    badge: overdue && !done ? "경고" : scheduleBadge(s.schedule_type),
    title: s.title,
    customerId: s.customer_id,
    customerName: s.customers?.name ?? null,
    phone: s.customers?.phone ?? null,
    address: s.customers?.address ?? null,
    employeeId: s.assigned_employee_id,
    employeeName: empLabel(s.employees),
    priority: s.priority,
    status: s.status,
    startAt: s.start_at,
    dueAt: s.next_contact_at,
    amount: null,
    memo: s.result_note ?? s.description,
    completedAt: s.completed_at,
    source: "schedule",
    sourceId: s.id,
    isCompleted: done,
    isOverdue: overdue,
    isUrgent: s.priority === "긴급",
    scheduleType: s.schedule_type,
  };
}

function taskToItem(t: EmployeeTask): TodayWorkItem {
  const done = t.status === "완료" || t.status === "취소";
  const overdue =
    !done && t.due_at ? new Date(t.due_at).getTime() < Date.now() : false;
  return {
    id: `task:${t.id}`,
    kind: "task",
    badge: "내부업무",
    title: t.title,
    customerId: t.customer_id,
    customerName: t.customers?.name ?? null,
    phone: t.customers?.phone ?? null,
    address: t.customers?.address ?? null,
    employeeId: t.assigned_employee_id,
    employeeName: empLabel(t.employees),
    priority: t.priority,
    status: t.status,
    startAt: t.due_at,
    dueAt: t.due_at,
    amount: null,
    memo: t.description,
    completedAt: t.completed_at,
    source: "task",
    sourceId: t.id,
    isCompleted: done,
    isOverdue: overdue,
    isUrgent: t.priority === "긴급",
  };
}

function quoteToItem(
  q: ErpQuote,
  kind: string,
  badge: TodayWorkBadge,
): TodayWorkItem {
  return {
    id: `quote:${kind}:${q.id}`,
    kind,
    badge,
    title: q.title,
    customerId: q.customer_id,
    customerName: q.customers?.name ?? null,
    phone: q.customers?.phone ?? null,
    address: q.customers?.address ?? null,
    employeeId: q.assigned_employee_id,
    employeeName: empLabel(q.employees),
    priority: null,
    status: q.status,
    startAt: q.sent_at ?? q.created_at,
    dueAt: q.valid_until,
    amount: q.final_amount,
    memo: q.memo,
    completedAt: null,
    source: "quote",
    sourceId: q.id,
    isCompleted: q.status === "계약전환" || q.status === "취소",
    isOverdue: false,
    isUrgent: false,
    quoteId: q.id,
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

export async function getTodayWorkBundle(filters: {
  employeeId?: string | null;
  teamId?: string | null;
} = {}): Promise<TodayWorkBundle> {
  const access = await getScheduleAccess();
  const employees = await listEmployeesInScope(access);
  let teams: Team[] = [];
  try {
    teams = await listTeams();
  } catch {
    teams = [];
  }

  let filterEmployeeId = filters.employeeId ?? null;
  let filterTeamId = filters.teamId ?? null;

  if (!access.canViewAll && !access.canViewTeam) {
    filterEmployeeId = access.employeeId;
    filterTeamId = null;
  } else if (!access.canViewAll && access.canViewTeam) {
    if (
      filterEmployeeId &&
      !employees.some((e) => e.id === filterEmployeeId)
    ) {
      filterEmployeeId = null;
    }
    filterTeamId = access.teamId;
  }

  const scheduleFilters = {
    employeeId: filterEmployeeId || undefined,
    teamId: access.canViewAll ? filterTeamId || undefined : undefined,
  };

  const [schedulesAll, tasks, quotes] = await Promise.all([
    listCustomerSchedules(
      { ...scheduleFilters },
      access,
    ).catch(() => [] as CustomerSchedule[]),
    listEmployeeTasks(
      {
        employeeId: filterEmployeeId || undefined,
        teamId: access.canViewAll ? filterTeamId || undefined : undefined,
        includeCompleted: true,
        todayOnly: true,
      },
      access,
    ).catch(() => [] as EmployeeTask[]),
    listQuotes({
      employeeId: filterEmployeeId || undefined,
    }).catch(() => [] as ErpQuote[]),
  ]);

  let scopedSchedules = schedulesAll;
  if (filterEmployeeId) {
    scopedSchedules = scopedSchedules.filter(
      (s) => s.assigned_employee_id === filterEmployeeId,
    );
  }
  if (filterTeamId && access.canViewAll) {
    scopedSchedules = scopedSchedules.filter(
      (s) => s.employees?.team_id === filterTeamId,
    );
  }

  let scopedQuotes = quotes;
  if (filterEmployeeId) {
    scopedQuotes = scopedQuotes.filter(
      (q) =>
        q.assigned_employee_id === filterEmployeeId ||
        q.created_by === access.userId,
    );
  } else if (!access.canViewAll && access.employeeId) {
    const scopedIds = new Set(employees.map((e) => e.id));
    scopedQuotes = scopedQuotes.filter(
      (q) =>
        (q.assigned_employee_id && scopedIds.has(q.assigned_employee_id)) ||
        q.created_by === access.userId,
    );
  }

  const schedulesToday = scopedSchedules.filter(
    (s) => isToday(s.start_at) && s.status !== "취소",
  );
  const overdueSchedules = scopedSchedules.filter(
    (s) => isCustomerScheduleOverdue(s) && s.status !== "취소",
  );

  const todayKey = toDateKey(new Date());
  const contactFromSchedules = scopedSchedules.filter(
    (s) => s.next_contact_at && toDateKey(s.next_contact_at) === todayKey,
  );

  // customers.next_contact_at = today
  const contactCustomersMap = new Map<string, TodayWorkItem>();
  try {
    const supabase = await createClient();
    let q = supabase
      .from("customers")
      .select(
        "id, name, phone, address, next_contact_at, assigned_employee_id, status, employees ( id, name, title )",
      )
      .is("deleted_at", null)
      .eq("next_contact_at", todayKey)
      .limit(100);

    if (filterEmployeeId) {
      q = q.eq("assigned_employee_id", filterEmployeeId);
    } else if (!access.canViewAll && access.employeeId && !access.canViewTeam) {
      q = q.eq("assigned_employee_id", access.employeeId);
    }

    const { data, error: customerError } = await q;
    if (customerError) throw new Error(customerError.message);
    const customerIds = (data ?? []).map((c) => c.id as string);
    const consultByCustomer = new Map<string, string>();
    if (customerIds.length) {
      const { data: logs } = await supabase
        .from("customer_consult_logs")
        .select("customer_id, consult_content, created_at")
        .in("customer_id", customerIds)
        .order("created_at", { ascending: false })
        .limit(200);
      for (const log of logs ?? []) {
        const cid = log.customer_id as string;
        if (!consultByCustomer.has(cid)) {
          consultByCustomer.set(cid, String(log.consult_content ?? ""));
        }
      }
    }

    for (const c of data ?? []) {
      const empRaw = c.employees as
        | { id: string; name: string; title: string }
        | { id: string; name: string; title: string }[]
        | null;
      const emp = Array.isArray(empRaw) ? empRaw[0] ?? null : empRaw;
      if (
        access.canViewTeam &&
        !access.canViewAll &&
        c.assigned_employee_id &&
        !employees.some((e) => e.id === c.assigned_employee_id)
      ) {
        continue;
      }
      const cid = c.id as string;
      contactCustomersMap.set(cid, {
        id: `contact:${cid}`,
        kind: "contact",
        badge: "연락",
        title: "오늘 다음 연락",
        customerId: cid,
        customerName: c.name as string,
        phone: (c.phone as string) ?? null,
        address: (c.address as string) ?? null,
        employeeId: (c.assigned_employee_id as string) ?? null,
        employeeName: empLabel(emp),
        priority: null,
        status: (c.status as string) ?? null,
        startAt: (c.next_contact_at as string) ?? null,
        dueAt: (c.next_contact_at as string) ?? null,
        amount: null,
        memo: consultByCustomer.get(cid) ?? null,
        completedAt: null,
        source: "customer",
        sourceId: cid,
        isCompleted: false,
        isOverdue: false,
        isUrgent: false,
        recentConsult: consultByCustomer.get(cid) ?? null,
      });
    }
  } catch {
    // customers table / RLS optional failure
  }

  for (const s of contactFromSchedules) {
    if (!s.customer_id || contactCustomersMap.has(s.customer_id)) continue;
    contactCustomersMap.set(s.customer_id, {
      id: `contact-sch:${s.id}`,
      kind: "contact",
      badge: "연락",
      title: `다음 연락 · ${s.title}`,
      customerId: s.customer_id,
      customerName: s.customers?.name ?? null,
      phone: s.customers?.phone ?? null,
      address: s.customers?.address ?? null,
      employeeId: s.assigned_employee_id,
      employeeName: empLabel(s.employees),
      priority: s.priority,
      status: s.status,
      startAt: s.next_contact_at,
      dueAt: s.next_contact_at,
      amount: null,
      memo: s.result_note,
      completedAt: null,
      source: "schedule",
      sourceId: s.id,
      isCompleted: false,
      isOverdue: false,
      isUrgent: s.priority === "긴급",
    });
  }

  // attach recent quote amounts to contacts
  for (const item of contactCustomersMap.values()) {
    if (!item.customerId) continue;
    const q = scopedQuotes.find((x) => x.customer_id === item.customerId);
    if (q) item.amount = q.final_amount;
  }

  const now = Date.now();
  const in3Days = now + 3 * 86400000;
  const expiringQuotes = scopedQuotes.filter((q) => {
    if (!q.valid_until) return false;
    if (["계약전환", "취소", "만료"].includes(q.status)) return false;
    const t = new Date(q.valid_until).getTime();
    return t >= startOfDay(new Date()).getTime() && t <= in3Days;
  });

  const oldDraftQuotes = scopedQuotes.filter((q) => {
    if (q.status !== "작성중") return false;
    const age = now - new Date(q.created_at).getTime();
    return age > 7 * 86400000;
  });

  const sentNoFollowUp = scopedQuotes.filter((q) => {
    if (q.status !== "발송완료" || !q.sent_at) return false;
    const sentAge = now - new Date(q.sent_at).getTime();
    if (sentAge < 3 * 86400000) return false;
    const hasFollow = scopedSchedules.some(
      (s) =>
        s.customer_id === q.customer_id &&
        new Date(s.start_at).getTime() > new Date(q.sent_at!).getTime() &&
        !["취소"].includes(s.status),
    );
    return !hasFollow;
  });

  const contractWaiting = scopedQuotes.filter(
    (q) =>
      !q.is_contract_quote &&
      (q.status === "승인" || q.status === "발송완료"),
  );

  const items: TodayWorkItem[] = [
    ...schedulesToday.map(scheduleToItem),
    ...overdueSchedules
      .filter((s) => !isToday(s.start_at))
      .map((s) => {
        const item = scheduleToItem(s);
        item.kind = "overdue";
        item.badge = "경고";
        return item;
      }),
    ...Array.from(contactCustomersMap.values()),
    ...tasks.map(taskToItem),
    ...expiringQuotes.map((q) => quoteToItem(q, "expiring", "경고")),
    ...oldDraftQuotes.map((q) => quoteToItem(q, "quote_stale", "견적")),
    ...sentNoFollowUp.map((q) => quoteToItem(q, "quote_followup", "견적")),
    ...contractWaiting.map((q) => quoteToItem(q, "quote_contract", "계약")),
  ];

  // dedupe by id
  const seen = new Set<string>();
  const unique = items.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
  unique.sort(sortItems);

  const completed = unique.filter((i) => i.isCompleted);
  const total = unique.length;
  const completedCount = completed.length;
  const rate = total === 0 ? 0 : Math.round((completedCount / total) * 100);

  const summary = {
    todayConsult: schedulesToday.filter((s) =>
      ["전화상담", "방문상담", "재연락", "해피콜", "기타"].includes(
        s.schedule_type,
      ),
    ).length,
    todaySurvey: schedulesToday.filter((s) => s.schedule_type === "실측").length,
    todayQuoteWrite: schedulesToday.filter((s) => s.schedule_type === "견적작성")
      .length,
    todayQuoteSend: schedulesToday.filter((s) => s.schedule_type === "견적발송")
      .length,
    todayContract: schedulesToday.filter((s) => s.schedule_type === "계약상담")
      .length,
    overdue: overdueSchedules.length,
    todayContact: contactCustomersMap.size,
    expiringQuotes: expiringQuotes.length,
  };

  const byAssignee: AssigneeTodayStats[] = [];
  if (access.canViewAll || access.canViewTeam) {
    const pool = access.canViewAll
      ? await listEmployeesInScope({ ...access, canViewAll: true })
      : employees;

    for (const emp of pool) {
      const empItems = unique.filter((i) => i.employeeId === emp.id);
      const empToday = schedulesToday.filter(
        (s) => s.assigned_employee_id === emp.id,
      );
      const empOverdue = overdueSchedules.filter(
        (s) => s.assigned_employee_id === emp.id,
      );
      const empCompleted = empItems.filter((i) => i.isCompleted).length;
      const empTotal = empItems.length || empToday.length + empOverdue.length;
      let oldest: number | null = null;
      for (const s of empOverdue) {
        const hours = (Date.now() - new Date(s.start_at).getTime()) / 3600000;
        if (oldest === null || hours > oldest) oldest = hours;
      }
      byAssignee.push({
        employeeId: emp.id,
        employeeName: empLabel(emp) ?? emp.name,
        todayCount: empToday.length,
        overdueCount: empOverdue.length,
        completedCount: empCompleted,
        totalCount: empTotal,
        completionRate:
          empTotal === 0 ? 0 : Math.round((empCompleted / empTotal) * 100),
        hasUrgent: empItems.some((i) => i.isUrgent),
        hasNoSchedule: empToday.length === 0,
        oldestOverdueHours: oldest,
      });
    }
    byAssignee.sort(
      (a, b) => b.overdueCount - a.overdueCount || b.todayCount - a.todayCount,
    );
  }

  const profileName =
    access.profile && "employees" in (access as object)
      ? null
      : null;

  let userName: string | null = null;
  if (access.employeeId) {
    const me = employees.find((e) => e.id === access.employeeId);
    userName = me ? empLabel(me) : null;
  }
  if (!userName) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      userName =
        (data.user?.user_metadata?.name as string | undefined) ??
        data.user?.email ??
        null;
    } catch {
      userName = null;
    }
  }
  void profileName;

  return {
    access: {
      canViewAll: access.canViewAll,
      canViewTeam: access.canViewTeam,
      employeeId: access.employeeId,
      teamId: access.teamId,
      role: access.role,
      userName,
    },
    employees,
    teams,
    summary,
    progress: {
      total,
      completed: completedCount,
      incomplete: total - completedCount,
      rate,
    },
    items: unique,
    schedulesToday,
    overdueSchedules,
    contactCustomers: Array.from(contactCustomersMap.values()),
    quotes: scopedQuotes,
    tasks,
    byAssignee,
    filterEmployeeId,
    filterTeamId,
  };
}
