"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import {
  deleteQuoteAction,
  getQuoteSignedUrlAction,
  recordQuoteSendAction,
  setFinalQuoteAction,
  uploadQuoteAction,
  type QuoteActionResult,
} from "@/app/actions/quotes";
import {
  quoteBrandSelectOptions,
  QUOTE_SEND_METHODS,
  QUOTE_STATUS_BADGE_CLASS,
  QUOTE_STATUSES,
  formatEmployeeLabel,
  formatEmployeeOptionLabel,
} from "@/lib/crm/constants";
import type {
  CustomerQuote,
  CustomerQuoteSend,
  Employee,
} from "@/types/database";

type CustomerQuotesPanelProps = {
  customerId: string;
  customerName: string;
  quotes: CustomerQuote[];
  sendsByQuoteId: Record<string, CustomerQuoteSend[]>;
  employees: Employee[];
};

const initial: QuoteActionResult = { success: false };

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ko-KR");
}

function formatAmount(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${value.toLocaleString("ko-KR")}원`;
}

export default function CustomerQuotesPanel({
  customerId,
  customerName,
  quotes,
  sendsByQuoteId,
  employees,
}: CustomerQuotesPanelProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [revisionOf, setRevisionOf] = useState<CustomerQuote | null>(null);
  const [sendOf, setSendOf] = useState<CustomerQuote | null>(null);
  const [deleteOf, setDeleteOf] = useState<CustomerQuote | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [urlPending, startUrlTransition] = useTransition();

  const [uploadState, uploadAction, uploadPending] = useActionState(
    uploadQuoteAction,
    initial,
  );
  const [finalState, finalAction, finalPending] = useActionState(
    setFinalQuoteAction,
    initial,
  );
  const [sendState, sendAction, sendPending] = useActionState(
    recordQuoteSendAction,
    initial,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteQuoteAction,
    initial,
  );

  useEffect(() => {
    const message =
      uploadState.message ||
      finalState.message ||
      sendState.message ||
      deleteState.message;
    const error =
      uploadState.error ||
      finalState.error ||
      sendState.error ||
      deleteState.error;
    if (!message && !error) return;
    const id = window.setTimeout(() => {
      if (message) {
        setToast(message);
        setShowUpload(false);
        setRevisionOf(null);
        setSendOf(null);
        setDeleteOf(null);
      } else if (error) {
        setToast(error);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [uploadState, finalState, sendState, deleteState]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const groups = useMemo(() => {
    const map = new Map<string, CustomerQuote[]>();
    for (const quote of quotes) {
      const list = map.get(quote.quote_group_id) ?? [];
      list.push(quote);
      map.set(quote.quote_group_id, list);
    }
    return Array.from(map.entries()).map(([groupId, items]) => ({
      groupId,
      items: items.sort((a, b) => b.version - a.version),
      latest: items.reduce((a, b) => (a.version >= b.version ? a : b)),
      final: items.find((q) => q.is_final) ?? null,
    }));
  }, [quotes]);

  function openFile(quote: CustomerQuote, mode: "preview" | "download") {
    startUrlTransition(async () => {
      const result = await getQuoteSignedUrlAction(
        quote.id,
        customerId,
        quote.file_path,
      );
      if (!result.success || !result.signedUrl) {
        setToast(result.error || "파일 URL을 만들지 못했습니다.");
        return;
      }
      if (mode === "preview" && quote.file_type === "pdf") {
        setPreviewTitle(`${quote.title} · v${quote.version}`);
        setPreviewUrl(result.signedUrl);
        return;
      }
      window.open(result.signedUrl, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="space-y-4">
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">창호 견적서</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            본사 전산 Excel/PDF를 업로드해 보관·버전관리·발송기록합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setRevisionOf(null);
            setShowUpload((v) => !v);
          }}
          className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white hover:bg-navy-700"
        >
          {showUpload && !revisionOf ? "업로드 취소" : "창호 견적서 업로드"}
        </button>
      </div>

      {(showUpload || revisionOf) && (
        <UploadForm
          customerId={customerId}
          employees={employees}
          parent={revisionOf}
          action={uploadAction}
          pending={uploadPending}
          error={uploadState.error}
          onCancel={() => {
            setShowUpload(false);
            setRevisionOf(null);
          }}
        />
      )}

      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-600">
          등록된 창호 견적서가 없습니다.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <article
              key={group.groupId}
              className="rounded-xl border border-gray-100 bg-white"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {group.latest.title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {group.latest.brand} · 버전 {group.items.length}개
                    {group.final ? ` · 최종본 v${group.final.version}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRevisionOf(group.latest);
                    setShowUpload(true);
                  }}
                  className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-3 py-1.5 text-xs font-medium text-navy-800 hover:bg-gold-500/20"
                >
                  수정본 업로드
                </button>
              </div>

              <ul className="divide-y divide-gray-50">
                {group.items.map((quote) => {
                  const sends = sendsByQuoteId[quote.id] ?? [];
                  return (
                    <li key={quote.id} className="px-4 py-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-1 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-navy-800/5 px-2 py-0.5 text-xs font-semibold text-navy-800">
                              v{quote.version}
                            </span>
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                QUOTE_STATUS_BADGE_CLASS[quote.status] ??
                                "bg-slate-100 text-slate-900"
                              }`}
                            >
                              {quote.status}
                            </span>
                            {quote.is_final && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                최종본
                              </span>
                            )}
                            <span className="text-xs uppercase text-slate-600">
                              {quote.file_type}
                            </span>
                          </div>
                          <p className="text-slate-900">{quote.file_name}</p>
                          <p className="text-xs text-slate-600">
                            금액 {formatAmount(quote.amount)} · 견적일{" "}
                            {formatDate(quote.quote_date)} · 유효기간{" "}
                            {formatDate(quote.valid_until)}
                          </p>
                          <p className="text-xs text-slate-600">
                            담당자{" "}
                            {quote.employees
                              ? formatEmployeeLabel(
                                  quote.employees.name,
                                  quote.employees.title,
                                )
                              : "미배정"}
                            {quote.notes ? ` · ${quote.notes}` : ""}
                          </p>
                          {sends.length > 0 && (
                            <div className="mt-2 space-y-1">
                              <p className="text-xs font-medium text-slate-600">
                                발송기록
                              </p>
                              {sends.map((send) => (
                                <p
                                  key={send.id}
                                  className="text-xs text-gray-600"
                                >
                                  {formatDate(send.sent_at)} · {send.send_method}
                                  {send.recipient ? ` · ${send.recipient}` : ""}
                                  {send.note ? ` · ${send.note}` : ""}
                                  <span className="ml-1 text-slate-600">
                                    ({send.provider_status})
                                  </span>
                                </p>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {quote.file_type === "pdf" ? (
                            <button
                              type="button"
                              disabled={urlPending}
                              onClick={() => openFile(quote, "preview")}
                              className="rounded-lg bg-navy-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-75"
                            >
                              PDF 미리보기
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={urlPending}
                              onClick={() => openFile(quote, "download")}
                              className="rounded-lg bg-navy-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-75"
                            >
                              Excel 다운로드
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={urlPending}
                            onClick={() => openFile(quote, "download")}
                            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-75"
                          >
                            다운로드
                          </button>
                          {!quote.is_final && (
                            <form action={finalAction}>
                              <input
                                type="hidden"
                                name="quote_id"
                                value={quote.id}
                              />
                              <input
                                type="hidden"
                                name="customer_id"
                                value={customerId}
                              />
                              <button
                                type="submit"
                                disabled={finalPending}
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-75"
                              >
                                최종본 지정
                              </button>
                            </form>
                          )}
                          <button
                            type="button"
                            onClick={() => setSendOf(quote)}
                            className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100"
                          >
                            발송기록
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteOf(quote)}
                            className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      )}

      {sendOf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h4 className="text-base font-semibold text-slate-900">
              발송기록 등록
            </h4>
            <p className="mt-1 text-xs text-slate-600">
              {sendOf.title} · v{sendOf.version} · 실제 API 발송은 추후 연결
            </p>
            <form action={sendAction} className="mt-4 space-y-3">
              <input type="hidden" name="quote_id" value={sendOf.id} />
              <input type="hidden" name="customer_id" value={customerId} />
              <div>
                <label className="mb-1 block text-xs text-slate-600">
                  발송방법
                </label>
                <select
                  name="send_method"
                  defaultValue="문자"
                  className={inputClass}
                >
                  {QUOTE_SEND_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">
                  수신처
                </label>
                <input
                  name="recipient"
                  placeholder="전화번호 또는 이메일"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">
                  발송일시
                </label>
                <input
                  type="datetime-local"
                  name="sent_at"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">비고</label>
                <textarea name="note" rows={2} className={inputClass} />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSendOf(null)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={sendPending}
                  className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-75"
                >
                  {sendPending ? "저장 중..." : "기록 저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteOf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h4 className="text-base font-semibold text-slate-900">
              견적서 삭제 확인
            </h4>
            <p className="mt-2 text-sm text-gray-600">
              삭제한 견적서는 복구할 수 없습니다. (고객정보·자재 삭제와 별도
              권한)
            </p>

            <div className="mt-4 space-y-1.5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <p>
                <span className="text-slate-600">고객명</span>
                <span className="ml-2 font-semibold text-slate-900">
                  {customerName}
                </span>
              </p>
              <p>
                <span className="text-slate-600">견적서 제목</span>
                <span className="ml-2 font-semibold text-slate-900">
                  {deleteOf.title}
                  <span className="ml-1 font-normal text-slate-600">
                    (v{deleteOf.version})
                  </span>
                </span>
              </p>
              <p>
                <span className="text-slate-600">파일명</span>
                <span className="ml-2 font-semibold text-slate-900 break-all">
                  {deleteOf.file_name}
                </span>
              </p>
              <p>
                <span className="text-slate-600">견적금액</span>
                <span className="ml-2 font-semibold text-slate-900">
                  {formatAmount(deleteOf.amount)}
                </span>
              </p>
            </div>

            <form action={deleteAction} className="mt-4 space-y-3">
              <input type="hidden" name="quote_id" value={deleteOf.id} />
              <input type="hidden" name="customer_id" value={customerId} />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  삭제 사유 <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="delete_reason"
                  required
                  rows={3}
                  placeholder="삭제 사유를 입력하세요"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                />
              </div>

              {deleteState.error && (
                <p className="text-sm text-red-600">{deleteState.error}</p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDeleteOf(null)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-slate-100"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={deletePending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-75"
                >
                  {deletePending ? "삭제 중..." : "견적서 삭제"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">{previewTitle}</p>
              <button
                type="button"
                onClick={() => {
                  setPreviewUrl(null);
                  setPreviewTitle("");
                }}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600"
              >
                닫기
              </button>
            </div>
            <iframe
              title="견적서 미리보기"
              src={previewUrl}
              className="h-full w-full flex-1 bg-gray-50"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function UploadForm({
  customerId,
  employees,
  parent,
  action,
  pending,
  error,
  onCancel,
}: {
  customerId: string;
  employees: Employee[];
  parent: CustomerQuote | null;
  action: (payload: FormData) => void;
  pending: boolean;
  error?: string;
  onCancel: () => void;
}) {
  return (
    <form
      action={action}
      className="rounded-xl border border-gray-100 bg-gray-50/80 p-4"
    >
      <input type="hidden" name="customer_id" value={customerId} />
      {parent && (
        <>
          <input type="hidden" name="parent_quote_id" value={parent.id} />
          <input type="hidden" name="quote_group_id" value={parent.quote_group_id} />
        </>
      )}

      <p className="mb-3 text-sm font-medium text-slate-900">
        {parent
          ? `수정본 업로드 (원본 v${parent.version} → 새 버전)`
          : "새 창호 견적서 업로드"}
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="견적 제목" required className="md:col-span-2">
          <input
            name="title"
            required
            defaultValue={parent?.title ?? ""}
            placeholder="예: 당산2차 204동 702호 창호 견적"
            className={inputClass}
          />
        </Field>
        <Field label="브랜드">
          <select
            name="brand"
            defaultValue={
              parent?.brand === "LX하우시스" || parent?.brand === "기타"
                ? parent.brand
                : "LX하우시스"
            }
            className={inputClass}
          >
            {quoteBrandSelectOptions().map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </Field>
        <Field label="견적상태">
          <select
            name="status"
            defaultValue={parent ? "수정요청" : "작성중"}
            className={inputClass}
          >
            {QUOTE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </Field>
        <Field label="견적금액">
          <input
            name="amount"
            inputMode="numeric"
            defaultValue={parent?.amount ?? ""}
            placeholder="예: 12500000"
            className={inputClass}
          />
        </Field>
        <Field label="담당자">
          <select
            name="assigned_employee_id"
            defaultValue={parent?.assigned_employee_id ?? ""}
            className={inputClass}
          >
            <option value="">미배정</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {formatEmployeeOptionLabel(employee)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="견적일">
          <input
            type="date"
            name="quote_date"
            defaultValue={parent?.quote_date?.slice(0, 10) ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="유효기간">
          <input
            type="date"
            name="valid_until"
            defaultValue={parent?.valid_until?.slice(0, 10) ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="견적 파일 (pdf, xlsx, xls)" required className="md:col-span-2">
          <input
            type="file"
            name="file"
            required
            accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-navy-800 file:px-3 file:py-2 file:text-xs file:font-medium file:text-white"
          />
        </Field>
        <Field label="비고" className="md:col-span-2">
          <textarea
            name="notes"
            rows={2}
            defaultValue={parent?.notes ?? ""}
            className={inputClass}
          />
        </Field>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-navy-800 px-4 py-2 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-75"
        >
          {pending ? "업로드 중..." : "업로드"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";
