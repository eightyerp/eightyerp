"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import SoftDeleteCustomerButton from "@/components/customers/SoftDeleteCustomerButton";
import CreateSiteButton from "@/components/customers/CreateSiteButton";
import CustomerQuotesPanel from "@/components/customers/CustomerQuotesPanel";
import CustomerSitesPanel from "@/components/customers/CustomerSitesPanel";
import {
  addConsultLogAction,
  quickChannelAction,
  quickUpdateCustomerAction,
  type ActionResult,
} from "@/app/actions/customers";
import {
  CONSULT_TYPES,
  CUSTOMER_FORM_STATUSES,
  STATUS_BADGE_CLASS,
  formatEmployeeLabel,
} from "@/lib/crm/constants";
import {
  buildKakaoLink,
  buildSmsLink,
  contactBucketClass,
  contactBucketLabel,
  formatFriendlyDate,
  formatFriendlyDateTime,
  formatPhoneForTel,
} from "@/lib/crm/contact";
import type {
  CustomerActivity,
  CustomerConsultLog,
  CustomerQuote,
  CustomerQuoteSend,
  CustomerSchedule,
  CustomerWithRelations,
  Employee,
  ErpQuote,
  Project,
} from "@/types/database";
import { isCustomerScheduleOverdue } from "@/lib/crm/schedule-utils";
import { SCHEDULE_STATUS_BADGE } from "@/lib/crm/schedule-constants";

type TabKey =
  | "consult"
  | "schedule"
  | "quote"
  | "contract"
  | "site"
  | "payment"
  | "as";

type CustomerDetailPanelsProps = {
  customer: CustomerWithRelations;
  consultLogs: CustomerConsultLog[];
  quotes: CustomerQuote[];
  quoteSendsByQuoteId: Record<string, CustomerQuoteSend[]>;
  erpQuotes?: ErpQuote[];
  schedules?: CustomerSchedule[];
  employees: Employee[];
  projects: Project[];
  /** 담당자변경 활동만, 최신순 */
  assigneeChangeHistory?: CustomerActivity[];
  canDelete: boolean;
  isAdmin: boolean;
  currentEmployeeId: string | null;
};

const initialState: ActionResult = { success: false };

const TABS: { key: TabKey; label: string }[] = [
  { key: "consult", label: "상담이력" },
  { key: "schedule", label: "상담일정" },
  { key: "quote", label: "견적" },
  { key: "contract", label: "계약" },
  { key: "site", label: "현장" },
  { key: "payment", label: "수금" },
  { key: "as", label: "AS" },
];

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ko-KR");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

