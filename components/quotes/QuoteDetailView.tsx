"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createQuoteVersionAction,
  deleteQuoteAction,
  deleteQuoteFileAction,
  getQuoteFileSignedUrlAction,
} from "@/app/actions/quote-mgmt";
import { formatEmployeeLabel } from "@/lib/crm/constants";
import {
  ERP_QUOTE_STATUS_BADGE,
  formatLxDiscountSummaryLabel,
  formatQuoteUnit,
  quoteCostTypeLabel,
  quoteDocumentTitle,
  resolveQuoteVatDisplayAmounts,
} from "@/lib/crm/quote-constants";
import type { QuoteBrandProfile } from "@/lib/crm/quote-brand-shared";
import type { QuoteDocumentModel } from "@/lib/crm/quote-document";
import { resolveQuoteAssigneeContact } from "@/lib/crm/quote-assignee-contact";
import type {
  Employee,
  ErpQuote,
  ErpQuoteFile,
  ErpQuoteSendLog,
} from "@/types/database";

const QuotePreviewModal = dynamic(
  () => import("@/components/quotes/QuotePreviewModal"),
  { ssr: false },
);

const QuoteCustomerShareModal = dynamic(
  () => import("@/components/quotes/QuoteCustomerShareModal"),
  { ssr: false },
);

