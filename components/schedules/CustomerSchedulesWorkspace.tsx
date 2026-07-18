"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  createCustomerScheduleAction,
  deleteCustomerScheduleAction,
  fetchCustomerScheduleAction,
  moveCustomerScheduleAction,
  updateCustomerScheduleAction,
  type ScheduleActionResult,
} from "@/app/actions/schedules";
import CompleteScheduleModal from "@/components/schedules/CompleteScheduleModal";
import {
  addDays,
  addMonths,
  buildMonthGrid,
  formatDayLabel,
  formatMonthLabel,
  formatTime,
  isSameMonth,
  startOfDay,
  startOfWeek,
  toDateKeyFromIso,
  toDateTimeLocalStep10,
  WEEKDAY_LABELS_KO,
} from "@/components/schedules/calendar-utils";
import { canEditCustomerSchedule } from "@/lib/crm/schedule-utils";
import { downloadCsv, downloadXls, dateStamp } from "@/components/schedules/export-utils";
import {
  isCustomerScheduleOverdue,
  scheduleWarningKind,
} from "@/lib/crm/schedule-utils";
import {
  CUSTOMER_SCHEDULE_STATUSES,
  CUSTOMER_SCHEDULE_TYPES,
  PRIORITY_BADGE,
  SCHEDULE_PRIORITIES,
  SCHEDULE_STATUS_BADGE,
} from "@/lib/crm/schedule-constants";
import type { CustomerSchedule, Employee, Team } from "@/types/database";

type CustomerLite = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  status?: string | null;
  recentQuoteAmount?: number | null;
  recentConsult?: string | null;
};

type Access = {
  canViewAll: boolean;
  canViewTeam: boolean;
  employeeId: string | null;
  role: string | null;
};

type Props = {
  initialSchedules: CustomerSchedule[];
  employees: Employee[];
  teams: Team[];
  customers: CustomerLite[];
  access: Access;
  fixedCustomerId?: string | null;
};

type ViewMode =
  | "month"
  | "week"
  | "day"
  | "list"
  | "today"
  | "unhandled"
  | "nextContact";

const VIEW_TABS: { key: ViewMode; label: string }[] = [
  { key: "month", label: "월간" },
  { key: "week", label: "주간" },
  { key: "day", label: "일간" },
  { key: "list", label: "목록" },
  { key: "today", label: "오늘" },
  { key: "unhandled", label: "미처리" },
  { key: "nextContact", label: "다음연락" },
];

const initialActionState: ScheduleActionResult = { success: false };

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

function employeeLabel(e: Pick<Employee, "name" | "title">): string {
  return `${e.name} ${e.title}`;
}

function statusBadgeClass(status: string): string {
  return SCHEDULE_STATUS_BADGE[status] ?? "bg-gray-100 text-gray-600";
}

function priorityBadgeClass(priority: string): string {
  return PRIORITY_BADGE[priority] ?? "bg-gray-100 text-gray-600";
}

function chipClass(row: CustomerSchedule, all: CustomerSchedule[]): string {
  const warn = scheduleWarningKind(row, all);
  const done = row.status === "완료";
  const base =
    "block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium cursor-pointer";
  if (done) return `${base} bg-gray-100 text-gray-500 opacity-60`;
  if (warn === "overdue" || warn === "postponed" || warn === "nextContact") {
    return `${base} border border-red-400 bg-red-50 text-red-700`;
  }
  if (warn === "urgent") {
    return `${base} border border-amber-400 bg-gold-50 text-navy-900 font-semibold`;
  }
  return `${base} bg-navy-800/5 text-navy-800`;
}

const ASSIGNEE_COLORS = [
  "bg-sky-100 text-sky-800 border-sky-200",
  "bg-emerald-100 text-emerald-800 border-emerald-200",
  "bg-violet-100 text-violet-800 border-violet-200",
  "bg-amber-100 text-amber-900 border-amber-200",
  "bg-rose-100 text-rose-800 border-rose-200",
  "bg-teal-100 text-teal-800 border-teal-200",
];

function assigneeColorClass(employeeId: string, showColors: boolean): string {
  if (!showColors) return "";
  let hash = 0;
  for (let i = 0; i < employeeId.length; i++) hash = (hash + employeeId.charCodeAt(i) * (i + 1)) % 997;
  return ASSIGNEE_COLORS[hash % ASSIGNEE_COLORS.length];
}