export default function CustomerDetailPanels({
  customer,
  consultLogs,
  quotes,
  quoteSendsByQuoteId,
  erpQuotes = [],
  schedules = [],
  employees,
  projects,
  assigneeChangeHistory = [],
  canDelete,
  isAdmin,
  currentEmployeeId,
}: CustomerDetailPanelsProps) {
  const [tab, setTab] = useState<TabKey>("consult");
  const [showConsultForm, setShowConsultForm] = useState(false);
  const [localToast, setLocalToast] = useState<string | null>(null);
  const [hiddenFeedback, setHiddenFeedback] = useState<string | null>(null);

  const [consultState, consultAction, consultPending] = useActionState(
    addConsultLogAction,
    initialState,
  );
  const [quickState, quickAction, quickPending] = useActionState(
    quickUpdateCustomerAction,
    initialState,
  );
  const [channelState, channelAction, channelPending] = useActionState(
    quickChannelAction,
    initialState,
  );

  const feedback =
    consultState.message ||
    quickState.message ||
    channelState.message ||
    consultState.error ||
    quickState.error ||
    channelState.error ||
    null;
  const toast =
    localToast ||
    (feedback && feedback !== hiddenFeedback ? feedback : null);

  useEffect(() => {
    if (!feedback && !localToast) return;
    const timer = window.setTimeout(() => {
      if (feedback) setHiddenFeedback(feedback);
      setLocalToast(null);
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [feedback, localToast]);

  const consultFormOpen =
    showConsultForm && !(consultState.success && Boolean(consultState.message));

  const bucket = customer.contact_bucket ?? "none";
  const isContactOverdue = bucket === "overdue";
  const lastContactLabel =
    formatFriendlyDateTime(customer.last_contact_at) ??
    "아직 연락 기록 없음";
  const nextContactLabel =
    formatFriendlyDate(customer.next_contact_at) ?? "미정";
  const latestLog = consultLogs[0] ?? null;
  const pending = consultPending || quickPending || channelPending;

  function employeeNameById(id: string | null | undefined): string {
    if (!id) return "미배정";
    const found = employees.find((e) => e.id === id);
    return found
      ? formatEmployeeLabel(found.name, found.title)
      : "알 수 없음";
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const todaySchedules = schedules.filter((s) => {
    const t = new Date(s.start_at).getTime();
    return t >= startOfToday.getTime() && t <= endOfToday.getTime();
  });
  const overdueSchedules = schedules.filter((s) => isCustomerScheduleOverdue(s));
  const nextContactSchedule = [...schedules]
    .filter((s) => s.next_contact_at)
    .sort(
      (a, b) =>
        new Date(a.next_contact_at!).getTime() -
        new Date(b.next_contact_at!).getTime(),
    )[0];
  const upcomingNext =
    nextContactSchedule?.next_contact_at ?? customer.next_contact_at;

  return (
    <div className="space-y-5">
      {toast && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            toast.includes("실패") || toast.includes("오류") || toast.includes("없")
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-emerald-100 text-emerald-900"
          }`}
        >
          {toast}
        </div>
      )}

      {/* Header summary */}
      <section className="dashboard-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">{customer.name}</h2>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                  STATUS_BADGE_CLASS[customer.status] ??
                  "bg-slate-100 text-slate-900"
                }`}
              >
                {customer.status}
              </span>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${contactBucketClass(bucket)}`}
              >
                {contactBucketLabel(bucket)}
              </span>
              {isContactOverdue && (
                <span className="inline-flex items-center rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
                  연락 지연
                </span>
              )}
            </div>

            {isContactOverdue && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                다음 연락 예정일이 지났습니다. 빠른 연락이 필요합니다.
                {customer.next_contact_at && (
                  <span className="mt-0.5 block text-xs text-red-700/90">
                    예정일: {nextContactLabel}
                  </span>
                )}
              </div>
            )}

            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
              <InfoItem label="연락처" value={customer.phone} />
              <InfoItem
                label="담당자"
                value={
                  customer.employees
                    ? formatEmployeeLabel(
                        customer.employees.name,
                        customer.employees.title,
                      )
                    : "미배정"
                }
              />
              <InfoItem
                label="유입경로"
                value={customer.lead_sources?.name ?? "-"}
              />
              <InfoItem
                label="희망공사시기"
                value={customer.desired_timing ?? "-"}
              />
              <InfoItem
                label="최근 연락"
                value={lastContactLabel}
                valueClassName={
                  customer.last_contact_at
                    ? undefined
                    : "font-medium text-slate-600"
                }
              />
              <InfoItem
                label="다음 연락일"
                value={nextContactLabel}
                valueClassName={
                  isContactOverdue
                    ? "font-semibold text-red-700"
                    : undefined
                }
              />
              <InfoItem
                label="공사주소"
                value={customer.address ?? "-"}
                className="sm:col-span-2 xl:col-span-3"
              />
            </dl>

            {assigneeChangeHistory.length > 0 && (
              <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-3">
                <p className="text-xs font-semibold text-gray-600">
                  담당자 변경이력
                </p>
                <ul className="mt-2 space-y-2">
                  {assigneeChangeHistory.map((row) => {
                    const changedBy = row.employees
                      ? formatEmployeeLabel(
                          row.employees.name,
                          row.employees.title,
                        )
                      : "알 수 없음";
                    return (
                      <li
                        key={row.id}
                        className="border-t border-gray-100 pt-2 text-sm first:border-t-0 first:pt-0"
                      >
                        <p className="font-medium text-slate-900">
                          {employeeNameById(row.previous_assignee_id)}
                          <span className="mx-1.5 text-slate-600">→</span>
                          {employeeNameById(row.new_assignee_id)}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600">
                          변경한 사람 {changedBy}
                          <span className="mx-1.5 text-slate-600">·</span>
                          {formatDateTime(row.created_at)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
            <CreateSiteButton
              customerId={customer.id}
              customerName={customer.name}
              customerAddress={customer.address}
              customerStatus={customer.status}
              defaultAssigneeId={customer.assigned_employee_id}
              employees={employees}
              existingProjectId={projects[0]?.id ?? null}
              isAdmin={isAdmin}
              currentEmployeeId={currentEmployeeId}
              variant="header"
            />
            <Link
              href={`/customers/${customer.id}/edit`}
              className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white hover:bg-navy-700"
            >
              수정
            </Link>
            <button
              type="button"
              onClick={() => setTab("site")}
              className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-medium text-navy-900 hover:bg-gold-100"
            >
              현장 / 마감자재
            </button>
            <Link
              href={`/customers/${customer.id}/materials`}
              className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-medium text-navy-900 hover:bg-gold-100"
            >
              마감자재
            </Link>
            <Link
              href={`/customers/${customer.id}/schedules`}
              className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-medium text-navy-900 hover:bg-gold-100"
            >
              상담 일정
            </Link>
            <button
              type="button"
              onClick={() => setTab("quote")}
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-slate-900 hover:bg-slate-100"
            >
              견적서
            </button>
            <ActionPlaceholder label="계약등록" onNotify={setLocalToast} />
            {canDelete ? (
              <SoftDeleteCustomerButton
                customerId={customer.id}
                customerName={customer.name}
                customerPhone={customer.phone}
                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
              />
            ) : (
              <span className="rounded-lg border border-gray-100 px-3 py-2 text-xs text-slate-600">
                삭제
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Latest consult snapshot */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="dashboard-card p-5">
          <h3 className="dashboard-section-title">최근 상담내용</h3>
          {latestLog ? (
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-navy-800/5 px-2.5 py-0.5 text-xs font-medium text-navy-800">
                  {latestLog.consult_type}
                </span>
                <span className="text-xs text-slate-600">
                  {formatDateTime(latestLog.created_at)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-slate-900">
                {latestLog.consult_content}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              등록된 상담이력이 없습니다. 아래에서 첫 상담을 등록해 주세요.
            </p>
          )}
        </div>

        <div className="dashboard-card p-5">
          <h3 className="dashboard-section-title">연락 현황</h3>
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-xs text-slate-600">최근 연락</p>
              <p
                className={`mt-1 text-base font-semibold ${
                  customer.last_contact_at ? "text-slate-900" : "text-slate-600"
                }`}
              >
                {lastContactLabel}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-600">다음 연락일</p>
              <p
                className={`mt-1 text-2xl font-bold ${
                  isContactOverdue ? "text-red-700" : "text-slate-900"
                }`}
              >
                {nextContactLabel}
              </p>
              <p
                className={`mt-1 text-sm ${
                  isContactOverdue
                    ? "font-semibold text-red-700"
                    : "text-slate-600"
                }`}
              >
                {contactBucketLabel(bucket)}
                {customer.next_contact_at
                  ? " · 대시보드 오늘 연락 목록과 연동됩니다."
                  : " · 상담 등록 시 다음 연락일을 함께 지정할 수 있습니다."}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={`tel:${formatPhoneForTel(customer.phone)}`}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100"
            >
              전화
            </a>
            <a
              href={buildSmsLink(customer.phone)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100"
            >
              문자
            </a>
            <a
              href={buildKakaoLink(customer.phone)}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100"
            >
              카카오톡
            </a>
            <form action={channelAction}>
              <input type="hidden" name="customer_id" value={customer.id} />
              <input type="hidden" name="activity_type" value="전화" />
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-gold-500/20 px-3 py-1.5 text-xs font-medium text-navy-800 hover:bg-gold-500/30 disabled:opacity-75"
              >
                전화시도 기록
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Quick status controls */}
      <section className="dashboard-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <form action={quickAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="customer_id" value={customer.id} />
            <input type="hidden" name="mode" value="status" />
            <div>
              <label className="mb-1 block text-xs text-slate-600">상담상태 변경</label>
              <select
                name="status"
                defaultValue={customer.status}
                className={inputClass}
              >
                {CUSTOMER_FORM_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-75"
            >
              상태 저장
            </button>
          </form>

          <form action={quickAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="customer_id" value={customer.id} />
            <input type="hidden" name="mode" value="assignee" />
            <div>
              <label className="mb-1 block text-xs text-slate-600">담당자 변경</label>
              <select
                name="assigned_employee_id"
                defaultValue={customer.assigned_employee_id ?? ""}
                disabled={!isAdmin}
                className={inputClass}
              >
                <option value="">미배정</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {formatEmployeeLabel(employee.name, employee.title)}
                  </option>
                ))}
              </select>
            </div>
            {isAdmin ? (
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-75"
              >
                담당자 저장
              </button>
            ) : (
              <p className="pb-2 text-xs text-slate-600">
                담당자 변경은 관리자만 가능
              </p>
            )}
          </form>
        </div>
      </section>

      {/* Tabs */}
      <section className="dashboard-card overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-gray-100 px-3 pt-3">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-medium transition ${
                tab === item.key
                  ? "bg-navy-800 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-navy-800"
              }`}
            >
              {item.label}
              {item.key === "consult" && consultLogs.length > 0
                ? ` (${consultLogs.length})`
                : ""}
              {item.key === "schedule" && schedules.length > 0
                ? ` (${schedules.length})`
                : ""}
              {item.key === "quote" &&
              (erpQuotes.length > 0 || quotes.length > 0)
                ? ` (${erpQuotes.length || quotes.length})`
                : ""}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "consult" && (
            <ConsultTab
              customerId={customer.id}
              logs={consultLogs}
              showForm={consultFormOpen}
              onToggleForm={() => setShowConsultForm((v) => !v)}
              formAction={consultAction}
              pending={consultPending}
              formError={consultState.error}
            />
          )}

          {tab === "schedule" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold-300 bg-gold-50 px-4 py-4">
                <div>
                  <h3 className="text-sm font-semibold text-navy-900">상담일정</h3>
                  <p className="mt-0.5 text-xs text-navy-700/80">
                    오늘 예정 {todaySchedules.length}건
                    {overdueSchedules.length > 0
                      ? ` · 지난 미처리 ${overdueSchedules.length}건`
                      : ""}
                    {upcomingNext
                      ? ` · 다음 연락일 ${formatDate(upcomingNext)}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/customers/${customer.id}/schedules`}
                    className="rounded-lg border border-navy-800 bg-white px-3 py-2 text-xs font-medium text-navy-900 hover:bg-navy-800/5"
                  >
                    일정 전체 보기
                  </Link>
                  <Link
                    href={`/customers/${customer.id}/schedules`}
                    className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white hover:bg-navy-700"
                  >
                    새 일정 등록
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MiniStat
                  label="오늘 예정"
                  value={`${todaySchedules.length}건`}
                  accent="blue"
                />
                <MiniStat
                  label="지난 미처리"
                  value={`${overdueSchedules.length}건`}
                  accent={overdueSchedules.length ? "red" : "gray"}
                />
                <MiniStat
                  label="다음 연락일"
                  value={formatDate(upcomingNext)}
                  accent="gold"
                />
              </div>

              {schedules.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-600">
                  등록된 상담 일정이 없습니다.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                  {schedules.slice(0, 8).map((s) => {
                    const overdue = isCustomerScheduleOverdue(s);
                    return (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {s.title}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-600">
                            {formatDateTime(s.start_at)} · {s.schedule_type}
                            {s.employees
                              ? ` · ${s.employees.name}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {overdue && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                              미처리
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              SCHEDULE_STATUS_BADGE[s.status] ??
                              "bg-slate-100 text-slate-900"
                            }`}
                          >
                            {s.status}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {tab === "quote" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold-300 bg-gold-50 px-4 py-4">
                <div>
                  <h3 className="text-sm font-semibold text-navy-900">견적서</h3>
                  <p className="mt-0.5 text-xs text-navy-700/80">
                    등록 {erpQuotes.length}건
                    {erpQuotes[0]
                      ? ` · 최근 ${erpQuotes[0].final_amount.toLocaleString("ko-KR")}원`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/customers/${customer.id}/quotes`}
                    className="rounded-lg border border-navy-800 bg-white px-3 py-2 text-xs font-medium text-navy-900 hover:bg-navy-800/5"
                  >
                    견적 목록 보기
                  </Link>
                  <Link
                    href={`/quotes/new?customerId=${customer.id}`}
                    className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white hover:bg-navy-700"
                  >
                    새 견적 등록
                  </Link>
                </div>
              </div>

              {erpQuotes.length > 0 ? (
                <div className="space-y-2">
                  {erpQuotes.slice(0, 5).map((q) => (
                    <Link
                      key={q.id}
                      href={`/quotes/${q.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-4 py-3 hover:border-navy-800/30"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-navy-900">
                            {q.title}
                          </p>
                          <span className="text-xs text-slate-600">
                            v{q.version_number} · {q.quote_type}
                          </span>
                          {q.is_contract_quote && (
                            <span className="rounded-full bg-navy-800 px-2 py-0.5 text-[10px] font-semibold text-gold-400">
                              계약견적
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-600">
                          {q.status}
                          {q.valid_until ? ` · 유효 ${q.valid_until}` : ""}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-navy-900">
                        {q.final_amount.toLocaleString("ko-KR")}원
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-600">
                  등록된 견적이 없습니다. 새 견적을 등록해 주세요.
                </p>
              )}

              {quotes.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-600">
                    이전 견적(레거시) · 창호 견적서 업로드 보관용
                  </p>
                  <CustomerQuotesPanel
                    customerId={customer.id}
                    customerName={customer.name}
                    quotes={quotes}
                    sendsByQuoteId={quoteSendsByQuoteId}
                    employees={employees}
                  />
                </div>
              )}
            </div>
          )}
          {tab === "contract" && (
            <PlaceholderTab
              title="계약"
              description="계약 등록·계약금 확인 내역이 이 탭에 표시됩니다."
              actionLabel="계약등록"
              onAction={() =>
                setLocalToast("계약 모듈은 준비 중입니다. 곧 연결됩니다.")
              }
            />
          )}
          {tab === "site" && (
            <CustomerSitesPanel
              customerId={customer.id}
              customerName={customer.name}
              customerAddress={customer.address}
              customerStatus={customer.status}
              defaultAssigneeId={customer.assigned_employee_id}
              projects={projects}
              employees={employees}
              isAdmin={isAdmin}
              currentEmployeeId={currentEmployeeId}
            />
          )}
          {tab === "payment" && (
            <PlaceholderTab
              title="수금"
              description="수금·미수금 내역이 이 탭에 표시됩니다."
              actionLabel="수금등록"
              onAction={() =>
                setLocalToast("수금 모듈은 준비 중입니다. 곧 연결됩니다.")
              }
            />
          )}
          {tab === "as" && (
            <PlaceholderTab
              title="AS"
              description="AS 접수·처리 이력이 이 탭에 표시됩니다."
              actionLabel="AS 접수"
              onAction={() =>
                setLocalToast("AS 모듈은 준비 중입니다. 곧 연결됩니다.")
              }
            />
          )}
        </div>
      </section>

      {/* Extra customer notes */}
      {(customer.special_notes ||
        customer.consultation_notes ||
        customer.interest_items?.length) && (
        <section className="dashboard-card p-5">
          <h3 className="dashboard-section-title">고객 메모</h3>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <InfoItem
              label="관심 공종"
              value={
                customer.interest_items?.length
                  ? customer.interest_items.join(", ")
                  : "-"
              }
            />
            <InfoItem
              label="고객특이사항"
              value={customer.special_notes ?? "-"}
            />
            <InfoItem
              label="상담내용 / 메모"
              value={customer.consultation_notes ?? "-"}
              className="md:col-span-2"
            />
          </dl>
        </section>
      )}
    </div>
  );
}

function ConsultTab({
  customerId,
  logs,
  showForm,
  onToggleForm,
  formAction,
  pending,
  formError,
}: {
  customerId: string;
  logs: CustomerConsultLog[];
  showForm: boolean;
  onToggleForm: () => void;
  formAction: (payload: FormData) => void;
  pending: boolean;
  formError?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">상담 타임라인</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            전화·방문·카카오톡 등 상담 이력을 시간순으로 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleForm}
          className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white hover:bg-navy-700"
        >
          {showForm ? "등록 취소" : "상담 등록"}
        </button>
      </div>

      {showForm && (
        <form
          action={formAction}
          className="rounded-xl border border-gray-100 bg-gray-50/70 p-4"
        >
          <input type="hidden" name="customer_id" value={customerId} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                상담유형
              </label>
              <select
                name="consult_type"
                defaultValue="전화"
                required
                className={inputClass}
              >
                {CONSULT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                다음 연락일
              </label>
              <input
                type="date"
                name="next_contact_date"
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                상담내용
              </label>
              <textarea
                name="consult_content"
                rows={4}
                required
                placeholder="상담 내용을 입력하세요"
                className={`${inputClass} resize-y`}
              />
            </div>
          </div>
          {formError && (
            <p className="mt-2 text-sm text-red-600">{formError}</p>
          )}
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-75"
            >
              {pending ? "등록 중..." : "상담이력 저장"}
            </button>
          </div>
        </form>
      )}

      {logs.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-600">
          아직 상담이력이 없습니다.
        </p>
      ) : (
        <ol className="relative space-y-0 border-l border-gold-500/40 pl-5">
          {logs.map((log) => (
            <li key={log.id} className="relative pb-6 last:pb-0">
              <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-gold-500 ring-4 ring-white" />
              <div className="rounded-lg border border-gray-100 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-navy-800/5 px-2.5 py-0.5 text-xs font-semibold text-navy-800">
                    {log.consult_type}
                  </span>
                  <span className="text-xs text-slate-600">
                    {formatDateTime(log.created_at)}
                  </span>
                  {log.next_contact_date && (
                    <span className="text-xs text-gold-600">
                      다음 연락 {formatDate(log.next_contact_date)}
                    </span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-900">
                  {log.consult_content}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PlaceholderTab({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-6">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600">{description}</p>
      <button
        type="button"
        onClick={onAction}
        className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-medium text-navy-800 hover:bg-gold-500/20"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "blue" | "red" | "gray" | "gold";
}) {
  const accentClass =
    accent === "red"
      ? "border-red-200 bg-red-50 text-red-700"
      : accent === "blue"
        ? "border-sky-200 bg-sky-100 text-sky-900"
        : accent === "gold"
          ? "border-gold-300 bg-gold-50 text-navy-900"
          : "border-gray-100 bg-gray-50 text-gray-600";
  return (
    <div className={`rounded-xl border px-4 py-3 ${accentClass}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function ActionPlaceholder({
  label,
  onNotify,
}: {
  label: string;
  onNotify: (message: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onNotify(`${label} 기능은 준비 중입니다.`)}
      className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-slate-900 hover:bg-slate-100"
    >
      {label}
    </button>
  );
}

function InfoItem({
  label,
  value,
  className = "",
  valueClassName = "font-medium text-slate-900",
}: {
  label: string;
  value: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className={`mt-0.5 ${valueClassName}`}>{value}</dd>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";