type QuoteDetailViewProps = {
  quote: ErpQuote;
  versions: ErpQuote[];
  sendLogs: ErpQuoteSendLog[];
  signedUrls: Record<string, string>;
  employees?: Employee[];
  /** 서버에서 1회 조회한 표지 브랜드 (미리보기 재조회 없음) */
  brand?: QuoteBrandProfile | null;
  /** 담당자 명함 signed URL (서버에서 생성) */
  assigneeCardImageUrl?: string | null;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ko-KR");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

function formatMoney(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatDiff(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("ko-KR")}원`;
}

export default function QuoteDetailView({
  quote,
  versions,
  sendLogs,
  signedUrls,
  employees = [],
  brand = null,
  assigneeCardImageUrl = null,
}: QuoteDetailViewProps) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [urlPending, startUrlTransition] = useTransition();
  const [localUrls, setLocalUrls] =
    useState<Record<string, string>>(signedUrls);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");

  const [versionModal, setVersionModal] = useState(false);
  const [versionPending, startVersionTransition] = useTransition();
  const [versionError, setVersionError] = useState<string | null>(null);

  const [sendModal, setSendModal] = useState(false);
  const [includeCover, setIncludeCover] = useState(true);

  const [deleteModal, setDeleteModal] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [autoPrintPreview, setAutoPrintPreview] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const vatDisplay = useMemo(
    () =>
      resolveQuoteVatDisplayAmounts({
        discountedAmount: quote.final_amount,
        quoteType: quote.quote_type,
        vatMode: quote.vat_mode,
        vatRate: quote.vat_rate,
        supplyAmount: quote.supply_amount,
        vatAmount: quote.vat_amount,
        customerTotalAmount: quote.customer_total_amount,
      }),
    [
      quote.final_amount,
      quote.quote_type,
      quote.vat_mode,
      quote.vat_rate,
      quote.supply_amount,
      quote.vat_amount,
      quote.customer_total_amount,
    ],
  );

  const lxDiscountLabel = useMemo(
    () =>
      formatLxDiscountSummaryLabel({
        items: quote.quote_items ?? [],
        quoteLevelRate: Number(quote.lx_discount_rate ?? 0),
        lxDiscountAmount: Number(quote.lx_discount_amount ?? 0),
      }),
    [quote.quote_items, quote.lx_discount_rate, quote.lx_discount_amount],
  );

  /** 이미 로드된 quote / quote_items만 사용 — 미리보기용 추가 조회 없음 */
  const assigneeContact = useMemo(
    () => resolveQuoteAssigneeContact(quote),
    [quote],
  );

  const previewModel: QuoteDocumentModel = useMemo(
    () => ({
      customerName: quote.customers?.name ?? "",
      title: quote.title,
      quoteType: quote.quote_type,
      quoteMode: quote.quote_mode ?? null,
      quoteNumber: quote.quote_number,
      versionNumber: quote.version_number,
      status: quote.status,
      validUntil: quote.valid_until,
      issuedAt: quote.issued_at,
      customerMessage: quote.customer_message,
      discountAmount: Number(quote.discount_amount ?? 0),
      specialDiscountMemo: quote.special_discount_memo ?? null,
      lxDiscountRate: Number(quote.lx_discount_rate ?? 0),
      vatMode: vatDisplay.vat_mode,
      vatRate: vatDisplay.vat_rate,
      supplyAmount: vatDisplay.supply_amount,
      vatAmount: vatDisplay.vat_amount,
      customerTotalAmount: vatDisplay.customer_total_amount,
      brand,
      showCover: includeCover,
      assigneeName: assigneeContact.name,
      assigneeTitle: assigneeContact.title,
      assigneePhone: assigneeContact.phone,
      assigneeEmail: assigneeContact.email,
      assigneeShowBusinessCard: assigneeContact.showBusinessCard,
      assigneeCardImageUrl:
        assigneeContact.showBusinessCard && assigneeContact.cardPath
          ? assigneeCardImageUrl
          : null,
      companyBusinessNumber: null,
      items: (quote.quote_items ?? []).map((item, index) => ({
        trade_name: item.trade_name,
        item_name: item.item_name,
        description: item.description,
        remark: item.remark,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        amount: item.amount,
        cost_type: item.cost_type,
        is_lx_material: item.is_lx_material,
        lx_discount_base_amount: item.lx_discount_base_amount,
        lx_discount_type: item.lx_discount_type,
        lx_discount_value: item.lx_discount_value,
        sort_order: item.sort_order ?? index,
      })),
    }),
    [quote, includeCover, brand, vatDisplay, assigneeContact, assigneeCardImageUrl],
  );

  function openSendModal() {
    setSendModal(true);
  }

  async function openFile(file: ErpQuoteFile, mode: "preview" | "download") {
    let url = localUrls[file.id];
    if (!url) {
      const result = await getQuoteFileSignedUrlAction(file.file_path);
      if (!result.success || !result.signedUrl) {
        setToast(result.error || "파일 링크 생성에 실패했습니다.");
        return;
      }
      url = result.signedUrl;
      setLocalUrls((prev) => ({ ...prev, [file.id]: url }));
    }
    if (mode === "preview" && file.file_type === "pdf") {
      setPreviewTitle(file.file_name);
      setPreviewUrl(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleOpenFile(file: ErpQuoteFile, mode: "preview" | "download") {
    startUrlTransition(async () => {
      await openFile(file, mode);
    });
  }

  function handleCreateVersion(formData: FormData) {
    setVersionError(null);
    startVersionTransition(async () => {
      const result = await createQuoteVersionAction(formData);
      if (result && !result.success) {
        setVersionError(result.error || "새 버전 생성에 실패했습니다.");
      }
    });
  }

  async function handleDelete(formData: FormData) {
    setDeleteError(null);
    const reason = String(formData.get("delete_reason") ?? "").trim();
    if (!reason) {
      setDeleteError("삭제 사유를 입력해 주세요.");
      return;
    }
    startDeleteTransition(async () => {
      try {
        const result = await deleteQuoteAction(formData);
        if (!result.success) {
          setDeleteError(result.error || "견적 삭제에 실패했습니다.");
          return;
        }
        router.push(`/customers/${quote.customer_id}/quotes?deleted=1`);
      } catch (error) {
        setDeleteError(
          error instanceof Error
            ? error.message
            : "견적 삭제에 실패했습니다.",
        );
      }
    });
  }

  const items = quote.quote_items ?? [];
  const files = quote.quote_files ?? [];
  const itemsSum = items.reduce((sum, i) => sum + (i.amount || 0), 0);

  return (
    <div className="space-y-5">
      {toast && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            /실패|오류|없/.test(toast)
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-emerald-100 text-emerald-900"
          }`}
        >
          {toast}
        </div>
      )}

      {/* Header */}
      <section className="dashboard-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">
                {quote.title}
              </h2>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                  ERP_QUOTE_STATUS_BADGE[quote.status] ??
                  "bg-slate-100 text-slate-900"
                }`}
              >
                {quote.status}
              </span>
              <span className="inline-flex rounded-full bg-navy-800/5 px-2.5 py-1 text-xs font-medium text-navy-800">
                {quote.quote_type} · v{quote.version_number}
              </span>
              {quote.is_lx_material && (
                <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-300">
                  LX 자재
                </span>
              )}
              {quote.is_contract_quote && (
                <span className="inline-flex rounded-full bg-navy-800 px-2.5 py-1 text-xs font-semibold text-gold-400">
                  계약견적
                </span>
              )}
            </div>

            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
              <InfoItem
                label="고객명"
                value={
                  quote.customers ? (
                    <Link
                      href={`/customers/${quote.customer_id}`}
                      className="hover:text-navy-800 hover:underline"
                    >
                      {quote.customers.name}
                    </Link>
                  ) : (
                    "-"
                  )
                }
              />
              <InfoItem label="연락처" value={quote.customers?.phone ?? "-"} />
              <InfoItem
                label="공사주소"
                value={quote.customers?.address ?? "-"}
              />
              <InfoItem
                label="담당자"
                value={
                  quote.employees
                    ? formatEmployeeLabel(
                        quote.employees.name,
                        quote.employees.title,
                      )
                    : "미배정"
                }
              />
              <InfoItem label="견적번호" value={quote.quote_number ?? "-"} />
              <InfoItem label="발행일" value={formatDate(quote.issued_at)} />
              <InfoItem label="유효기간" value={formatDate(quote.valid_until)} />
              <InfoItem label="발송일" value={formatDateTime(quote.sent_at)} />
              <InfoItem
                label="고객 최종금액"
                value={
                  <span className="text-base font-bold text-navy-900">
                    {formatMoney(vatDisplay.customer_total_amount)}
                  </span>
                }
              />
            </dl>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
            <Link
              href={`/quotes/${quote.id}/edit`}
              prefetch={false}
              aria-label="견적 수정"
              className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white hover:bg-navy-700"
            >
              수정
            </Link>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="rounded-lg border border-navy-800/25 bg-white px-3 py-2 text-xs font-medium text-navy-900 hover:bg-navy-800/5"
            >
              견적서 미리보기
            </button>
            <button
              type="button"
              onClick={() => {
                setAutoPrintPreview(true);
                setPreviewOpen(true);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 hover:bg-slate-100"
            >
              인쇄·PDF 저장
            </button>
            <button
              type="button"
              onClick={() => setVersionModal(true)}
              className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-medium text-navy-900 hover:bg-gold-100"
            >
              새 버전 만들기
            </button>
            <button
              type="button"
              onClick={openSendModal}
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800 hover:bg-sky-100"
            >
              고객전송 링크
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setDeleteModal(true);
              }}
              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              삭제
            </button>
          </div>
        </div>
      </section>

      {/* Amounts */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <div className="dashboard-card p-4">
          <p className="text-xs text-slate-600">총견적금액</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {formatMoney(quote.total_amount)}
          </p>
          {quote.quote_mode && (
            <p className="mt-1 text-[11px] text-slate-600">
              {quote.quote_mode === "detailed" ? "상세견적" : "간편견적"}
            </p>
          )}
        </div>
        <div className="dashboard-card p-4">
          <p className="text-xs text-slate-600">특별할인</p>
          <p className="mt-1 text-lg font-semibold text-slate-600">
            {quote.discount_amount ? `-${formatMoney(quote.discount_amount)}` : "-"}
          </p>
        </div>
        <div className="dashboard-card p-4">
          <p className="text-xs text-slate-600">LX 자재 할인</p>
          <p className="mt-1 text-lg font-semibold text-slate-600">
            {quote.lx_discount_amount
              ? `-${formatMoney(quote.lx_discount_amount)}`
              : "-"}
          </p>
          <p className="mt-1 text-[11px] text-slate-600">{lxDiscountLabel}</p>
        </div>
        <div className="dashboard-card p-4">
          <p className="text-xs text-slate-600">공급가액</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {formatMoney(vatDisplay.supply_amount)}
          </p>
        </div>
        <div className="dashboard-card p-4">
          <p className="text-xs text-slate-600">부가세</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {formatMoney(vatDisplay.vat_amount)}
          </p>
          {vatDisplay.vat_mode != null && vatDisplay.vat_rate != null ? (
            <p className="mt-1 text-[11px] text-slate-600">
              {vatDisplay.vat_mode === "exclusive" ? "VAT 별도" : "VAT 포함"} ·{" "}
              {vatDisplay.vat_rate}%
            </p>
          ) : null}
        </div>
        <div className="dashboard-card border-gold-300 bg-gold-50 p-4">
          <p className="text-xs text-navy-700">고객 최종금액</p>
          <p className="mt-1 text-lg font-bold text-navy-900">
            {formatMoney(vatDisplay.customer_total_amount)}
          </p>
        </div>
      </section>

      {/* Files */}
      <section className="dashboard-card p-5">
        <h3 className="dashboard-section-title">첨부파일</h3>
        {files.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">첨부된 파일이 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-4 py-2.5"
              >
                <div className="text-sm">
                  <span className="font-medium text-slate-900">
                    {file.file_name}
                  </span>
                  {file.is_primary && (
                    <span className="ml-2 rounded-full bg-navy-800/5 px-2 py-0.5 text-xs text-navy-800">
                      대표
                    </span>
                  )}
                  <span className="ml-2 text-xs uppercase text-slate-600">
                    {file.file_type}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {file.file_type === "pdf" ? (
                    <button
                      type="button"
                      disabled={urlPending}
                      onClick={() => handleOpenFile(file, "preview")}
                      className="rounded-lg bg-navy-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-75"
                    >
                      PDF 미리보기
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={urlPending}
                      onClick={() => handleOpenFile(file, "download")}
                      className="rounded-lg bg-navy-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-75"
                    >
                      Excel 다운로드
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={urlPending}
                    onClick={() => handleOpenFile(file, "download")}
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-75"
                  >
                    다운로드
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm("이 첨부파일을 삭제할까요?")) return;
                      startUrlTransition(async () => {
                        const fd = new FormData();
                        fd.set("file_id", file.id);
                        fd.set("quote_id", quote.id);
                        fd.set("customer_id", quote.customer_id);
                        const r = await deleteQuoteFileAction(fd);
                        setToast(
                          r.success
                            ? r.message || "삭제되었습니다."
                            : r.error || "삭제 실패",
                        );
                        if (r.success) router.refresh();
                      });
                    }}
                    className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Items */}
      {items.length > 0 && (
        <section className="dashboard-card p-5">
          <h3 className="dashboard-section-title text-slate-900">
            {quoteDocumentTitle(quote.quote_mode)}
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-600">
                  <th className="py-2 font-semibold">
                    {quote.quote_mode === "simple" ? "항목명" : "공종"}
                  </th>
                  {quote.quote_mode !== "simple" && (
                    <th className="py-2 font-semibold">품목</th>
                  )}
                  <th className="py-2 font-semibold">구분</th>
                  {quote.quote_mode !== "simple" && (
                    <>
                      <th className="py-2 font-semibold">수량</th>
                      <th className="py-2 font-semibold">단위</th>
                      <th className="py-2 font-semibold text-right">단가</th>
                    </>
                  )}
                  <th className="py-2 font-semibold text-right">금액</th>
                  <th className="py-2 font-semibold text-center">LX</th>
                  <th className="py-2 font-semibold text-right">
                    LX 할인 대상 자재금액
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-2 font-medium text-slate-900">
                      {quote.quote_mode === "simple"
                        ? item.item_name || item.trade_name
                        : item.trade_name}
                      {item.remark?.trim() ? (
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs font-normal text-slate-600">
                          <span className="font-medium text-slate-600">
                            비고{" "}
                          </span>
                          {item.remark.trim()}
                        </p>
                      ) : null}
                    </td>
                    {quote.quote_mode !== "simple" && (
                      <td className="py-2 text-slate-900">
                        {item.item_name ?? "-"}
                      </td>
                    )}
                    <td className="py-2 text-slate-900">
                      {quoteCostTypeLabel(item.cost_type)}
                    </td>
                    {quote.quote_mode !== "simple" && (
                      <>
                        <td className="py-2 text-slate-900">
                          {item.quantity ?? "-"}
                        </td>
                        <td className="py-2 text-slate-900">
                          {formatQuoteUnit(item.unit) || "-"}
                        </td>
                        <td className="py-2 text-right font-medium text-slate-900">
                          {formatMoney(item.unit_price)}
                        </td>
                      </>
                    )}
                    <td className="py-2 text-right font-semibold text-slate-900">
                      {formatMoney(item.amount)}
                    </td>
                    <td className="py-2 text-center text-xs">
                      {item.is_lx_material ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900 ring-1 ring-amber-300">
                          LX
                        </span>
                      ) : (
                        <span className="text-slate-900">-</span>
                      )}
                    </td>
                    <td className="py-2 text-right font-medium text-slate-900">
                      {item.is_lx_material && item.cost_type === "시공+자재"
                        ? formatMoney(item.lx_discount_base_amount ?? 0)
                        : item.is_lx_material && item.cost_type === "자재"
                          ? formatMoney(item.amount)
                          : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td
                    colSpan={quote.quote_mode === "simple" ? 4 : 7}
                    className="py-2 text-right font-medium text-slate-900"
                  >
                    합계
                  </td>
                  <td className="py-2 text-right font-bold text-slate-900">
                    {formatMoney(itemsSum)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* Versions */}
      <section className="dashboard-card p-5">
        <h3 className="dashboard-section-title">버전 이력</h3>
        {versions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">버전 이력이 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {versions.map((v, idx) => {
              const prev = idx > 0 ? versions[idx - 1] : null;
              const diff = prev ? v.final_amount - prev.final_amount : null;
              const isCurrent = v.id === quote.id;
              const versionEmployee =
                v.employees ??
                employees.find((e) => e.id === v.assigned_employee_id) ??
                null;
              return (
                <li key={v.id}>
                  <Link
                    href={`/quotes/${v.id}`}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-sm transition ${
                      isCurrent
                        ? "border-navy-800 bg-navy-800/5"
                        : "border-gray-100 hover:bg-slate-100"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">
                        v{v.version_number}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          ERP_QUOTE_STATUS_BADGE[v.status] ??
                          "bg-slate-100 text-slate-900"
                        }`}
                      >
                        {v.status}
                      </span>
                      {isCurrent && (
                        <span className="text-xs text-navy-600">
                          (현재 보고 있는 버전)
                        </span>
                      )}
                      {versionEmployee && (
                        <span className="text-xs text-slate-600">
                          {formatEmployeeLabel(
                            versionEmployee.name,
                            versionEmployee.title,
                          )}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2 text-gray-600">
                      {formatMoney(v.final_amount)}
                      {diff != null && diff !== 0 && (
                        <span
                          className={
                            diff > 0
                              ? "text-xs font-medium text-red-600"
                              : "text-xs font-medium text-blue-600"
                          }
                        >
                          ({formatDiff(diff)})
                        </span>
                      )}
                      <span className="text-xs text-slate-600">
                        {formatDate(v.created_at)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Send logs */}
      <section className="dashboard-card p-5">
        <h3 className="dashboard-section-title">발송 이력</h3>
        {sendLogs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">발송 이력이 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sendLogs.map((log) => (
              <li
                key={log.id}
                className="rounded-lg border border-gray-100 px-4 py-2.5 text-sm"
              >
                <p className="text-xs text-slate-600">
                  {formatDateTime(log.created_at)}
                </p>
                {log.note && <p className="mt-1 text-slate-900">{log.note}</p>}
                {log.guide_message && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">
                    {log.guide_message}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Customer message + internal memo */}
      {(quote.customer_message || quote.memo) && (
        <section className="dashboard-card space-y-4 p-5">
          {quote.customer_message && (
            <div>
              <h3 className="dashboard-section-title">고객용 안내 문구</h3>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-900">
                {quote.customer_message}
              </p>
            </div>
          )}
          {quote.memo && (
            <div>
              <h3 className="dashboard-section-title">내부 메모</h3>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-900">
                {quote.memo}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                고객용 확인 링크에는 표시되지 않습니다.
              </p>
            </div>
          )}
        </section>
      )}

      {/* PDF preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">
                {previewTitle}
              </p>
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

      {/* New version modal */}
      {versionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h4 className="text-base font-semibold text-slate-900">
              새 버전 만들기
            </h4>
            <p className="mt-1 text-xs text-slate-600">
              현재 견적(v{quote.version_number})을 복사해 새 버전을 만듭니다.
              새 버전은 작성중 상태로 생성되며 수정 화면으로 이동합니다.
            </p>
            <form action={handleCreateVersion} className="mt-4 space-y-3">
              <input type="hidden" name="quote_id" value={quote.id} />
              <label className="flex items-center gap-2 text-sm text-slate-900">
                <input
                  type="checkbox"
                  name="copy_items"
                  value="1"
                  defaultChecked
                  className="h-4 w-4 rounded border-gray-300 text-gold-600 focus:ring-gold-500"
                />
                공종 내역 복사
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-900">
                <input
                  type="checkbox"
                  name="copy_files"
                  value="1"
                  className="h-4 w-4 rounded border-gray-300 text-gold-600 focus:ring-gold-500"
                />
                첨부파일 복사
              </label>
              <div>
                <label className="mb-1 block text-xs text-slate-600">
                  제목 접미사 (선택)
                </label>
                <input
                  name="title_suffix"
                  placeholder="예: (수정)"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                />
              </div>
              {versionError && (
                <p className="text-sm text-red-600">{versionError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setVersionModal(false)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={versionPending}
                  className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-75"
                >
                  {versionPending ? "생성 중..." : "새 버전 생성"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <QuoteCustomerShareModal
        key={sendModal ? `share-${quote.id}` : "share-closed"}
        open={sendModal}
        onClose={() => setSendModal(false)}
        quoteId={quote.id}
        customerName={quote.customers?.name || "고객"}
        title={quote.title}
        validUntil={quote.valid_until}
        finalAmount={quote.final_amount}
        customerMessage={quote.customer_message}
        customerPhone={quote.customers?.phone ?? null}
        showMarkSent
        onToast={setToast}
        onChanged={() => router.refresh()}
      />

      {/* Delete modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h4 className="text-base font-semibold text-slate-900">
              견적 삭제 확인
            </h4>
            <p className="mt-2 text-sm text-gray-600">
              삭제한 견적은 목록에서 제거되며 복구할 수 없습니다.
            </p>
            <div className="mt-4 space-y-1.5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <p>
                <span className="text-slate-600">견적명</span>
                <span className="ml-2 font-semibold text-slate-900">
                  {quote.title} (v{quote.version_number})
                </span>
              </p>
              <p>
                <span className="text-slate-600">고객 최종금액</span>
                <span className="ml-2 font-semibold text-slate-900">
                  {formatMoney(vatDisplay.customer_total_amount)}
                </span>
              </p>
            </div>
            <form action={handleDelete} className="mt-4 space-y-3">
              <input type="hidden" name="quote_id" value={quote.id} />
              <input
                type="hidden"
                name="customer_id"
                value={quote.customer_id}
              />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-900">
                  삭제 사유 <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="delete_reason"
                  required
                  rows={3}
                  maxLength={500}
                  placeholder="삭제 사유를 입력하세요"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                />
              </div>
              {deleteError && (
                <p className="text-sm text-red-600">{deleteError}</p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteModal(false);
                  }}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-slate-100"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={deletePending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-75"
                >
                  {deletePending ? "삭제 중..." : "견적 삭제"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {previewOpen ? (
        <QuotePreviewModal
          open={previewOpen}
          onClose={() => {
            setPreviewOpen(false);
            setAutoPrintPreview(false);
          }}
          model={previewModel}
          includeCover={includeCover}
          onIncludeCoverChange={setIncludeCover}
          autoPrint={autoPrintPreview}
        />
      ) : null}
    </div>
  );
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className="mt-0.5 font-medium text-navy-900">{value}</dd>
    </div>
  );
}
