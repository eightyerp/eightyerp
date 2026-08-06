"use client";

import Link from "next/link";
import {
  Fragment,
  useActionState,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  createProcessScheduleAction,
  deleteProcessScheduleAction,
  moveProcessScheduleAction,
  updateProcessScheduleAction,
  type ScheduleActionResult,
} from "@/app/actions/schedules";
import {
  addDays,
  addMonths,
  buildMonthGrid,
  clamp,
  dayIndexInRange,
  endOfMonth,
  formatDayLabel,
  formatMonthLabel,
  formatTime,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toDateKeyFromIso,
  toDateTimeInputValue,
  WEEKDAY_LABELS_KO,
} from "@/components/schedules/calendar-utils";
import { downloadCsv, downloadXls, dateStamp } from "@/components/schedules/export-utils";
import { getProjectColor } from "@/components/schedules/project-colors";
import { isProcessDelayed } from "@/lib/crm/schedule-utils";
import {
  PROCESS_NAME_SUGGESTIONS,
  PROCESS_SCHEDULE_STATUSES,
  SCHEDULE_STATUS_BADGE,
} from "@/lib/crm/schedule-constants";
import type { Employee, ProjectProcessSchedule, Team } from "@/types/database";

type ProjectLite = {
  id: string;
  name: string;
  customer_id: string;
  address: string | null;
  construction_start_at: string | null;
};

type Access = {
  canViewAll: boolean;
  canViewTeam: boolean;
  employeeId: string | null;
  role: string | null;
};

type Props = {
  initialSchedules: ProjectProcessSchedule[];
  employees: Employee[];
  teams: Team[];
  projects: ProjectLite[];
  access: Access;
  fixedProjectId?: string | null;
  /** projects 테이블 미적용 또는 현장 0건일 때 안내 UI */
  projectsTableMissing?: boolean;
  /** 현장 상세에서 공사 일정 등록 진입 시 폼 자동 오픈 */
  initialCreateOpen?: boolean;
};

type ViewMode =
  | "month"
  | "week"
  | "byProject"
  | "byProcess"
  | "gantt"
  | "today"
  | "delayed"
  | "byEmployee";

const VIEW_TABS: { key: ViewMode; label: string }[] = [
  { key: "month", label: "월간" },
  { key: "week", label: "주간" },
  { key: "byProject", label: "현장별" },
  { key: "byProcess", label: "공종별" },
  { key: "gantt", label: "간트" },
  { key: "today", label: "오늘" },
  { key: "delayed", label: "지연" },
  { key: "byEmployee", label: "담당자별" },
];

const initialActionState: ScheduleActionResult = { success: false };

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

function employeeLabel(e: Pick<Employee, "name" | "title">): string {
  return `${e.name} ${e.title}`;
}

function statusBadgeClass(status: string): string {
  return SCHEDULE_STATUS_BADGE[status] ?? "bg-slate-100 text-slate-900";
}

function projectSiteName(row: ProjectProcessSchedule): string {
  return row.projects?.name?.trim() || "현장 미지정";
}

function formatTimeRange(row: ProjectProcessSchedule): string {
  const start = formatTime(row.start_at);
  if (!row.end_at) return start;
  return `${start}~${formatTime(row.end_at)}`;
}

/** 현장별 색상 + 상태(완료/지연/취소) 오버레이 */
function chipClass(row: ProjectProcessSchedule): string {
  const delayed = isProcessDelayed(row);
  const done = row.status === "완료";
  const cancelled = row.status === "취소";
  const tone = getProjectColor(row.project_id);
  const base =
    "block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] font-semibold cursor-pointer";
  if (cancelled) {
    return `${base} border-gray-300 bg-gray-100 text-slate-600 line-through`;
  }
  if (done) {
    return `${base} border-gray-200 bg-gray-50 text-slate-600 opacity-80`;
  }
  if (delayed) {
    return `${base} border-2 border-red-500 ${tone.bg} ${tone.text}`;
  }
  return `${base} ${tone.border} ${tone.bg} ${tone.text}`;
}

function chipLabel(row: ProjectProcessSchedule): string {
  const check = row.status === "완료" ? "✓ " : "";
  return `${check}${projectSiteName(row)} · ${row.process_name}`;
}

