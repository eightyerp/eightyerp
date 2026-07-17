"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import SoftDeleteCustomerButton from "@/components/customers/SoftDeleteCustomerButton";
import CustomerQuotesPanel from "@/components/customers/CustomerQuotesPanel";
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
  formatPhoneForTel,
} from "@/lib/crm/contact";
import type {
  CustomerConsultLog,
  CustomerQuote,
  CustomerQuoteSend,
  CustomerWithRelations,
  Employee,
} from "@/types/database";

type TabKey =
  | "consult"
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
  employees: Employee[];
  canDelete: boolean;
  isAdmin: boolean;
};

const initialState: ActionResult = { success: false };

const TABS: { key: TabKey; label: string }[] = [
  { key: "consult", label: "상담이력" },
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
  employees,
  canDelete,
  isAdmin,
}: CustomerDetailPanelsProps) {
  const [tab, setTab] = useState<TabKey>("consult");
  const [showConsultForm, setShowConsultForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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

  useEffect(() => {
    const message =
      consultState.message || quickState.message || channelState.message;
    const error = consultState.error || quickState.error || channelState.error;
    if (message) {
      setToast(message);
      setShowConsultForm(false);
    } else if (error) {
      setToast(error);
    }
  }, [consultState, quickState, channelState]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const bucket = customer.contact_bucket ?? "none";
  const latestLog = consultLogs[0] ?? null;
  const pending = consultPending || quickPending || channelPending;

  return (
    <div className="space-y-5">
      {toast && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            toast.includes("실패") || toast.includes("오류") || toast.includes("없")
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
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
              <h2 className="text-xl font-bold text-gray-900">{customer.name}</h2>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                  STATUS_BADGE_CLASS[customer.status] ??
                  "bg-gray-100 text-gray-600"
                }`}
              >
                {customer.status}
              </span>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${contactBucketClass(bucket)}`}
              >
                {contactBucketLabel(bucket)}
              </span>
            </div>

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
                label="다음 연락일"
                value={formatDate(customer.next_contact_at)}
              />
              <InfoItem
                label="공사주소"
                value={customer.address ?? "-"}
                className="sm:col-span-2 xl:col-span-3"
              />
            </dl>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
            <Link
              href={`/customers/${customer.id}/edit`}
              className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white hover:bg-navy-700"
            >
              수정
            </Link>
            <Link
              href={`/customers/${customer.id}/materials`}
              className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-medium text-navy-900 hover:bg-gold-100"
            >
              마감자재
            </Link>
            <button
              type="button"
              onClick={() => setTab("quote")}
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              견적서
            </button>
            <ActionPlaceholder label="계약등록" onNotify={setToast} />
            <ActionPlaceholder label="현장생성" onNotify={setToast} />
            {canDelete ? (
              <SoftDeleteCustomerButton
                customerId={customer.id}
                customerName={customer.name}
                customerPhone={customer.phone}
                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
              />
            ) : (
              <span className="rounded-lg border border-gray-100 px-3 py-2 text-xs text-gray-300">
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
                <span className="text-xs text-gray-400">
                  {formatDateTime(latestLog.created_at)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-gray-700">
                {latestLog.consult_content}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-400">
              등록된 상담이력이 없습니다. 아래에서 첫 상담을 등록해 주세요.
            </p>
          )}
        </div>

        <div className="dashboard-card p-5">
          <h3 className="dashboard-section-title">다음 연락일</h3>
          <p className="mt-3 text-2xl font-bold text-gray-900">
            {formatDate(customer.next_contact_at)}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {contactBucketLabel(bucket)}
            {customer.next_contact_at
              ? " · 대시보드 오늘 연락 목록과 연동됩니다."
              : " · 상담 등록 시 다음 연락일을 함께 지정할 수 있습니다."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={`tel:${formatPhoneForTel(customer.phone)}`}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              전화
            </a>
            <a
              href={buildSmsLink(customer.phone)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              문자
            </a>
            <a
              href={buildKakaoLink(customer.phone)}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              카카오톡
            </a>
            <form action={channelAction}>
              <input type="hidden" name="customer_id" value={customer.id} />
              <input type="hidden" name="activity_type" value="전화" />
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-gold-500/20 px-3 py-1.5 text-xs font-medium text-navy-800 hover:bg-gold-500/30 disabled:opacity-60"
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
              <label className="mb-1 block text-xs text-gray-500">상담상태 변경</label>
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
              className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-60"
            >
              상태 저장
            </button>
          </form>

          <form action={quickAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="customer_id" value={customer.id} />
            <input type="hidden" name="mode" value="assignee" />
            <div>
              <label className="mb-1 block text-xs text-gray-500">담당자 변경</label>
              <select
                name="assigned_employee_id"
                defaultValue={customer.assigned_employee_id ?? ""}
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
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              담당자 저장
            </button>
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
                  : "text-gray-500 hover:bg-gray-50 hover:text-navy-800"
              }`}
            >
              {item.label}
              {item.key === "consult" && consultLogs.length > 0
                ? ` (${consultLogs.length})`
                : ""}
              {item.key === "quote" && quotes.length > 0
                ? ` (${quotes.length})`
                : ""}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "consult" && (
            <ConsultTab
              customerId={customer.id}
              logs={consultLogs}
              showForm={showConsultForm}
              onToggleForm={() => setShowConsultForm((v) => !v)}
              formAction={consultAction}
              pending={consultPending}
              formError={consultState.error}
            />
          )}

          {tab === "quote" && (
            <CustomerQuotesPanel
              customerId={customer.id}
              customerName={customer.name}
              quotes={quotes}
              sendsByQuoteId={quoteSendsByQuoteId}
              employees={employees}
            />
          )}
          {tab === "contract" && (
            <PlaceholderTab
              title="계약"
              description="계약 등록·계약금 확인 내역이 이 탭에 표시됩니다."
              actionLabel="계약등록"
              onAction={() =>
                setToast("계약 모듈은 준비 중입니다. 곧 연결됩니다.")
              }
            />
          )}
          {tab === "site" && (
            <PlaceholderTab
              title="현장"
              description="현장 생성·시공 진행 현황이 이 탭에 표시됩니다."
              actionLabel="현장생성"
              onAction={() =>
                setToast("현장 모듈은 준비 중입니다. 곧 연결됩니다.")
              }
            />
          )}
          {tab === "payment" && (
            <PlaceholderTab
              title="수금"
              description="수금·미수금 내역이 이 탭에 표시됩니다."
              actionLabel="수금등록"
              onAction={() =>
                setToast("수금 모듈은 준비 중입니다. 곧 연결됩니다.")
              }
            />
          )}
          {tab === "as" && (
            <PlaceholderTab
              title="AS"
              description="AS 접수·처리 이력이 이 탭에 표시됩니다."
              actionLabel="AS 접수"
              onAction={() =>
                setToast("AS 모듈은 준비 중입니다. 곧 연결됩니다.")
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
          <h3 className="text-sm font-semibold text-gray-900">상담 타임라인</h3>
          <p className="mt-0.5 text-xs text-gray-500">
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
              <label className="mb-1 block text-xs font-medium text-gray-500">
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
              <label className="mb-1 block text-xs font-medium text-gray-500">
                다음 연락일
              </label>
              <input
                type="date"
                name="next_contact_date"
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-500">
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
              className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
            >
              {pending ? "등록 중..." : "상담이력 저장"}
            </button>
          </div>
        </form>
      )}

      {logs.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">
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
                  <span className="text-xs text-gray-400">
                    {formatDateTime(log.created_at)}
                  </span>
                  {log.next_contact_date && (
                    <span className="text-xs text-gold-600">
                      다음 연락 {formatDate(log.next_contact_date)}
                    </span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
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
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500">{description}</p>
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
      className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      {label}
    </button>
  );
}

function InfoItem({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-gray-800">{value}</dd>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";