export default function CustomerSchedulesWorkspace({
  initialSchedules,
  employees,
  teams,
  customers,
  access,
  fixedCustomerId = null,
}: Props) {
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "month";
    const w = window.innerWidth;
    if (w < 768) return "today";
    if (w < 1024) return "week";
    return "month";
  });
  const [monthCursor, setMonthCursor] = useState(() => startOfDay(new Date()));
  const [weekCursor, setWeekCursor] = useState(() => startOfDay(new Date()));
  const [dayCursor, setDayCursor] = useState(() => startOfDay(new Date()));

  const lockEmployee = !access.canViewAll && !access.canViewTeam;

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [employeeId, setEmployeeId] = useState(
    lockEmployee ? access.employeeId ?? "" : "",
  );
  const [teamId, setTeamId] = useState("");
  const [scheduleType, setScheduleType] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [q, setQ] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerSchedule | null>(null);
  const [detail, setDetail] = useState<CustomerSchedule | null>(null);
  const [forceSave, setForceSave] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [quickPending, setQuickPending] = useState(false);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [completeRow, setCompleteRow] = useState<CustomerSchedule | null>(null);
  /** 서버 props와 동기화되는 로컬 목록 (부분 패치 금지, 전체 행 교체만) */
  const [schedules, setSchedules] = useState(initialSchedules);
  const [actionResetKey, setActionResetKey] = useState(0);
  const pendingKindRef = useRef<"create" | "update" | null>(null);
  const [moveDraft, setMoveDraft] = useState<{
    id: string;
    customerId: string;
    title: string;
    startAt: string;
    endAt: string | null;
    dayLabel: string;
    conflicts: { id: string; title: string; start_at: string }[];
    force: boolean;
  } | null>(null);

  const router = useRouter();
  const [createState, createAction, createPending] = useActionState(
    createCustomerScheduleAction,
    initialActionState,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateCustomerScheduleAction,
    initialActionState,
  );
  const formState = editing ? updateState : createState;
  const formPending = editing ? updatePending : createPending;

  useEffect(() => {
    setSchedules(initialSchedules);
  }, [initialSchedules]);

  /** 목록이 갱신되면 열린 상세도 동일 id의 완전한 행으로 동기화 */
  useEffect(() => {
    if (!detail) return;
    const fresh = schedules.find((s) => s.id === detail.id);
    if (fresh && fresh !== detail) {
      setDetail(fresh);
    }
  }, [schedules, detail]);

  function upsertSchedule(row: CustomerSchedule) {
    setSchedules((prev) => {
      const idx = prev.findIndex((s) => s.id === row.id);
      if (idx < 0) return [row, ...prev];
      const next = prev.slice();
      next[idx] = row;
      return next;
    });
  }

  async function finalizeSaveSuccess(state: ScheduleActionResult) {
    setToast(state.message ?? "저장되었습니다.");
    setFormOpen(false);
    setEditing(null);
    setDetail(null);
    setForceSave(false);
    setActionResetKey((k) => k + 1);

    let full = state.schedule ?? null;
    if (state.id) {
      const fetched = await fetchCustomerScheduleAction(state.id);
      if (fetched.success) {
        full = fetched.schedule;
      }
    }
    if (full) {
      upsertSchedule(full);
    }
    router.refresh();
  }

  useEffect(() => {
    if (updatePending) pendingKindRef.current = "update";
    else if (createPending) pendingKindRef.current = "create";

    if (updatePending || createPending) return;

    const kind = pendingKindRef.current;
    if (!kind) return;
    pendingKindRef.current = null;

    const state = kind === "update" ? updateState : createState;
    if (state.success) {
      void finalizeSaveSuccess(state);
      return;
    }
    if (state.error) {
      console.error("[CustomerScheduleForm]", state.error);
    }
  }, [updatePending, createPending, updateState, createState]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    let rows = schedules;
    if (fixedCustomerId) rows = rows.filter((r) => r.customer_id === fixedCustomerId);
    if (from) {
      const f = new Date(`${from}T00:00:00`).toISOString();
      rows = rows.filter((r) => r.start_at >= f);
    }
    if (to) {
      const t = new Date(`${to}T23:59:59`).toISOString();
      rows = rows.filter((r) => r.start_at <= t);
    }
    if (employeeId) rows = rows.filter((r) => r.assigned_employee_id === employeeId);
    if (teamId) rows = rows.filter((r) => r.employees?.team_id === teamId);
    if (scheduleType) rows = rows.filter((r) => r.schedule_type === scheduleType);
    if (status) rows = rows.filter((r) => r.status === status);
    if (priority) rows = rows.filter((r) => r.priority === priority);
    const qq = q.trim().toLowerCase();
    if (qq) {
      rows = rows.filter((r) =>
        [
          r.customers?.name,
          r.customers?.phone,
          r.customers?.address,
          r.title,
          r.location,
          r.result_note,
          r.description,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(qq),
      );
    }
    return rows;
  }, [
    schedules,
    fixedCustomerId,
    from,
    to,
    employeeId,
    teamId,
    scheduleType,
    status,
    priority,
    q,
  ]);

  const visible = useMemo(() => {
    if (view === "today") {
      const key = toDateKeyFromIso(new Date().toISOString());
      return filtered.filter((r) => toDateKeyFromIso(r.start_at) === key);
    }
    if (view === "unhandled") {
      return filtered.filter(
        (r) =>
          r.status === "미처리" ||
          (["예정", "진행중"].includes(r.status) && isCustomerScheduleOverdue(r)),
      );
    }
    if (view === "nextContact") {
      return filtered
        .filter((r) => Boolean(r.next_contact_at))
        .sort((a, b) => (a.next_contact_at! < b.next_contact_at! ? -1 : 1));
    }
    return [...filtered].sort((a, b) => (a.start_at < b.start_at ? -1 : 1));
  }, [filtered, view]);

  const byDayKey = useMemo(() => {
    const map = new Map<string, CustomerSchedule[]>();
    for (const r of visible) {
      const key = toDateKeyFromIso(r.start_at);
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return map;
  }, [visible]);

  const monthDays = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);
  const weekDays = useMemo(() => {
    const start = startOfWeek(weekCursor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [weekCursor]);

  function openCreate() {
    setEditing(null);
    setForceSave(false);
    setFormOpen(true);
  }

  function openDetail(row: CustomerSchedule) {
    const full = schedules.find((s) => s.id === row.id) ?? row;
    setDetail(full);
  }

  function openEdit(row: CustomerSchedule) {
    const full = schedules.find((s) => s.id === row.id) ?? row;
    setEditing(full);
    setForceSave(false);
    setDetail(null);
    setFormOpen(true);
  }

  async function handleMove(id: string, newDayKey: string) {
    const row = schedules.find((r) => r.id === id);
    if (!row) return;
    const oldStart = new Date(row.start_at);
    const [y, m, d] = newDayKey.split("-").map(Number);
    const newStart = new Date(oldStart);
    newStart.setFullYear(y, m - 1, d);
    let newEnd: string | null = null;
    if (row.end_at) {
      const duration = new Date(row.end_at).getTime() - oldStart.getTime();
      newEnd = new Date(newStart.getTime() + duration).toISOString();
    }
    setMoveDraft({
      id,
      customerId: row.customer_id,
      title: row.title,
      startAt: newStart.toISOString(),
      endAt: newEnd,
      dayLabel: newDayKey,
      conflicts: [],
      force: false,
    });
  }

  async function confirmMove(force = false) {
    if (!moveDraft) return;
    setQuickPending(true);
    const result = await moveCustomerScheduleAction({
      id: moveDraft.id,
      startAt: moveDraft.startAt,
      endAt: moveDraft.endAt,
      customerId: moveDraft.customerId,
      force,
    });
    setQuickPending(false);
    if (!result.success && result.conflicts?.length) {
      setMoveDraft({ ...moveDraft, conflicts: result.conflicts, force: false });
      setToast(result.error ?? null);
      return;
    }
    setMoveDraft(null);
    setToast(result.message ?? result.error ?? null);
    if (result.success) {
      const fetched = await fetchCustomerScheduleAction(moveDraft.id);
      if (fetched.success) upsertSchedule(fetched.schedule);
      router.refresh();
    }
  }

  async function quickUpdate(
    row: CustomerSchedule,
    patch: Partial<{
      status: string;
      result_note: string | null;
      next_contact_at: string | null;
      start_at: string;
    }>,
  ) {
    setQuickPending(true);
    const fd = new FormData();
    fd.set("schedule_id", row.id);
    fd.set("customer_id", row.customer_id);
    fd.set("assigned_employee_id", row.assigned_employee_id);
    fd.set("schedule_type", row.schedule_type);
    fd.set("title", row.title);
    fd.set("description", row.description ?? "");
    fd.set("start_at", patch.start_at ?? row.start_at);
    fd.set("end_at", row.end_at ?? "");
    if (row.all_day) fd.set("all_day", "on");
    fd.set("status", patch.status ?? row.status);
    fd.set("priority", row.priority);
    fd.set("location", row.location ?? "");
    fd.set(
      "result_note",
      patch.result_note !== undefined ? patch.result_note ?? "" : row.result_note ?? "",
    );
    fd.set("customer_reaction", row.customer_reaction ?? "");
    fd.set("next_action", row.next_action ?? "");
    fd.set(
      "next_contact_at",
      patch.next_contact_at !== undefined
        ? patch.next_contact_at ?? ""
        : row.next_contact_at ?? "",
    );
    const result = await updateCustomerScheduleAction(initialActionState, fd);
    setQuickPending(false);
    setToast(result.message ?? result.error ?? null);
    if (result.success) {
      let full = result.schedule ?? null;
      const fetched = await fetchCustomerScheduleAction(row.id);
      if (fetched.success) full = fetched.schedule;
      if (full) upsertSchedule(full);
      setDetail(null);
      router.refresh();
    }
  }

  async function handleDelete(row: CustomerSchedule, reason: string) {
    if (!reason.trim()) {
      setToast("삭제 사유를 입력해 주세요.");
      return;
    }
    setQuickPending(true);
    const fd = new FormData();
    fd.set("schedule_id", row.id);
    fd.set("customer_id", row.customer_id);
    fd.set("delete_reason", reason);
    const result = await deleteCustomerScheduleAction(fd);
    setQuickPending(false);
    setToast(result.message ?? result.error ?? null);
    if (result.success) {
      setSchedules((prev) => prev.filter((s) => s.id !== row.id));
      setDetail(null);
      router.refresh();
    }
  }

  function exportRows() {
    const headers = [
      "일정일자",
      "시작시간",
      "종료시간",
      "고객명",
      "연락처",
      "공사주소",
      "담당자",
      "일정유형",
      "제목",
      "상태",
      "우선순위",
      "장소",
      "상담결과",
      "다음연락일",
      "완료일시",
    ];
    const rows = visible.map((r) => [
      new Date(r.start_at).toLocaleDateString("ko-KR"),
      formatTime(r.start_at),
      r.end_at ? formatTime(r.end_at) : "",
      r.customers?.name ?? "",
      r.customers?.phone ?? "",
      r.customers?.address ?? "",
      r.employees ? employeeLabel(r.employees) : "",
      r.schedule_type,
      r.title,
      r.status,
      r.priority,
      r.location ?? "",
      r.result_note ?? "",
      r.next_contact_at ? new Date(r.next_contact_at).toLocaleDateString("ko-KR") : "",
      r.completed_at ? new Date(r.completed_at).toLocaleString("ko-KR") : "",
    ]);
    return { headers, rows };
  }

  return (
    <div className="space-y-5">
      {toast && <ToastBanner message={toast} />}

      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-start justify-between gap-3 bg-[#f5f6f8]/95 px-1 py-3 backdrop-blur">
        <div>
          <h1 className="text-xl font-bold text-gray-900 lg:text-2xl">고객상담 스케줄</h1>
          <p className="mt-1 text-sm text-gray-500">
            고객 상담·방문·실측·견적발송 일정을 등록하고 관리합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const { headers, rows } = exportRows();
              downloadCsv(`에잇티_고객상담스케줄_${dateStamp()}.csv`, headers, rows);
            }}
            className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 sm:min-h-0"
          >
            CSV 내보내기
          </button>
          <button
            type="button"
            onClick={() => {
              const { headers, rows } = exportRows();
              downloadXls(`에잇티_고객상담스케줄_${dateStamp()}.xls`, headers, rows);
            }}
            className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 sm:min-h-0"
          >
            Excel 내보내기
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="min-h-11 rounded-lg bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700 sm:min-h-0"
          >
            + 새 일정 등록
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-gray-100 bg-white p-1">
        {VIEW_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setView(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              view === t.key
                ? "bg-navy-800 text-white"
                : "text-gray-500 hover:bg-gray-50 hover:text-navy-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="dashboard-card grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-7">
        <div>
          <label className="mb-1 block text-xs text-gray-500">시작일</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">종료일</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">담당자</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            disabled={lockEmployee}
            className={inputClass}
          >
            <option value="">전체</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {employeeLabel(e)}
              </option>
            ))}
          </select>
        </div>
        {access.canViewAll && (
          <div>
            <label className="mb-1 block text-xs text-gray-500">팀</label>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={inputClass}>
              <option value="">전체</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-gray-500">일정유형</label>
          <select value={scheduleType} onChange={(e) => setScheduleType(e.target.value)} className={inputClass}>
            <option value="">전체</option>
            {CUSTOMER_SCHEDULE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">상태</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            <option value="">전체</option>
            {CUSTOMER_SCHEDULE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">우선순위</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputClass}>
            <option value="">전체</option>
            {SCHEDULE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-3 lg:col-span-7">
          <label className="mb-1 block text-xs text-gray-500">검색 (고객명·연락처·주소·제목)</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색어 입력" className={inputClass} />
        </div>
      </div>

      {view === "month" && (
        <MonthGrid
          monthCursor={monthCursor}
          onPrev={() => setMonthCursor((d) => addMonths(d, -1))}
          onNext={() => setMonthCursor((d) => addMonths(d, 1))}
          onToday={() => setMonthCursor(startOfDay(new Date()))}
          days={monthDays}
          byDayKey={byDayKey}
          allSchedules={schedules}
          colorByAssignee={access.canViewAll || access.canViewTeam}
          onDayClick={(d) => {
            setDayCursor(d);
            setView("day");
          }}
          onEventClick={openDetail}
          onDrop={handleMove}
          dragOverKey={dragOverKey}
          setDragOverKey={setDragOverKey}
        />
      )}

      {view === "week" && (
        <WeekColumns
          weekDays={weekDays}
          onPrev={() => setWeekCursor((d) => addDays(d, -7))}
          onNext={() => setWeekCursor((d) => addDays(d, 7))}
          onToday={() => setWeekCursor(startOfDay(new Date()))}
          byDayKey={byDayKey}
          allSchedules={schedules}
          colorByAssignee={access.canViewAll || access.canViewTeam}
          onEventClick={openDetail}
          onDrop={handleMove}
        />
      )}

      {view === "day" && (
        <DayList
          dayCursor={dayCursor}
          onPrev={() => setDayCursor((d) => addDays(d, -1))}
          onNext={() => setDayCursor((d) => addDays(d, 1))}
          onToday={() => setDayCursor(startOfDay(new Date()))}
          rows={byDayKey.get(toDateKeyFromIso(dayCursor.toISOString())) ?? []}
          onEventClick={openDetail}
        />
      )}

      {(view === "list" || view === "today" || view === "unhandled" || view === "nextContact") && (
        <ScheduleTable rows={visible} onRowClick={openDetail} showCustomerColumn={!fixedCustomerId} />
      )}

      {formOpen && (
        <ScheduleFormModal
          key={`${actionResetKey}-${editing?.id ?? "create"}`}
          editing={editing}
          customers={customers}
          employees={employees}
          fixedCustomerId={fixedCustomerId}
          lockEmployee={lockEmployee}
          lockedEmployeeId={access.employeeId}
          action={editing ? updateAction : createAction}
          state={formState}
          pending={formPending}
          forceSave={forceSave}
          setForceSave={setForceSave}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
            setForceSave(false);
          }}
        />
      )}

      {detail && (
        <DetailModal
          row={detail}
          pending={quickPending}
          canEdit={canEditCustomerSchedule(access, detail)}
          onClose={() => setDetail(null)}
          onEdit={() => openEdit(detail)}
          onComplete={() => {
            setCompleteRow(detail);
            setDetail(null);
          }}
          onCancel={() => quickUpdate(detail, { status: "취소" })}
          onPostpone={(newStartAt) => quickUpdate(detail, { status: "연기", start_at: newStartAt })}
          onSetNextContact={(next) => quickUpdate(detail, { next_contact_at: next })}
          onDelete={(reason) => handleDelete(detail, reason)}
        />
      )}

      {completeRow && (
        <CompleteScheduleModal
          row={completeRow}
          onClose={() => setCompleteRow(null)}
          onDone={(message) => {
            setCompleteRow(null);
            setToast(message);
          }}
        />
      )}

      {moveDraft && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-navy-900">일정 이동 확인</h3>
            <p className="mt-2 text-sm text-gray-600">
              <span className="font-medium">{moveDraft.title}</span>을(를){" "}
              <span className="font-medium text-navy-800">{moveDraft.dayLabel}</span>로
              이동할까요? 종료 시각도 같은 간격으로 함께 이동합니다.
            </p>
            {moveDraft.conflicts.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <p className="font-semibold">충돌하는 일정</p>
                <ul className="mt-1 list-disc pl-4">
                  {moveDraft.conflicts.map((c) => (
                    <li key={c.id}>
                      {c.title} ({new Date(c.start_at).toLocaleString("ko-KR")})
                    </li>
                  ))}
                </ul>
                <p className="mt-1">확인 후 강제 이동할 수 있습니다.</p>
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={quickPending}
                onClick={() => setMoveDraft(null)}
                className="rounded-lg border px-3 py-2 text-sm text-gray-600"
              >
                취소
              </button>
              {moveDraft.conflicts.length > 0 ? (
                <button
                  type="button"
                  disabled={quickPending}
                  onClick={() => confirmMove(true)}
                  className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {quickPending ? "이동 중..." : "강제 이동"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={quickPending}
                  onClick={() => confirmMove(false)}
                  className="rounded-lg bg-navy-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {quickPending ? "이동 중..." : "이동"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToastBanner({ message }: { message: string }) {
  const isError = /실패|오류|없|권한/.test(message);
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        isError ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"
      }`}
    >
      {message}
    </div>
  );
}

function MonthGrid({
  monthCursor,
  onPrev,
  onNext,
  onToday,
  days,
  byDayKey,
  allSchedules,
  colorByAssignee,
  onDayClick,
  onEventClick,
  onDrop,
  dragOverKey,
  setDragOverKey,
}: {
  monthCursor: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  days: Date[];
  byDayKey: Map<string, CustomerSchedule[]>;
  allSchedules: CustomerSchedule[];
  colorByAssignee: boolean;
  onDayClick: (d: Date) => void;
  onEventClick: (row: CustomerSchedule) => void;
  onDrop: (id: string, dayKey: string) => void;
  dragOverKey: string | null;
  setDragOverKey: (updater: string | null | ((prev: string | null) => string | null)) => void;
}) {
  const today = toDateKeyFromIso(new Date().toISOString());
  return (
    <div className="dashboard-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onPrev} className="rounded border px-2 py-1 text-xs">
            ‹
          </button>
          <h2 className="text-sm font-semibold text-navy-900">{formatMonthLabel(monthCursor)}</h2>
          <button type="button" onClick={onNext} className="rounded border px-2 py-1 text-xs">
            ›
          </button>
        </div>
        <button type="button" onClick={onToday} className="rounded border px-2 py-1 text-xs text-gray-500">
          오늘
        </button>
      </div>
      <div className="grid grid-cols-7 border-b border-gray-100 text-center text-xs font-medium text-gray-400">
        {WEEKDAY_LABELS_KO.map((w) => (
          <div key={w} className="py-2">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = toDateKeyFromIso(d.toISOString());
          const rows = byDayKey.get(key) ?? [];
          const inMonth = isSameMonth(d, monthCursor);
          const isToday = key === today;
          return (
            <div
              key={key}
              onClick={() => onDayClick(d)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverKey(key);
              }}
              onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) onDrop(id, key);
                setDragOverKey(null);
              }}
              className={`min-h-[92px] cursor-pointer border-b border-r border-gray-100 p-1 text-xs ${
                inMonth ? "bg-white" : "bg-gray-50 text-gray-300"
              } ${dragOverKey === key ? "ring-2 ring-gold-500" : ""}`}
            >
              <div className={`mb-1 text-right text-[11px] ${isToday ? "font-bold text-gold-600" : "text-gray-400"}`}>
                {d.getDate()}
              </div>
              <div className="space-y-0.5">
                {rows.slice(0, 3).map((r) => (
                  <div
                    key={r.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(r);
                    }}
                    className={`${chipClass(r, allSchedules)} border ${assigneeColorClass(r.assigned_employee_id, colorByAssignee)}`}
                    title={`${formatTime(r.start_at)} ${r.customers?.name ?? ""} · ${r.title}`}
                  >
                    {formatTime(r.start_at)} {r.customers?.name ?? r.title}
                  </div>
                ))}
                {rows.length > 3 && (
                  <div className="px-1 text-[10px] text-gray-400">+{rows.length - 3}건 더보기</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekColumns({
  weekDays,
  onPrev,
  onNext,
  onToday,
  byDayKey,
  allSchedules,
  colorByAssignee,
  onEventClick,
  onDrop,
}: {
  weekDays: Date[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  byDayKey: Map<string, CustomerSchedule[]>;
  allSchedules: CustomerSchedule[];
  colorByAssignee: boolean;
  onEventClick: (row: CustomerSchedule) => void;
  onDrop: (id: string, dayKey: string) => void;
}) {
  const today = toDateKeyFromIso(new Date().toISOString());
  return (
    <div className="dashboard-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onPrev} className="rounded border px-2 py-1 text-xs">
            ‹
          </button>
          <h2 className="text-sm font-semibold text-navy-900">
            {formatDayLabel(weekDays[0])} ~ {formatDayLabel(weekDays[6])}
          </h2>
          <button type="button" onClick={onNext} className="rounded border px-2 py-1 text-xs">
            ›
          </button>
        </div>
        <button type="button" onClick={onToday} className="rounded border px-2 py-1 text-xs text-gray-500">
          오늘
        </button>
      </div>
      <div className="grid grid-cols-1 divide-y divide-gray-100 sm:grid-cols-7 sm:divide-x sm:divide-y-0">
        {weekDays.map((d) => {
          const key = toDateKeyFromIso(d.toISOString());
          const rows = [...(byDayKey.get(key) ?? [])].sort((a, b) => (a.start_at < b.start_at ? -1 : 1));
          const isToday = key === today;
          return (
            <div
              key={key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) onDrop(id, key);
              }}
              className="min-h-[140px] p-2"
            >
              <div className={`mb-2 text-xs font-medium ${isToday ? "text-gold-600" : "text-gray-500"}`}>
                {formatDayLabel(d)}
              </div>
              <div className="space-y-1">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
                    onClick={() => onEventClick(r)}
                    className={`${chipClass(r, allSchedules)} border ${assigneeColorClass(r.assigned_employee_id, colorByAssignee)}`}
                  >
                    <span className="mr-1 text-[10px] text-gray-400">{formatTime(r.start_at)}</span>
                    {r.customers?.name ?? r.title}
                  </div>
                ))}
                {rows.length === 0 && <p className="text-[11px] text-gray-300">일정 없음</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayList({
  dayCursor,
  onPrev,
  onNext,
  onToday,
  rows,
  onEventClick,
}: {
  dayCursor: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  rows: CustomerSchedule[];
  onEventClick: (row: CustomerSchedule) => void;
}) {
  const sorted = [...rows].sort((a, b) => (a.start_at < b.start_at ? -1 : 1));
  return (
    <div className="dashboard-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onPrev} className="rounded border px-2 py-1 text-xs">
            ‹
          </button>
          <h2 className="text-sm font-semibold text-navy-900">{formatDayLabel(dayCursor)}</h2>
          <button type="button" onClick={onNext} className="rounded border px-2 py-1 text-xs">
            ›
          </button>
        </div>
        <button type="button" onClick={onToday} className="rounded border px-2 py-1 text-xs text-gray-500">
          오늘
        </button>
      </div>
      <div className="divide-y divide-gray-100">
        {sorted.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onEventClick(r)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
          >
            <div>
              <p className={`text-sm font-medium ${r.priority === "긴급" ? "text-red-700" : "text-gray-900"}`}>
                {r.title}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {r.customers?.name} · {r.schedule_type} · {formatTime(r.start_at)}
                {r.end_at ? `~${formatTime(r.end_at)}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(r.status)}`}>
                {r.status}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${priorityBadgeClass(r.priority)}`}>
                {r.priority}
              </span>
            </div>
          </button>
        ))}
        {sorted.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-400">해당 일자에 등록된 일정이 없습니다.</p>
        )}
      </div>
    </div>
  );
}