export default function ProcessSchedulesWorkspace({
  initialSchedules,
  employees,
  teams,
  projects,
  access,
  fixedProjectId = null,
  projectsTableMissing = false,
  initialCreateOpen = false,
}: Props) {
  const [view, setView] = useState<ViewMode>(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "byProject" : "month",
  );
  const [monthCursor, setMonthCursor] = useState(() => startOfDay(new Date()));
  const [weekCursor, setWeekCursor] = useState(() => startOfDay(new Date()));

  const lockEmployee = !access.canViewAll && !access.canViewTeam;

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [employeeId, setEmployeeId] = useState(lockEmployee ? access.employeeId ?? "" : "");
  const [teamId, setTeamId] = useState("");
  const [projectId, setProjectId] = useState(fixedProjectId ?? "");
  const [processName, setProcessName] = useState("");
  const [status, setStatus] = useState("");
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [q, setQ] = useState("");

  const [formOpen, setFormOpen] = useState(initialCreateOpen);
  const [editing, setEditing] = useState<ProjectProcessSchedule | null>(null);
  const [detail, setDetail] = useState<ProjectProcessSchedule | null>(null);
  const [forceSave, setForceSave] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [quickPending, setQuickPending] = useState(false);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const [createState, createAction, createPending] = useActionState(
    createProcessScheduleAction,
    initialActionState,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateProcessScheduleAction,
    initialActionState,
  );
  const formState = editing ? updateState : createState;
  const formPending = editing ? updatePending : createPending;

  // 폼 자동 오픈은 useState(initialCreateOpen) 초기값으로 처리 (editing/forceSave 기본값과 동일)

  useEffect(() => {
    if (!formState.success) return;
    const id = window.setTimeout(() => {
      const warn = formState.warnings?.length
        ? ` ${formState.warnings.join(" ")}`
        : "";
      setToast((formState.message ?? "저장되었습니다.") + warn);
      setFormOpen(false);
      setEditing(null);
      setForceSave(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, [formState]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const processNameOptions = useMemo(() => {
    const fromData = initialSchedules.map((r) => r.process_name).filter(Boolean);
    return [...new Set([...PROCESS_NAME_SUGGESTIONS, ...fromData])].sort((a, b) =>
      a.localeCompare(b, "ko"),
    );
  }, [initialSchedules]);

  const filtered = useMemo(() => {
    let rows = initialSchedules;
    if (fixedProjectId) rows = rows.filter((r) => r.project_id === fixedProjectId);
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
    if (projectId) rows = rows.filter((r) => r.project_id === projectId);
    if (processName) rows = rows.filter((r) => r.process_name === processName);
    if (status) rows = rows.filter((r) => r.status === status);
    if (delayedOnly) rows = rows.filter((r) => isProcessDelayed(r));
    const qq = q.trim().toLowerCase();
    if (qq) {
      rows = rows.filter((r) =>
        [r.customers?.name, r.projects?.name, r.projects?.address, r.process_name, r.title]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(qq),
      );
    }
    return rows;
  }, [
    initialSchedules,
    fixedProjectId,
    from,
    to,
    employeeId,
    teamId,
    projectId,
    processName,
    status,
    delayedOnly,
    q,
  ]);

  const visible = useMemo(() => {
    if (view === "today") {
      const start = startOfDay(new Date()).getTime();
      const end = start + 86400000;
      return filtered.filter((r) => {
        const s = new Date(r.start_at).getTime();
        const e = r.end_at ? new Date(r.end_at).getTime() : s;
        return s < end && e >= start;
      });
    }
    if (view === "delayed") {
      return filtered.filter((r) => isProcessDelayed(r));
    }
    return [...filtered].sort((a, b) => (a.start_at < b.start_at ? -1 : 1));
  }, [filtered, view]);

  const byDayKey = useMemo(() => {
    const map = new Map<string, ProjectProcessSchedule[]>();
    for (const r of filtered) {
      const key = toDateKeyFromIso(r.start_at);
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return map;
  }, [filtered]);

  const monthDays = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);
  const weekDays = useMemo(() => {
    const start = startOfWeek(weekCursor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [weekCursor]);

  const byProjectGroups = useMemo(() => groupRows(visible, (r) => r.project_id ?? "__none__", (_k, rows) => rows[0]?.projects?.name ?? "현장 미지정"), [visible]);
  const byProcessGroups = useMemo(() => groupRows(visible, (r) => r.process_name, (k) => k).sort((a, b) => a.label.localeCompare(b.label)), [visible]);
  const byEmployeeGroups = useMemo(
    () =>
      groupRows(
        visible,
        (r) => r.assigned_employee_id ?? "__none__",
        (_k, rows) => (rows[0]?.employees ? employeeLabel(rows[0].employees) : "미배정"),
      ),
    [visible],
  );

  function openCreate() {
    setEditing(null);
    setForceSave(false);
    setFormOpen(true);
  }

  function openEdit(row: ProjectProcessSchedule) {
    setEditing(row);
    setForceSave(false);
    setDetail(null);
    setFormOpen(true);
  }

  async function handleMove(id: string, newDayKey: string) {
    const row = initialSchedules.find((r) => r.id === id);
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
    const result = await moveProcessScheduleAction({
      id,
      startAt: newStart.toISOString(),
      endAt: newEnd,
      customerId: row.customer_id,
      projectId: row.project_id,
    });
    setToast(result.message ?? result.error ?? null);
  }

  async function quickUpdate(
    row: ProjectProcessSchedule,
    patch: Partial<{ status: string; progress: number; completion_note: string | null }>,
  ) {
    setQuickPending(true);
    const fd = new FormData();
    fd.set("schedule_id", row.id);
    if (row.project_id) fd.set("project_id", row.project_id);
    fd.set("customer_id", row.customer_id);
    if (row.assigned_employee_id) fd.set("assigned_employee_id", row.assigned_employee_id);
    fd.set("process_name", row.process_name);
    fd.set("title", row.title);
    fd.set("description", row.description ?? "");
    fd.set("start_at", row.start_at);
    fd.set("end_at", row.end_at ?? "");
    if (row.all_day) fd.set("all_day", "on");
    fd.set("status", patch.status ?? row.status);
    fd.set("progress", String(patch.progress ?? row.progress));
    fd.set("contractor_name", row.contractor_name ?? "");
    fd.set("contractor_contact", row.contractor_contact ?? "");
    fd.set("location", row.location ?? "");
    if (row.dependency_schedule_id) fd.set("dependency_schedule_id", row.dependency_schedule_id);
    fd.set("color_key", row.color_key ?? "");
    fd.set("checklist_note", row.checklist_note ?? "");
    fd.set(
      "completion_note",
      patch.completion_note !== undefined ? patch.completion_note ?? "" : row.completion_note ?? "",
    );
    const result = await updateProcessScheduleAction(initialActionState, fd);
    setQuickPending(false);
    setToast(result.message ?? result.error ?? null);
    if (result.success) setDetail(null);
  }

  async function handleDelete(row: ProjectProcessSchedule, reason: string) {
    if (!reason.trim()) {
      setToast("삭제 사유를 입력해 주세요.");
      return;
    }
    setQuickPending(true);
    const fd = new FormData();
    fd.set("schedule_id", row.id);
    fd.set("customer_id", row.customer_id);
    if (row.project_id) fd.set("project_id", row.project_id);
    fd.set("delete_reason", reason);
    const result = await deleteProcessScheduleAction(fd);
    setQuickPending(false);
    setToast(result.message ?? result.error ?? null);
    if (result.success) setDetail(null);
  }

  function exportRows() {
    const headers = [
      "날짜",
      "종료일",
      "현장명",
      "고객명",
      "공정명",
      "제목",
      "담당자",
      "상태",
      "진행률",
      "협력업체",
      "협력업체연락처",
      "지연여부",
    ];
    const rows = visible.map((r) => [
      new Date(r.start_at).toLocaleDateString("ko-KR"),
      r.end_at ? new Date(r.end_at).toLocaleDateString("ko-KR") : "",
      r.projects?.name ?? "",
      r.customers?.name ?? "",
      r.process_name,
      r.title,
      r.employees ? employeeLabel(r.employees) : "",
      r.status,
      r.progress,
      r.contractor_name ?? "",
      r.contractor_contact ?? "",
      isProcessDelayed(r) ? "지연" : "",
    ]);
    return { headers, rows };
  }

  const dependency = detail?.dependency_schedule_id
    ? initialSchedules.find((s) => s.id === detail.dependency_schedule_id) ?? null
    : null;

  const noProjects = !fixedProjectId && projects.length === 0;
  const noSchedules = initialSchedules.length === 0;
  const showProjectFirstGuide = noProjects && noSchedules;

  return (
    <div className="space-y-5">
      {toast && <ToastBanner message={toast} />}

      <div className="flex flex-wrap items-start justify-between gap-3">
        {!fixedProjectId ? (
          <div>
            <h1 className="text-xl font-bold text-slate-900 lg:text-2xl">공사 스케줄</h1>
            <p className="mt-1 text-sm text-gray-600">
              현장별 공사·공종 일정을 관리합니다. 일정 색상은 현장 기준으로 구분됩니다.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-600">
              이 현장의 공사 일정입니다. 동일 현장 일정은 같은 색으로 표시됩니다.
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const { headers, rows } = exportRows();
              downloadCsv(`construction-schedules-${dateStamp()}.csv`, headers, rows);
            }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-slate-100"
          >
            CSV 내보내기
          </button>
          <button
            type="button"
            onClick={() => {
              const { headers, rows } = exportRows();
              downloadXls(`construction-schedules-${dateStamp()}.xls`, headers, rows);
            }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-slate-100"
          >
            Excel 내보내기
          </button>
          <button
            type="button"
            onClick={openCreate}
            disabled={noProjects && !fixedProjectId}
            title={
              noProjects && !fixedProjectId
                ? "현장을 먼저 등록해 주세요."
                : undefined
            }
            className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-75"
          >
            + 공사 일정 등록
          </button>
        </div>
      </div>

      {showProjectFirstGuide && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <p className="text-base font-semibold text-navy-900">
            등록된 공사 일정이 없습니다
          </p>
          <p className="mt-2 text-sm text-slate-900">
            현장관리에서 현장을 먼저 등록해주세요.
          </p>
          {projectsTableMissing && (
            <p className="mt-3 text-xs text-amber-800">
              현장 정보를 불러올 수 없습니다. 관리자에게 문의해 주세요.
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              href="/customers"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-navy-900 hover:bg-slate-100"
            >
              고객·현장 관리로 이동
            </Link>
          </div>
        </div>
      )}

      {!showProjectFirstGuide && (
      <>
      <div className="flex flex-wrap gap-1 rounded-lg border border-gray-100 bg-white p-1">
        {VIEW_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setView(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              view === t.key ? "bg-navy-800 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-navy-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="dashboard-card grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-7">
        <div>
          <label className="mb-1 block text-xs text-slate-600">시작일</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">종료일</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">담당자</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={lockEmployee} className={inputClass}>
            <option value="">전체</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {employeeLabel(e)}
              </option>
            ))}
          </select>
        </div>
        {(access.canViewAll || access.canViewTeam) && (
          <div>
            <label className="mb-1 block text-xs text-slate-600">팀</label>
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
        {!fixedProjectId && (
          <div>
            <label className="mb-1 block text-xs text-slate-600">현장</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputClass}>
              <option value="">전체</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-slate-600">공종</label>
          <select value={processName} onChange={(e) => setProcessName(e.target.value)} className={inputClass}>
            <option value="">전체</option>
            {processNameOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">상태</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            <option value="">전체</option>
            {PROCESS_SCHEDULE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 self-end text-xs text-gray-600">
          <input type="checkbox" checked={delayedOnly} onChange={(e) => setDelayedOnly(e.target.checked)} />
          지연만 보기
        </label>
        <div className="col-span-2 sm:col-span-3 lg:col-span-6">
          <label className="mb-1 block text-xs text-slate-600">검색 (고객명·현장명·주소·공정명·제목)</label>
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
          onEventClick={(row) => setDetail(row)}
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
          onEventClick={(row) => setDetail(row)}
          onDrop={handleMove}
        />
      )}

      {view === "byProject" && (
        <GroupedView groups={byProjectGroups} onEventClick={(row) => setDetail(row)} emptyLabel="조건에 맞는 공사 일정이 없습니다." />
      )}

      {view === "byProcess" && (
        <GroupedView groups={byProcessGroups} onEventClick={(row) => setDetail(row)} emptyLabel="조건에 맞는 공사 일정이 없습니다." />
      )}

      {view === "byEmployee" && (
        <GroupedView groups={byEmployeeGroups} onEventClick={(row) => setDetail(row)} emptyLabel="조건에 맞는 공사 일정이 없습니다." />
      )}

      {view === "gantt" && (
        <GanttView
          monthCursor={monthCursor}
          onPrev={() => setMonthCursor((d) => addMonths(d, -1))}
          onNext={() => setMonthCursor((d) => addMonths(d, 1))}
          onToday={() => setMonthCursor(startOfDay(new Date()))}
          rows={filtered}
          onEventClick={(row) => setDetail(row)}
        />
      )}

      {(view === "today" || view === "delayed") && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((r) => (
            <ProcessCard key={r.id} row={r} onClick={() => setDetail(r)} />
          ))}
          {visible.length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed p-8 text-center text-sm text-slate-600">
              {noSchedules
                ? "등록된 공사 일정이 없습니다. 상단에서 공사 일정을 등록해 주세요."
                : "조건에 맞는 공사 일정이 없습니다."}
            </p>
          )}
        </div>
      )}
      </>
      )}

      {formOpen && (
        <ProcessFormModal
          editing={editing}
          projects={projects}
          employees={employees}
          fixedProjectId={fixedProjectId}
          allSchedules={initialSchedules}
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
          dependency={dependency}
          pending={quickPending}
          onClose={() => setDetail(null)}
          onEdit={() => openEdit(detail)}
          onComplete={() => quickUpdate(detail, { status: "완료", progress: 100 })}
          onDelay={() => quickUpdate(detail, { status: "지연" })}
          onCancel={() => quickUpdate(detail, { status: "취소" })}
          onProgress={(progress) => quickUpdate(detail, { progress })}
          onDelete={(reason) => handleDelete(detail, reason)}
        />
      )}
    </div>
  );
}

function groupRows<T>(
  rows: T[],
  keyFn: (r: T) => string,
  labelFn: (key: string, rows: T[]) => string,
): { key: string; label: string; rows: T[] }[] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyFn(r);
    const list = map.get(k) ?? [];
    list.push(r);
    map.set(k, list);
  }
  return Array.from(map.entries())
    .map(([key, list]) => ({ key, label: labelFn(key, list), rows: list }))
    .sort((a, b) => {
      if (a.key === "__none__") return 1;
      if (b.key === "__none__") return -1;
      return a.label.localeCompare(b.label);
    });
}

function ToastBanner({ message }: { message: string }) {
  const isError = /실패|오류|없|권한/.test(message);
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        isError ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-emerald-100 text-emerald-900"
      }`}
    >
      {message}
    </div>
  );
}

function ProcessCard({ row, onClick }: { row: ProjectProcessSchedule; onClick: () => void }) {
  const delayed = isProcessDelayed(row);
  const done = row.status === "완료";
  const cancelled = row.status === "취소";
  const tone = getProjectColor(row.project_id);
  return (
    <div
      onClick={onClick}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", row.id)}
      className={`cursor-pointer rounded-lg border p-3 text-xs transition hover:shadow-sm ${
        cancelled
          ? "border-gray-300 bg-gray-100 opacity-80"
          : delayed
            ? `border-2 border-red-500 ${tone.bg}`
            : done
              ? "border-gray-200 bg-gray-50 opacity-75"
              : `${tone.border} ${tone.bg}`
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={`truncate font-bold ${cancelled || done ? "text-gray-600" : tone.text}`}>
          {done ? "✓ " : ""}
          {projectSiteName(row)}
        </p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${statusBadgeClass(row.status)}`}>
          {row.status}
        </span>
      </div>
      <p className={`mt-1.5 font-semibold ${cancelled ? "text-slate-600 line-through" : "text-navy-900"}`}>
        공종: {row.process_name}
      </p>
      <p className="mt-1 font-medium text-navy-900">
        담당: {row.employees ? employeeLabel(row.employees) : "미배정"}
      </p>
      <p className="mt-0.5 font-medium text-navy-800">
        {new Date(row.start_at).toLocaleDateString("ko-KR")} {formatTimeRange(row)}
      </p>
      {row.title && (
        <p className="mt-1 truncate text-slate-900">{row.title}</p>
      )}
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/70">
        <div className="h-1.5 rounded-full bg-navy-700" style={{ width: `${row.progress}%` }} />
      </div>
      {delayed && !cancelled && (
        <p className="mt-1 font-semibold text-red-700">⚠ 지연</p>
      )}
    </div>
  );
}

function GroupedView({
  groups,
  onEventClick,
  emptyLabel,
}: {
  groups: { key: string; label: string; rows: ProjectProcessSchedule[] }[];
  onEventClick: (r: ProjectProcessSchedule) => void;
  emptyLabel: string;
}) {
  if (groups.length === 0) {
    return <p className="dashboard-card p-8 text-center text-sm text-slate-600">{emptyLabel}</p>;
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.key} className="dashboard-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-navy-900">{g.label}</h3>
            <span className="text-xs text-slate-600">{g.rows.length}건</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {g.rows.map((r) => (
              <ProcessCard key={r.id} row={r} onClick={() => onEventClick(r)} />
            ))}
          </div>
        </div>
      ))}
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
  byDayKey: Map<string, ProjectProcessSchedule[]>;
  onEventClick: (row: ProjectProcessSchedule) => void;
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
        <button type="button" onClick={onToday} className="rounded border px-2 py-1 text-xs text-slate-600">
          오늘
        </button>
      </div>
      <div className="grid grid-cols-7 border-b border-gray-100 text-center text-xs font-medium text-slate-600">
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
              className={`min-h-[92px] border-b border-r border-gray-100 p-1 text-xs ${
                inMonth ? "bg-white" : "bg-gray-50 text-slate-600"
              } ${dragOverKey === key ? "ring-2 ring-gold-500" : ""}`}
            >
              <div className={`mb-1 text-right text-[11px] ${isToday ? "font-bold text-gold-600" : "text-slate-600"}`}>
                {d.getDate()}
              </div>
              <div className="space-y-0.5">
                {rows.slice(0, 3).map((r) => (
                  <div
                    key={r.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
                    onClick={() => onEventClick(r)}
                    className={chipClass(r)}
                    title={`${projectSiteName(r)} / ${r.process_name} / ${r.title}`}
                  >
                    {chipLabel(r)}
                  </div>
                ))}
                {rows.length > 3 && <div className="px-1 text-[10px] text-slate-600">+{rows.length - 3}건 더보기</div>}
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
  onEventClick,
  onDrop,
}: {
  weekDays: Date[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  byDayKey: Map<string, ProjectProcessSchedule[]>;
  onEventClick: (row: ProjectProcessSchedule) => void;
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
        <button type="button" onClick={onToday} className="rounded border px-2 py-1 text-xs text-slate-600">
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
              <div className={`mb-2 text-xs font-medium ${isToday ? "text-gold-600" : "text-slate-600"}`}>{formatDayLabel(d)}</div>
              <div className="space-y-1">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
                    onClick={() => onEventClick(r)}
                    className={chipClass(r)}
                    title={`${projectSiteName(r)} / ${r.process_name}`}
                  >
                    <span className="mr-1 text-[10px] opacity-80">{formatTime(r.start_at)}</span>
                    {chipLabel(r)}
                  </div>
                ))}
                {rows.length === 0 && <p className="text-[11px] text-slate-600">일정 없음</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ganttBarStyle(r: ProjectProcessSchedule): {
  className: string;
  style: CSSProperties;
} {
  const delayed = isProcessDelayed(r);
  const done = r.status === "완료";
  const cancelled = r.status === "취소";
  const tone = getProjectColor(r.project_id);
  const base = "cursor-pointer truncate rounded border px-1 py-1 text-[10px] font-semibold";
  if (cancelled) {
    return {
      className: `${base} border-gray-300 bg-gray-200 text-slate-600 line-through`,
      style: {},
    };
  }
  if (done) {
    return {
      className: `${base} border-gray-200 bg-slate-100 text-slate-900 opacity-80`,
      style: {},
    };
  }
  if (delayed) {
    return {
      className: `${base} border-2 border-red-500`,
      style: { backgroundColor: tone.bgHex, color: tone.textHex },
    };
  }
  return {
    className: `${base} border-transparent`,
    style: { backgroundColor: tone.bgHex, color: tone.textHex },
  };
}

function GanttView({
  monthCursor,
  onPrev,
  onNext,
  onToday,
  rows,
  onEventClick,
}: {
  monthCursor: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  rows: ProjectProcessSchedule[];
  onEventClick: (row: ProjectProcessSchedule) => void;
}) {
  const rangeStart = startOfMonth(monthCursor);
  const rangeEnd = endOfMonth(monthCursor);
  const totalDays = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1;
  const days = Array.from({ length: totalDays }, (_, i) => addDays(rangeStart, i));

  const inRange = rows.filter((r) => {
    const s = new Date(r.start_at).getTime();
    const e = r.end_at ? new Date(r.end_at).getTime() : s;
    return s <= rangeEnd.getTime() && e >= rangeStart.getTime();
  });

  return (
    <div className="dashboard-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onPrev} className="rounded border px-2 py-1 text-xs">
            ‹
          </button>
          <h2 className="text-sm font-semibold text-navy-900">{formatMonthLabel(monthCursor)} 간트차트</h2>
          <button type="button" onClick={onNext} className="rounded border px-2 py-1 text-xs">
            ›
          </button>
        </div>
        <button type="button" onClick={onToday} className="rounded border px-2 py-1 text-xs text-slate-600">
          오늘
        </button>
      </div>
      <div className="overflow-x-auto p-3">
        <div
          className="grid gap-y-1"
          style={{
            minWidth: 160 + totalDays * 26,
            gridTemplateColumns: `160px repeat(${totalDays}, 26px)`,
            gridTemplateRows: `24px repeat(${Math.max(inRange.length, 1)}, 26px)`,
          }}
        >
          <div style={{ gridRow: 1, gridColumn: "1 / 2" }} className="sticky left-0 z-10 bg-white" />
          {days.map((d, i) => (
            <div
              key={toDateKeyFromIso(d.toISOString())}
              style={{ gridRow: 1, gridColumn: i + 2 }}
              className="border-b border-gray-100 text-center text-[10px] text-slate-600"
            >
              {d.getDate()}
            </div>
          ))}

          {inRange.length === 0 && (
            <div style={{ gridRow: 2, gridColumn: `1 / span ${totalDays + 1}` }} className="py-6 text-center text-sm text-slate-600">
              해당 월에 표시할 공정이 없습니다.
            </div>
          )}

          {inRange.map((r, i) => {
            const s = clamp(dayIndexInRange(r.start_at, rangeStart), 0, totalDays - 1);
            const e = clamp(dayIndexInRange(r.end_at ?? r.start_at, rangeStart), s, totalDays - 1);
            const span = e - s + 1;
            const bar = ganttBarStyle(r);
            return (
              <Fragment key={r.id}>
                <div
                  style={{ gridRow: i + 2, gridColumn: "1 / 2" }}
                  className="sticky left-0 z-10 truncate bg-white pr-2 text-xs font-medium text-navy-900"
                  title={r.title}
                >
                  {projectSiteName(r)} · {r.process_name}
                </div>
                <div
                  style={{
                    gridRow: i + 2,
                    gridColumn: `${s + 2} / span ${span}`,
                    ...bar.style,
                  }}
                  className={bar.className}
                  onClick={() => onEventClick(r)}
                  title={`${projectSiteName(r)} / ${r.process_name} / ${r.title}`}
                >
                  {r.status === "완료" ? "✓ " : ""}
                  {projectSiteName(r)} · {r.process_name}
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ProcessFormModal({
  editing,
  projects,
  employees,
  fixedProjectId,
  allSchedules,
  lockEmployee,
  lockedEmployeeId,
  action,
  state,
  pending,
  forceSave,
  setForceSave,
  onClose,
}: {
  editing: ProjectProcessSchedule | null;
  projects: ProjectLite[];
  employees: Employee[];
  fixedProjectId: string | null | undefined;
  allSchedules: ProjectProcessSchedule[];
  lockEmployee: boolean;
  lockedEmployeeId: string | null;
  action: (payload: FormData) => void;
  state: ScheduleActionResult;
  pending: boolean;
  forceSave: boolean;
  setForceSave: (v: boolean) => void;
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState(fixedProjectId ?? editing?.project_id ?? "");
  const [processName, setProcessName] = useState(editing?.process_name ?? "");
  const [customProcess, setCustomProcess] = useState(
    Boolean(editing?.process_name) && !(PROCESS_NAME_SUGGESTIONS as readonly string[]).includes(editing?.process_name ?? ""),
  );
  const [progress, setProgress] = useState(editing?.progress ?? 0);
  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  const dependencyOptions = projectId
    ? allSchedules.filter((s) => s.project_id === projectId && s.id !== editing?.id)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-navy-900">
            {editing ? "공사 일정 수정" : "공사 일정 등록"}
          </h3>
          <button type="button" onClick={onClose} className="text-sm text-slate-600">
            닫기
          </button>
        </div>
        <form action={action} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {editing && <input type="hidden" name="schedule_id" value={editing.id} />}
          <input type="hidden" name="force_save" value={forceSave ? "1" : "0"} />
          <input type="hidden" name="customer_id" value={selectedProject?.customer_id ?? editing?.customer_id ?? ""} />

          <label className="text-xs text-gray-600 sm:col-span-2">
            현장 *
            {fixedProjectId ? (
              <>
                <input type="hidden" name="project_id" value={fixedProjectId} />
                <input disabled value={projects.find((p) => p.id === fixedProjectId)?.name ?? fixedProjectId} className={`${inputClass} mt-1 bg-gray-50`} />
              </>
            ) : (
              <select
                name="project_id"
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={`${inputClass} mt-1`}
              >
                <option value="">현장 선택</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.address ? ` (${p.address})` : ""}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="text-xs text-gray-600 sm:col-span-2">
            공정명 *
            <div className="mt-1 flex flex-wrap gap-1.5">
              {PROCESS_NAME_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setProcessName(s);
                    setCustomProcess(false);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-[11px] ${
                    processName === s && !customProcess ? "border-navy-800 bg-navy-800 text-white" : "border-gray-200 text-gray-600 hover:bg-slate-100"
                  }`}
                >
                  {s}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomProcess(true)}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${
                  customProcess ? "border-gold-500 bg-gold-50 text-navy-900" : "border-gray-200 text-gray-600"
                }`}
              >
                직접입력
              </button>
            </div>
            {customProcess ? (
              <input
                name="process_name"
                required
                value={processName}
                onChange={(e) => setProcessName(e.target.value)}
                placeholder="공정명 입력"
                className={`${inputClass} mt-2`}
              />
            ) : (
              <input type="hidden" name="process_name" value={processName} />
            )}
          </label>

          <label className="text-xs text-gray-600 sm:col-span-2">
            제목 *
            <input name="title" required defaultValue={editing?.title ?? ""} className={`${inputClass} mt-1`} />
          </label>

          <label className="text-xs text-gray-600">
            시작일시 *
            <input
              type="datetime-local"
              name="start_at"
              required
              defaultValue={toDateTimeInputValue(editing?.start_at) || toDateTimeInputValue(new Date().toISOString())}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs text-gray-600">
            종료일시
            <input type="datetime-local" name="end_at" defaultValue={toDateTimeInputValue(editing?.end_at)} className={`${inputClass} mt-1`} />
          </label>

          <label className="text-xs text-gray-600">
            담당자
            {lockEmployee ? (
              <>
                <input type="hidden" name="assigned_employee_id" value={lockedEmployeeId ?? ""} />
                <input disabled value={employees.find((e) => e.id === lockedEmployeeId)?.name ?? ""} className={`${inputClass} mt-1 bg-gray-50`} />
              </>
            ) : (
              <select name="assigned_employee_id" defaultValue={editing?.assigned_employee_id ?? ""} className={`${inputClass} mt-1`}>
                <option value="">미배정</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {employeeLabel(e)}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="text-xs text-gray-600">
            상태
            <select name="status" defaultValue={editing?.status ?? "예정"} className={`${inputClass} mt-1`}>
              {PROCESS_SCHEDULE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-gray-600 sm:col-span-2">
            진행률 ({progress}%)
            <input
              type="range"
              name="progress"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="mt-2 w-full accent-gold-500"
            />
          </label>

          <label className="text-xs text-gray-600">
            협력업체명
            <input name="contractor_name" defaultValue={editing?.contractor_name ?? ""} className={`${inputClass} mt-1`} />
          </label>
          <label className="text-xs text-gray-600">
            협력업체 연락처
            <input name="contractor_contact" defaultValue={editing?.contractor_contact ?? ""} className={`${inputClass} mt-1`} />
          </label>

          <label className="text-xs text-gray-600 sm:col-span-2">
            장소
            <input name="location" defaultValue={editing?.location ?? ""} className={`${inputClass} mt-1`} />
          </label>

          <label className="text-xs text-gray-600 sm:col-span-2">
            선행 공정 (의존)
            <select name="dependency_schedule_id" defaultValue={editing?.dependency_schedule_id ?? ""} className={`${inputClass} mt-1`}>
              <option value="">없음</option>
              {dependencyOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.process_name} - {s.title}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-gray-600 sm:col-span-2">
            설명
            <textarea name="description" rows={2} defaultValue={editing?.description ?? ""} className={`${inputClass} mt-1 resize-y`} />
          </label>
          <label className="text-xs text-gray-600 sm:col-span-2">
            체크리스트 메모
            <textarea name="checklist_note" rows={2} defaultValue={editing?.checklist_note ?? ""} className={`${inputClass} mt-1 resize-y`} />
          </label>
          <label className="text-xs text-gray-600 sm:col-span-2">
            완료 메모
            <textarea name="completion_note" rows={2} defaultValue={editing?.completion_note ?? ""} className={`${inputClass} mt-1 resize-y`} />
          </label>

          {state.conflicts && state.conflicts.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 sm:col-span-2">
              <p className="font-medium">담당자 공정 일정이 겹칩니다:</p>
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
            <p className="text-sm text-red-600 sm:col-span-2">{state.error}</p>
          )}

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" disabled={pending || !projectId} className="min-h-10 rounded-lg bg-navy-800 px-4 py-2 text-sm text-white disabled:opacity-75">
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
  dependency,
  pending,
  onClose,
  onEdit,
  onComplete,
  onDelay,
  onCancel,
  onProgress,
  onDelete,
}: {
  row: ProjectProcessSchedule;
  dependency: ProjectProcessSchedule | null;
  pending: boolean;
  onClose: () => void;
  onEdit: () => void;
  onComplete: () => void;
  onDelay: () => void;
  onCancel: () => void;
  onProgress: (progress: number) => void;
  onDelete: (reason: string) => void;
}) {
  const [progress, setProgress] = useState(row.progress);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const delayed = isProcessDelayed(row);
  const address = row.location || row.projects?.address || row.customers?.address || "-";
  const memo =
    [row.completion_note, row.checklist_note, row.description]
      .filter(Boolean)
      .join("\n\n") || null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-navy-900">{row.title}</h3>
            <p className="mt-1 text-xs font-medium text-slate-900">
              {row.process_name} · {new Date(row.start_at).toLocaleString("ko-KR")}
              {row.end_at ? ` ~ ${new Date(row.end_at).toLocaleString("ko-KR")}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm font-medium text-gray-600">
            닫기
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(row.status)}`}>{row.status}</span>
          {delayed && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">지연</span>}
        </div>

        {dependency && isProcessDelayed(dependency) && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            선행 공종({dependency.process_name})이 지연되었습니다.
          </p>
        )}

        <dl className="mt-4 space-y-2.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 font-medium text-gray-600">현장명</dt>
            <dd className="text-right font-semibold text-navy-900">
              {row.project_id ? (
                <Link href={`/projects/${row.project_id}/schedule`} className="underline">
                  {projectSiteName(row)}
                </Link>
              ) : (
                projectSiteName(row)
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 font-medium text-gray-600">고객명</dt>
            <dd className="text-right font-semibold text-navy-900">
              <Link href={`/customers/${row.customer_id}`} className="underline">
                {row.customers?.name ?? "-"}
              </Link>
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 font-medium text-gray-600">주소</dt>
            <dd className="text-right font-semibold text-navy-900">{address}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 font-medium text-gray-600">공종</dt>
            <dd className="text-right font-semibold text-navy-900">{row.process_name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 font-medium text-gray-600">담당자</dt>
            <dd className="text-right font-semibold text-navy-900">
              {row.employees ? employeeLabel(row.employees) : "미배정"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 font-medium text-gray-600">협력업체</dt>
            <dd className="text-right font-semibold text-navy-900">
              {[row.contractor_name, row.contractor_contact].filter(Boolean).join(" · ") || "-"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 font-medium text-gray-600">시작일시</dt>
            <dd className="text-right font-semibold text-navy-900">
              {new Date(row.start_at).toLocaleString("ko-KR")}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 font-medium text-gray-600">종료일시</dt>
            <dd className="text-right font-semibold text-navy-900">
              {row.end_at ? new Date(row.end_at).toLocaleString("ko-KR") : "-"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 font-medium text-gray-600">상태</dt>
            <dd className="text-right font-semibold text-navy-900">{row.status}</dd>
          </div>
          {memo && (
            <div>
              <dt className="font-medium text-gray-600">메모</dt>
              <dd className="mt-1 whitespace-pre-wrap font-medium text-navy-900">{memo}</dd>
            </div>
          )}
        </dl>

        <div className="mt-4 rounded-lg border border-gray-100 p-3">
          <p className="text-xs font-medium text-gray-600">진행률 ({progress}%)</p>
          <input
            type="range"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="mt-2 w-full accent-gold-500"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => onProgress(progress)}
            className="mt-2 w-full rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-75"
          >
            진행률 저장
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={onEdit} className="rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-75">
            수정
          </button>
          <button type="button" disabled={pending} onClick={onComplete} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-75">
            완료 처리
          </button>
          <button type="button" disabled={pending} onClick={onDelay} className="rounded-lg bg-red-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-75">
            지연 처리
          </button>
          <button type="button" disabled={pending} onClick={onCancel} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 disabled:opacity-75">
            취소 처리
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setShowDelete((v) => !v)}
            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 disabled:opacity-75"
          >
            삭제
          </button>
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
              className="mt-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-75"
            >
              삭제 확정
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
