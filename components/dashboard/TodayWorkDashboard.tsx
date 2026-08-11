"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import {
  completeEmployeeTaskAction,
  createEmployeeTaskAction,
  markPhoneCompleteAction,
  postponeScheduleToTodayAction,
  refreshDashboardAction,
  type TaskActionResult,
} from "@/app/actions/employee-tasks";
import CompleteScheduleModal from "@/components/schedules/CompleteScheduleModal";
import {
  downloadCsv,
  downloadXls,
  dateStamp,
} from "@/components/schedules/export-utils";
import { formatPhoneForTel } from "@/lib/crm/contact";
import { formatEmployeeOptionLabel } from "@/lib/crm/constants";
import {
  filterTodayItems,
  formatOverdueLabel,
  type TodayFocus,
  type TodayWorkItem,
  type AssigneeTodayStats,
  type TodayWorkSummary,
} from "@/lib/crm/today-work-shared";
import type { CustomerSchedule, Employee, EmployeeTask, ErpQuote, Team } from "@/types/database";

type TodayWorkBundle = {
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
  summary: TodayWorkSummary;
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

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

const FOCUS_CARDS: {
  key: TodayFocus;
  label: string;
  countKey: keyof TodayWorkBundle["summary"];
  accent: string;
}[] = [
  { key: "consult", label: "오늘 상담", countKey: "todayConsult", accent: "border-sky-200 bg-sky-100 text-sky-900" },
  { key: "survey", label: "오늘 실측", countKey: "todaySurvey", accent: "border-indigo-200 bg-indigo-50 text-indigo-800" },
  { key: "quote_write", label: "오늘 견적작성", countKey: "todayQuoteWrite", accent: "border-violet-200 bg-violet-50 text-violet-800" },
  { key: "quote_send", label: "오늘 견적발송", countKey: "todayQuoteSend", accent: "border-blue-200 bg-sky-100 text-sky-900" },
  { key: "contract", label: "오늘 계약상담", countKey: "todayContract", accent: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  { key: "overdue", label: "지난 미처리", countKey: "overdue", accent: "border-red-200 bg-red-50 text-red-700" },
  { key: "contact", label: "오늘 다음 연락", countKey: "todayContact", accent: "border-gold-300 bg-gold-50 text-navy-900" },
  { key: "expiring", label: "유효기간 임박 견적", countKey: "expiringQuotes", accent: "border-orange-200 bg-orange-50 text-orange-800" },
];

const LIST_FILTERS: { key: TodayFocus; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "consult", label: "상담" },
  { key: "survey", label: "실측" },
  { key: "quote", label: "견적" },
  { key: "contact", label: "연락" },
  { key: "task", label: "내부업무" },
  { key: "unhandled", label: "미처리" },
  { key: "done", label: "완료" },
];

const BADGE_CLASS: Record<string, string> = {
  상담: "bg-sky-100 text-sky-900",
  실측: "bg-indigo-100 text-indigo-800",
  견적: "bg-violet-100 text-violet-800",
  연락: "bg-gold-100 text-navy-900",
  내부업무: "bg-slate-100 text-slate-900",
  경고: "bg-red-100 text-red-700",
  계약: "bg-emerald-100 text-emerald-900",
};

type Props = {
  bundle: TodayWorkBundle;
  schedulesById: Record<string, CustomerSchedule>;
};

const initialTaskState: TaskActionResult = { success: false };

export default function TodayWorkDashboard({ bundle, schedulesById }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [focus, setFocus] = useState<TodayFocus>("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState(bundle.filterEmployeeId ?? "");
  const [teamId, setTeamId] = useState(bundle.filterTeamId ?? "");
  const [taskOpen, setTaskOpen] = useState(false);
  const [completeSchedule, setCompleteSchedule] = useState<CustomerSchedule | null>(null);
  const [nowLabel, setNowLabel] = useState("");

  const [taskState, taskAction, taskPending] = useActionState(
    createEmployeeTaskAction,
    initialTaskState,
  );

  useEffect(() => {
    const tick = () =>
      setNowLabel(
        new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!taskState.success && !taskState.error) return;
    const id = window.setTimeout(() => {
      if (taskState.success) {
        setToast(taskState.message ?? "저장되었습니다.");
        setTaskOpen(false);
        startTransition(() => router.refresh());
      } else if (taskState.error) {
        setToast(taskState.error);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [taskState, router]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const visible = useMemo(
    () => filterTodayItems(bundle.items, focus, showCompleted || focus === "done"),
    [bundle.items, focus, showCompleted],
  );

  const todayDate = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  function applyScope() {
    const params = new URLSearchParams();
    if (employeeId) params.set("employeeId", employeeId);
    if (teamId && bundle.access.canViewAll) params.set("teamId", teamId);
    startTransition(() => {
      router.push(`/dashboard?${params.toString()}`);
      router.refresh();
    });
  }

  function refresh() {
    startTransition(async () => {
      await refreshDashboardAction();
      router.refresh();
      setToast("새로고침되었습니다.");
    });
  }

  async function runAction(
    fn: (fd: FormData) => Promise<TaskActionResult>,
    fd: FormData,
  ) {
    const result = await fn(fd);
    setToast(result.message ?? result.error ?? null);
    if (result.success) startTransition(() => router.refresh());
  }

  function exportRows() {
    const headers = [
      "구분",
      "예정일",
      "예정시간",
      "고객명",
      "연락처",
      "공사주소",
      "제목",
      "담당자",
      "우선순위",
      "상태",
      "견적금액",
      "메모",
      "완료일시",
    ];
    const rows = visible.map((i) => [
      i.badge,
      i.startAt ? new Date(i.startAt).toLocaleDateString("ko-KR") : "",
      i.startAt
        ? new Date(i.startAt).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",
      i.customerName ?? "",
      i.phone ?? "",
      i.address ?? "",
      i.title,
      i.employeeName ?? "",
      i.priority ?? "",
      i.status ?? "",
      i.amount != null ? i.amount.toLocaleString("ko-KR") : "",
      i.memo ?? "",
      i.completedAt ? new Date(i.completedAt).toLocaleString("ko-KR") : "",
    ]);
    return { headers, rows };
  }

  const lockEmployee = !bundle.access.canViewAll && !bundle.access.canViewTeam;

  return (
    <div className="space-y-5">
      {toast && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            /실패|오류|없|권한/.test(toast)
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-emerald-100 text-emerald-900"
          }`}
        >
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 lg:text-2xl">오늘 할 일</h1>
          <p className="mt-1 text-sm text-slate-600">
            {todayDate}
            {bundle.access.userName ? ` · ${bundle.access.userName}` : ""}
            {nowLabel ? ` · ${nowLabel}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={pending}
            className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-slate-100 sm:min-h-0"
          >
            새로고침
          </button>
          <button
            type="button"
            onClick={() => {
              const { headers, rows } = exportRows();
              downloadCsv(`에잇티_오늘할일_${dateStamp()}.csv`, headers, rows);
            }}
            className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-slate-100 sm:min-h-0"
          >
            CSV
          </button>
          <button
            type="button"
            onClick={() => {
              const { headers, rows } = exportRows();
              downloadXls(`에잇티_오늘할일_${dateStamp()}.xls`, headers, rows);
            }}
            className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-slate-100 sm:min-h-0"
          >
            Excel
          </button>
          <Link
            href="/customers/new"
            className="min-h-11 rounded-lg border border-navy-800 bg-white px-3 py-2 text-xs font-medium text-navy-900 hover:bg-navy-800/5 sm:min-h-0"
          >
            새 고객
          </Link>
          <Link
            href="/schedules/customers"
            className="min-h-11 rounded-lg border border-navy-800 bg-white px-3 py-2 text-xs font-medium text-navy-900 hover:bg-navy-800/5 sm:min-h-0"
          >
            새 상담일정
          </Link>
          <Link
            href="/quotes/new"
            className="min-h-11 rounded-lg border border-navy-800 bg-white px-3 py-2 text-xs font-medium text-navy-900 hover:bg-navy-800/5 sm:min-h-0"
          >
            새 견적
          </Link>
          <button
            type="button"
            onClick={() => setTaskOpen(true)}
            className="min-h-11 rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white hover:bg-navy-700 sm:min-h-0"
          >
            내부 할 일
          </button>
        </div>
      </div>

      {/* Scope filters */}
      {(bundle.access.canViewAll || bundle.access.canViewTeam) && (
        <div className="dashboard-card flex flex-wrap items-end gap-3 p-4">
          {bundle.access.canViewAll && (
            <label className="text-xs text-slate-600">
              팀
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className={`${inputClass} mt-1 min-w-[140px]`}
              >
                <option value="">전체 팀</option>
                {bundle.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-xs text-slate-600">
            담당자
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={lockEmployee}
              className={`${inputClass} mt-1 min-w-[160px]`}
            >
              <option value="">전체</option>
              {bundle.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {formatEmployeeOptionLabel(e)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={applyScope}
            className="rounded-lg bg-navy-800 px-4 py-2 text-xs font-medium text-white"
          >
            필터 적용
          </button>
        </div>
      )}

      {/* Progress */}
      <div className="dashboard-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-navy-900">오늘의 진행률</h2>
          <p className="text-xs text-slate-600">
            전체 {bundle.progress.total} · 완료 {bundle.progress.completed} · 미완료{" "}
            {bundle.progress.incomplete}
          </p>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-navy-800 to-gold-500 transition-all"
            style={{ width: `${bundle.progress.rate}%` }}
          />
        </div>
        <p className="mt-2 text-sm font-semibold text-navy-900">
          {bundle.progress.rate}%
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {FOCUS_CARDS.map((card) => {
          const count = bundle.summary[card.countKey];
          const active = focus === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setFocus(card.key)}
              className={`rounded-xl border px-3 py-3 text-left transition ${card.accent} ${
                active ? "ring-2 ring-navy-800" : "hover:shadow-sm"
              }`}
            >
              <p className="text-[11px] opacity-80">{card.label}</p>
              <p className="mt-1 text-lg font-bold">{count}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Main list */}
        <div className="space-y-4 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {LIST_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    setFocus(f.key);
                    if (f.key === "done") setShowCompleted(true);
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    focus === f.key
                      ? "bg-navy-800 text-white"
                      : "bg-white text-slate-600 ring-1 ring-gray-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
              />
              완료된 업무 보기
            </label>
          </div>

          {visible.length === 0 ? (
            <div className="dashboard-card px-5 py-10 text-center">
              <p className="text-base font-medium text-slate-700">오늘 예정된 업무가 없습니다.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link href="/schedules/customers" className="min-h-10 rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600 focus-visible:ring-offset-2">
                  새 상담 일정
                </Link>
                <Link href="/quotes/new" className="min-h-10 rounded-lg border border-slate-400 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600">
                  새 견적
                </Link>
                <Link href="/customers/new" className="min-h-10 rounded-lg border border-slate-400 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600">
                  새 고객
                </Link>
                <button
                  type="button"
                  onClick={() => setTaskOpen(true)}
                  className="min-h-10 rounded-lg border border-slate-400 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600"
                >
                  내부 할 일 등록
                </button>
              </div>
            </div>
          ) : (
            <ul className="space-y-3">
              {visible.map((item) => (
                <WorkCard
                  key={item.id}
                  item={item}
                  onCompleteSchedule={() => {
                    const sch = schedulesById[item.sourceId];
                    if (sch) setCompleteSchedule(sch);
                  }}
                  onCompleteTask={() => {
                    const fd = new FormData();
                    fd.set("task_id", item.sourceId);
                    void runAction(completeEmployeeTaskAction, fd);
                  }}
                  onPostponeToday={() => {
                    const fd = new FormData();
                    fd.set("schedule_id", item.sourceId);
                    void runAction(postponeScheduleToTodayAction, fd);
                  }}
                  onPhoneComplete={() => {
                    if (!item.customerId) return;
                    const fd = new FormData();
                    fd.set("customer_id", item.customerId);
                    void runAction(markPhoneCompleteAction, fd);
                  }}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <section className="dashboard-card p-4">
            <h3 className="text-sm font-semibold text-red-700">지난 미처리 일정</h3>
            {bundle.overdueSchedules.length === 0 ? (
              <p className="mt-3 text-xs text-slate-600">미처리 일정이 없습니다.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {bundle.overdueSchedules.slice(0, 8).map((s) => (
                  <li
                    key={s.id}
                    className="rounded-lg border border-red-200 bg-red-50/70 px-3 py-2"
                  >
                    <p className="text-xs font-semibold text-red-700">
                      {formatOverdueLabel(s.start_at)} · {s.customers?.name ?? "-"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-900">
                      {s.schedule_type} · {s.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      {new Date(s.start_at).toLocaleString("ko-KR")}
                      {s.employees ? ` · ${s.employees.name}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="rounded bg-navy-800 px-2 py-1 text-[11px] text-white"
                        onClick={() => setCompleteSchedule(s)}
                      >
                        완료
                      </button>
                      <button
                        type="button"
                        className="rounded border border-red-200 bg-white px-2 py-1 text-[11px] text-red-700"
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("schedule_id", s.id);
                          void runAction(postponeScheduleToTodayAction, fd);
                        }}
                      >
                        오늘로 연기
                      </button>
                      <Link
                        href={`/schedules/customers`}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-900 hover:bg-slate-100"
                      >
                        새 일정
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(bundle.access.canViewAll || bundle.access.canViewTeam) &&
            bundle.byAssignee.length > 0 && (
              <section className="dashboard-card overflow-hidden">
                <div className="border-b border-gray-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-navy-900">
                    담당자별 현황
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    업무 누락 확인용 · 클릭 시 필터
                  </p>
                </div>
                <ul className="divide-y divide-gray-50">
                  {bundle.byAssignee.map((a) => (
                    <li key={a.employeeId}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-100"
                        onClick={() => {
                          setEmployeeId(a.employeeId);
                          const params = new URLSearchParams();
                          params.set("employeeId", a.employeeId);
                          startTransition(() => {
                            router.push(`/dashboard?${params.toString()}`);
                            router.refresh();
                          });
                        }}
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {a.employeeName}
                            {a.hasUrgent && (
                              <span className="ml-1 text-[10px] font-semibold text-red-600">
                                긴급
                              </span>
                            )}
                            {a.hasNoSchedule && (
                              <span className="ml-1 text-[10px] text-slate-600">
                                일정없음
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-600">
                            오늘 {a.todayCount} · 미처리 {a.overdueCount}
                            {a.oldestOverdueHours != null
                              ? ` · 최장 ${Math.round(a.oldestOverdueHours)}h`
                              : ""}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-navy-800">
                          {a.completionRate}%
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
        </div>
      </div>

      {completeSchedule && (
        <CompleteScheduleModal
          row={completeSchedule}
          onClose={() => setCompleteSchedule(null)}
          onDone={(msg) => {
            setCompleteSchedule(null);
            setToast(msg);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {taskOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-navy-900">내부 할 일 등록</h3>
              <button type="button" onClick={() => setTaskOpen(false)} className="text-sm text-slate-600">
                닫기
              </button>
            </div>
            <form action={taskAction} className="mt-4 space-y-3">
              <label className="block text-xs text-gray-600">
                제목 *
                <input name="title" required placeholder="예: 고객에게 다시 전화" className={`${inputClass} mt-1`} />
              </label>
              <label className="block text-xs text-gray-600">
                설명
                <textarea name="description" rows={2} className={`${inputClass} mt-1 resize-y`} />
              </label>
              <label className="block text-xs text-gray-600">
                담당자 *
                {lockEmployee ? (
                  <>
                    <input type="hidden" name="assigned_employee_id" value={bundle.access.employeeId ?? ""} />
                    <input
                      disabled
                      value={bundle.access.userName ?? ""}
                      className={`${inputClass} mt-1 bg-gray-50`}
                    />
                  </>
                ) : (
                  <select
                    name="assigned_employee_id"
                    required
                    defaultValue={bundle.access.employeeId ?? ""}
                    className={`${inputClass} mt-1`}
                  >
                    <option value="">선택</option>
                    {bundle.employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {formatEmployeeOptionLabel(e)}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-gray-600">
                  우선순위
                  <select name="priority" defaultValue="보통" className={`${inputClass} mt-1`}>
                    {["낮음", "보통", "높음", "긴급"].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-gray-600">
                  기한
                  <input type="datetime-local" name="due_at" className={`${inputClass} mt-1`} />
                </label>
              </div>
              <input type="hidden" name="status" value="대기" />
              {taskState.error && (
                <p className="text-xs text-red-600">{taskState.error}</p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setTaskOpen(false)} className="rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100">
                  취소
                </button>
                <button
                  type="submit"
                  disabled={taskPending}
                  className="rounded-lg bg-navy-800 px-3 py-2 text-sm text-white disabled:opacity-75"
                >
                  {taskPending ? "저장 중..." : "등록"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkCard({
  item,
  onCompleteSchedule,
  onCompleteTask,
  onPostponeToday,
  onPhoneComplete,
}: {
  item: TodayWorkItem;
  onCompleteSchedule: () => void;
  onCompleteTask: () => void;
  onPostponeToday: () => void;
  onPhoneComplete: () => void;
}) {
  const tone = item.isOverdue
    ? "border-red-200 bg-red-50/40"
    : item.isUrgent
      ? "border-red-300 bg-red-50/20"
      : item.isCompleted
        ? "border-gray-100 bg-gray-50 opacity-80"
        : item.badge === "경고" || item.kind === "expiring"
          ? "border-orange-200 bg-orange-50/40"
          : "border-sky-100 bg-white";

  return (
    <li className={`rounded-xl border px-4 py-3 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                BADGE_CLASS[item.badge] ?? "bg-slate-100 text-slate-900"
              }`}
            >
              {item.badge}
            </span>
            {item.isOverdue && (
              <span className="text-[11px] font-semibold text-red-600">
                {item.startAt ? formatOverdueLabel(item.startAt) : "미처리"}
              </span>
            )}
            {item.priority === "긴급" && (
              <span className="text-[11px] font-semibold text-red-600">긴급</span>
            )}
            {item.status && (
              <span className="text-[11px] text-slate-600">{item.status}</span>
            )}
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">{item.title}</p>
          <p className="mt-0.5 text-xs text-slate-600">
            {item.startAt
              ? new Date(item.startAt).toLocaleString("ko-KR", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : ""}
            {item.customerName ? ` · ${item.customerName}` : ""}
            {item.employeeName ? ` · ${item.employeeName}` : ""}
          </p>
          {(item.phone || item.address) && (
            <p className="mt-0.5 text-xs text-slate-600">
              {item.phone ?? ""}
              {item.address ? ` · ${item.address}` : ""}
            </p>
          )}
          {item.amount != null && (
            <p className="mt-0.5 text-xs font-medium text-navy-800">
              {item.amount.toLocaleString("ko-KR")}원
            </p>
          )}
          {item.recentConsult && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-600">
              최근 상담: {item.recentConsult}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {item.customerId && (
          <Link
            href={`/customers/${item.customerId}`}
            className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 hover:bg-slate-100 sm:min-h-0 sm:py-1.5"
          >
            고객 상세
          </Link>
        )}
        {item.phone && (
          <a
            href={`tel:${formatPhoneForTel(item.phone)}`}
            className="min-h-10 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white sm:min-h-0 sm:py-1.5"
          >
            전화걸기
          </a>
        )}
        {item.source === "schedule" && (
          <>
            <Link
              href="/schedules/customers"
              className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 hover:bg-slate-100 sm:min-h-0 sm:py-1.5"
            >
              일정 상세
            </Link>
            {!item.isCompleted && (
              <>
                <button
                  type="button"
                  onClick={onCompleteSchedule}
                  className="min-h-10 rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white sm:min-h-0 sm:py-1.5"
                >
                  완료 처리
                </button>
                <button
                  type="button"
                  onClick={onPostponeToday}
                  className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 hover:bg-slate-100 sm:min-h-0 sm:py-1.5"
                >
                  연기
                </button>
              </>
            )}
          </>
        )}
        {item.source === "task" && !item.isCompleted && (
          <button
            type="button"
            onClick={onCompleteTask}
            className="min-h-10 rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white sm:min-h-0 sm:py-1.5"
          >
            완료 처리
          </button>
        )}
        {item.kind === "contact" && item.customerId && (
          <>
            <button
              type="button"
              onClick={onPhoneComplete}
              className="min-h-10 rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white sm:min-h-0 sm:py-1.5"
            >
              전화 완료
            </button>
            <Link
              href={`/customers/${item.customerId}`}
              className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 hover:bg-slate-100 sm:min-h-0 sm:py-1.5"
            >
              상담 메모
            </Link>
            <Link
              href={`/customers/${item.customerId}/schedules`}
              className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 hover:bg-slate-100 sm:min-h-0 sm:py-1.5"
            >
              일정 등록
            </Link>
          </>
        )}
        {item.source === "quote" && item.quoteId && (
          <>
            <Link
              href={`/quotes/${item.quoteId}`}
              className="min-h-10 rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white sm:min-h-0 sm:py-1.5"
            >
              견적 열기
            </Link>
            {item.customerId && (
              <Link
                href={`/customers/${item.customerId}/schedules`}
                className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 hover:bg-slate-100 sm:min-h-0 sm:py-1.5"
              >
                새 상담일정
              </Link>
            )}
          </>
        )}
      </div>
    </li>
  );
}