function ScheduleTable({
  rows,
  onRowClick,
  showCustomerColumn,
}: {
  rows: CustomerSchedule[];
  onRowClick: (r: CustomerSchedule) => void;
  showCustomerColumn: boolean;
}) {
  return (
    <div className="dashboard-card overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="px-3 py-2">일시</th>
            <th className="px-3 py-2">유형</th>
            <th className="px-3 py-2">제목</th>
            {showCustomerColumn && <th className="px-3 py-2">고객</th>}
            <th className="px-3 py-2">담당자</th>
            <th className="px-3 py-2">상태</th>
            <th className="px-3 py-2">우선순위</th>
            <th className="px-3 py-2">다음연락일</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const overdue = isCustomerScheduleOverdue(r);
            const done = r.status === "완료";
            return (
              <tr
                key={r.id}
                onClick={() => onRowClick(r)}
                className={`cursor-pointer border-b border-gray-50 hover:bg-gray-50 ${done ? "opacity-50" : ""} ${
                  overdue ? "bg-red-50/60" : ""
                }`}
              >
                <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">
                  {new Date(r.start_at).toLocaleDateString("ko-KR")} {formatTime(r.start_at)}
                </td>
                <td className="px-3 py-2 text-xs">{r.schedule_type}</td>
                <td className={`px-3 py-2 font-medium ${r.priority === "긴급" ? "text-red-700" : "text-gray-800"}`}>
                  {r.title}
                </td>
                {showCustomerColumn && (
                  <td className="px-3 py-2 text-xs">
                    <Link
                      href={`/customers/${r.customer_id}`}
                      className="text-navy-800 underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.customers?.name ?? "-"}
                    </Link>
                  </td>
                )}
                <td className="px-3 py-2 text-xs">{r.employees ? employeeLabel(r.employees) : "-"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(r.status)}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${priorityBadgeClass(r.priority)}`}>
                    {r.priority}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {r.next_contact_at ? new Date(r.next_contact_at).toLocaleDateString("ko-KR") : "-"}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={showCustomerColumn ? 8 : 7} className="px-3 py-10 text-center text-sm text-gray-400">
                조건에 맞는 일정이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ScheduleFormModal({
  editing,
  customers,
  employees,
  fixedCustomerId,
  lockEmployee,
  lockedEmployeeId,
  action,
  state,
  pending,
  forceSave,
  setForceSave,
  onClose,
}: {
  editing: CustomerSchedule | null;
  customers: CustomerLite[];
  employees: Employee[];
  fixedCustomerId: string | null | undefined;
  lockEmployee: boolean;
  lockedEmployeeId: string | null;
  action: (payload: FormData) => void;
  state: ScheduleActionResult;
  pending: boolean;
  forceSave: boolean;
  setForceSave: (v: boolean) => void;
  onClose: () => void;
}) {
  const fixedCustomer = fixedCustomerId ? customers.find((c) => c.id === fixedCustomerId) : null;
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    editing?.customer_id ?? fixedCustomerId ?? "",
  );
  const [assignedEmployeeId, setAssignedEmployeeId] = useState(
    editing?.assigned_employee_id ?? lockedEmployeeId ?? "",
  );
  const [scheduleType, setScheduleType] = useState(
    editing?.schedule_type ?? CUSTOMER_SCHEDULE_TYPES[0],
  );
  const [title, setTitle] = useState(editing?.title ?? "");
  const [startAt, setStartAt] = useState(
    toDateTimeLocalStep10(editing?.start_at) ||
      toDateTimeLocalStep10(new Date().toISOString()),
  );
  const [endAt, setEndAt] = useState(toDateTimeLocalStep10(editing?.end_at));
  const [allDay, setAllDay] = useState(editing?.all_day ?? false);
  const [status, setStatus] = useState(editing?.status ?? "예정");
  const [priority, setPriority] = useState(editing?.priority ?? "보통");
  const [location, setLocation] = useState(editing?.location ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [resultNote, setResultNote] = useState(editing?.result_note ?? "");
  const [nextContactAt, setNextContactAt] = useState(
    toDateTimeLocalStep10(editing?.next_contact_at),
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const selectedCustomer =
    customers.find((c) => c.id === selectedCustomerId) ?? fixedCustomer ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-navy-900">{editing ? "일정 수정" : "일정 등록"}</h3>
          <button type="button" onClick={onClose} className="text-sm text-gray-400">
            닫기
          </button>
        </div>
        <form
          action={action}
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            if (endAt && startAt && new Date(endAt).getTime() < new Date(startAt).getTime()) {
              e.preventDefault();
              setLocalError("종료시간은 시작시간보다 빠를 수 없습니다.");
              return;
            }
            setLocalError(null);
          }}
        >
          {editing && <input type="hidden" name="schedule_id" value={editing.id} />}
          <input type="hidden" name="force_save" value={forceSave ? "1" : "0"} />

          <label className="text-xs text-gray-600 sm:col-span-2">
            고객 *
            {fixedCustomerId ? (
              <>
                <input type="hidden" name="customer_id" value={fixedCustomerId} />
                <input disabled value={fixedCustomer?.name ?? fixedCustomerId} className={`${inputClass} mt-1 bg-gray-50`} />
              </>
            ) : (
              <select
                name="customer_id"
                required
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className={`${inputClass} mt-1`}
              >
                <option value="">고객 선택</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone ?? "-"})
                  </option>
                ))}
              </select>
            )}
          </label>

          {selectedCustomer && (
            <div className="sm:col-span-2 rounded-lg border border-gold-200 bg-gold-50/60 px-3 py-2 text-xs text-navy-900">
              <p>
                <span className="font-semibold">{selectedCustomer.name}</span>
                {selectedCustomer.status ? ` · ${selectedCustomer.status}` : ""}
              </p>
              <p className="mt-0.5 text-navy-800/80">
                {selectedCustomer.phone ?? "-"} · {selectedCustomer.address ?? "주소 없음"}
              </p>
              {selectedCustomer.recentQuoteAmount != null && (
                <p className="mt-0.5">
                  최근 견적금액: {selectedCustomer.recentQuoteAmount.toLocaleString("ko-KR")}원
                </p>
              )}
              {selectedCustomer.recentConsult && (
                <p className="mt-0.5 line-clamp-2">최근 상담: {selectedCustomer.recentConsult}</p>
              )}
            </div>
          )}

          <label className="text-xs text-gray-600">
            담당자 *
            {lockEmployee ? (
              <>
                <input type="hidden" name="assigned_employee_id" value={lockedEmployeeId ?? ""} />
                <input
                  disabled
                  value={employees.find((e) => e.id === lockedEmployeeId)?.name ?? ""}
                  className={`${inputClass} mt-1 bg-gray-50`}
                />
              </>
            ) : (
              <select
                name="assigned_employee_id"
                required
                value={assignedEmployeeId}
                onChange={(e) => setAssignedEmployeeId(e.target.value)}
                className={`${inputClass} mt-1`}
              >
                <option value="">담당자 선택</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {employeeLabel(e)}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="text-xs text-gray-600">
            일정유형 *
            <select
              name="schedule_type"
              required
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value)}
              className={`${inputClass} mt-1`}
            >
              {CUSTOMER_SCHEDULE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-gray-600 sm:col-span-2">
            제목 *
            <input
              name="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>

          <label className="text-xs text-gray-600">
            시작일시 *
            <input
              type="datetime-local"
              name="start_at"
              required
              step={600}
              value={startAt}
              onChange={(e) => {
                setStartAt(e.target.value);
                setLocalError(null);
              }}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs text-gray-600">
            종료일시
            <input
              type="datetime-local"
              name="end_at"
              step={600}
              value={endAt}
              onChange={(e) => {
                setEndAt(e.target.value);
                setLocalError(null);
              }}
              className={`${inputClass} mt-1`}
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              name="all_day"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />{" "}
            종일
          </label>

          <label className="text-xs text-gray-600">
            상태
            <select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={`${inputClass} mt-1`}
            >
              {CUSTOMER_SCHEDULE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-gray-600">
            우선순위
            <select
              name="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={`${inputClass} mt-1`}
            >
              {SCHEDULE_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-gray-600 sm:col-span-2">
            장소
            <input
              name="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>

          <label className="text-xs text-gray-600 sm:col-span-2">
            설명
            <textarea
              name="description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${inputClass} mt-1 resize-y`}
            />
          </label>

          <label className="text-xs text-gray-600 sm:col-span-2">
            결과메모
            <textarea
              name="result_note"
              rows={2}
              value={resultNote}
              onChange={(e) => setResultNote(e.target.value)}
              className={`${inputClass} mt-1 resize-y`}
            />
          </label>

          <label className="text-xs text-gray-600 sm:col-span-2">
            다음 연락일시
            <input
              type="datetime-local"
              name="next_contact_at"
              step={600}
              value={nextContactAt}
              onChange={(e) => setNextContactAt(e.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>

          {localError && (
            <p className="text-sm text-red-600 sm:col-span-2">{localError}</p>
          )}

          {state.conflicts && state.conflicts.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 sm:col-span-2">
              <p className="font-medium">담당자 일정이 겹칩니다:</p>
              <ul className="mt-1 list-disc pl-4">
                {state.conflicts.map((c) => (
                  <li key={c.id}>
                    {c.title} ({new Date(c.start_at).toLocaleString("ko-KR")})
                  </li>
                ))}
              </ul>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={forceSave} onChange={(e) => setForceSave(e.target.checked)} />
                겹치는 일정을 확인했습니다. 그래도 저장합니다.
              </label>
            </div>
          )}

          {state.error && !(state.conflicts && state.conflicts.length > 0) && (
            <p className="text-sm text-red-600 sm:col-span-2 whitespace-pre-wrap">
              {state.error}
            </p>
          )}

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" disabled={pending} className="min-h-10 rounded-lg bg-navy-800 px-4 py-2 text-sm text-white disabled:opacity-60">
              {pending ? "저장 중…" : "저장"}
            </button>
            <button type="button" onClick={onClose} className="min-h-10 rounded-lg border px-4 py-2 text-sm">
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DetailModal({
  row,
  pending,
  canEdit,
  onClose,
  onEdit,
  onComplete,
  onCancel,
  onPostpone,
  onSetNextContact,
  onDelete,
}: {
  row: CustomerSchedule;
  pending: boolean;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onPostpone: (newStartAt: string) => void;
  onSetNextContact: (next: string | null) => void;
  onDelete: (reason: string) => void;
}) {
  const [postponeAt, setPostponeAt] = useState(toDateTimeLocalStep10(row.start_at));
  const [nextContactAt, setNextContactAt] = useState(
    toDateTimeLocalStep10(row.next_contact_at),
  );
  const [showDelete, setShowDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const overdue = isCustomerScheduleOverdue(row);
  const editDisabledReason = !canEdit
    ? row.status === "완료"
      ? "완료된 일정은 관리자만 수정할 수 있습니다."
      : "본인 담당 일정만 수정할 수 있습니다."
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-navy-900">{row.title}</h3>
            <p className="mt-1 text-xs font-medium text-gray-700">
              {row.schedule_type} · {new Date(row.start_at).toLocaleString("ko-KR")}
              {row.end_at ? ` ~ ${new Date(row.end_at).toLocaleString("ko-KR")}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm font-medium text-gray-600">
            닫기
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(row.status)}`}>{row.status}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${priorityBadgeClass(row.priority)}`}>{row.priority}</span>
          {overdue && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">미완료(지연)</span>}
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 font-medium text-gray-600">고객</dt>
            <dd className="text-right font-semibold text-navy-900">
              <Link href={`/customers/${row.customer_id}`} className="text-navy-900 underline">
                {row.customers?.name ?? "-"}
              </Link>
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 font-medium text-gray-600">연락처</dt>
            <dd className="text-right font-semibold text-navy-900">
              {row.customers?.phone ?? "-"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 font-medium text-gray-600">담당자</dt>
            <dd className="text-right font-semibold text-navy-900">
              {row.employees ? employeeLabel(row.employees) : "-"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 font-medium text-gray-600">장소</dt>
            <dd className="text-right font-semibold text-navy-900">
              {row.location ?? "-"}
            </dd>
          </div>
          {row.description && (
            <div>
              <dt className="font-medium text-gray-600">설명</dt>
              <dd className="mt-1 whitespace-pre-wrap font-medium text-navy-900">
                {row.description}
              </dd>
            </div>
          )}
          {row.result_note && (
            <div>
              <dt className="font-medium text-gray-600">결과메모</dt>
              <dd className="mt-1 whitespace-pre-wrap font-medium text-navy-900">
                {row.result_note}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canEdit || pending}
            title={editDisabledReason ?? undefined}
            onClick={onEdit}
            className="rounded-lg border border-navy-800 bg-navy-800 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500"
          >
            수정
          </button>
          {!canEdit && editDisabledReason && (
            <p className="w-full text-xs text-gray-600">{editDisabledReason}</p>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={onComplete}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
          >
            완료 처리
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-60"
          >
            취소 처리
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setShowDelete((v) => !v)}
            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 disabled:opacity-60"
          >
            삭제
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-100 p-3">
            <p className="text-xs font-medium text-gray-700">연기</p>
            <input
              type="datetime-local"
              step={600}
              value={postponeAt}
              onChange={(e) => setPostponeAt(e.target.value)}
              className={`${inputClass} mt-2`}
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => onPostpone(new Date(postponeAt).toISOString())}
              className="mt-2 w-full rounded-lg bg-amber-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
            >
              연기 적용
            </button>
          </div>
          <div className="rounded-lg border border-gray-100 p-3">
            <p className="text-xs font-medium text-gray-700">다음 연락일 지정</p>
            <input
              type="datetime-local"
              step={600}
              value={nextContactAt}
              onChange={(e) => setNextContactAt(e.target.value)}
              className={`${inputClass} mt-2`}
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => onSetNextContact(nextContactAt ? new Date(nextContactAt).toISOString() : null)}
              className="mt-2 w-full rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
            >
              다음연락일 저장
            </button>
          </div>
        </div>

        {showDelete && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-medium text-red-700">삭제 사유 *</p>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              rows={2}
              className={`${inputClass} mt-2`}
              placeholder="삭제 사유를 입력하세요"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => onDelete(deleteReason)}
              className="mt-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
            >
              삭제 확정
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
