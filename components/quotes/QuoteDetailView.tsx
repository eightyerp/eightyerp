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
  markQuoteSentAction,
  prepareQuoteSendAction,
  setContractQuoteAction,
  type QuoteActionResult,
} from "@/app/actions/quote-mgmt";
import { formatEmployeeLabel } from "@/lib/crm/constants";
import {
  buildQuoteGuideMessage,
  ERP_QUOTE_STATUS_BADGE,
  formatQuoteUnit,
  quoteCostTypeLabel,
  quoteDocumentTitle,
} from "@/lib/crm/quote-constants";
import type { QuoteBrandProfile } from "@/lib/crm/quote-brand-shared";
import {
  withQuoteCoverQuery,
  type QuoteDocumentModel,
} from "@/lib/crm/quote-document";
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

type QuoteDetailViewProps = {
  quote: ErpQuote;
  versions: ErpQuote[];
  sendLogs: ErpQuoteSendLog[];
  signedUrls: Record<string, string>;
  employees?: Employee[];
  /** 서버에서 1회 조회한 표지 브랜드 (미리보기 재조회 없음) */
  brand?: QuoteBrandProfile | null;
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
  const [sendPending, startSendTransition] = useTransition();
  const [sendError, setSendError] = useState<string | null>(null);
  const [guideMessage, setGuideMessage] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [includeCover, setIncludeCover] = useState(true);
  const [baseViewUrl, setBaseViewUrl] = useState<string | null>(null);

  const [contractPending, startContractTransition] = useTransition();
  const [showContractConfirm, setShowContractConfirm] = useState(false);

  const [deleteModal, setDeleteModal] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /** 이미 로드된 quote / quote_items만 사용 — 미리보기용 추가 조회 없음 */
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
      lxDiscountRate: Number(quote.lx_discount_rate ?? 0),
      brand,
      showCover: includeCover,
      items: (quote.quote_items ?? []).map((item, index) => ({
        trade_name: item.trade_name,
        item_name: item.item_name,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        amount: item.amount,
        cost_type: item.cost_type,
        is_lx_material: item.is_lx_material,
        lx_discount_base_amount: item.lx_discount_base_amount,
        lx_discount_type: item.lx_discount_type,
        lx_discount_value: item.lx_discount_value,
        sort_order: item.sort_order ?? index,
      })),
    }),
    [quote, includeCover, brand],
  );

  const previewGuideMessage = buildQuoteGuideMessage({
    customerName: quote.customers?.name || "고객",
    title: quote.title,
    validUntil: quote.valid_until,
    finalAmount: quote.final_amount,
    customerMessage: quote.customer_message,
    viewUrl,
  });

  function applyCoverToUrl(url: string | null, cover: boolean) {
    if (!url) return null;
    return withQuoteCoverQuery(url, cover);
  }

  function rebuildGuideForCover(url: string | null, cover: boolean) {
    const nextUrl = applyCoverToUrl(url, cover);
    setViewUrl(nextUrl);
    setGuideMessage(
      buildQuoteGuideMessage({
        customerName: quote.customers?.name || "고객",
        title: quote.title,
        validUntil: quote.valid_until,
        finalAmount: quote.final_amount,
        customerMessage: quote.customer_message,
        viewUrl: nextUrl,
      }),
    );
  }

  function openSendModal() {
    setSendError(null);
    setSendModal(true);
    startSendTransition(async () => {
      const fd = new FormData();
      fd.set("quote_id", quote.id);
      fd.set("origin", window.location.origin);
      const result = await prepareQuoteSendAction(fd);
      if (!result.success) {
        setSendError(result.error || "발송 안내 준비에 실패했습니다.");
        return;
      }
      const rawUrl = result.viewUrl || null;
      setBaseViewUrl(rawUrl);
      const nextUrl = applyCoverToUrl(rawUrl, includeCover);
      setViewUrl(nextUrl);
      setGuideMessage(
        result.guideMessage
          ? result.guideMessage.replace(rawUrl ?? "", nextUrl ?? "")
          : buildQuoteGuideMessage({
              customerName: quote.customers?.name || "고객",
              title: quote.title,
              validUntil: quote.valid_until,
              finalAmount: quote.final_amount,
              customerMessage: quote.customer_message,
              viewUrl: nextUrl,
            }),
      );
    });
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

  function handleMarkSent(formData: FormData) {
    setSendError(null);
    formData.set("origin", window.location.origin);
    if (viewUrl) formData.set("view_url", viewUrl);
    startSendTransition(async () => {
      const result = await markQuoteSentAction(formData);
      if (!result.success) {
        setSendError(result.error || "발송 처리에 실패했습니다.");
        return;
      }
      const rawUrl = result.viewUrl || baseViewUrl;
      if (rawUrl) setBaseViewUrl(rawUrl);
      const nextUrl = applyCoverToUrl(rawUrl, includeCover);
      setViewUrl(nextUrl);
      setGuideMessage(
        result.guideMessage
          ? result.guideMessage.replace(rawUrl ?? "", nextUrl ?? "")
          : previewGuideMessage,
      );
      setToast(result.message || "발송완료로 처리되었습니다.");
      router.refresh();
    });
  }

  function handleSetContract() {
    startContractTransition(async () => {
      const formData = new FormData();
      formData.set("quote_id", quote.id);
      const result: QuoteActionResult = await setContractQuoteAction(formData);
      setShowContractConfirm(false);
      if (!result.success) {
        setToast(result.error || "계약 견적 지정에 실패했습니다.");
        return;
      }
      setToast(result.message || "계약 견적으로 지정되었습니다.");
      router.refresh();
    });
  }

  function handleDelete(formData: FormData) {
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteQuoteAction(formData);
      if (!result.success) {
        setDeleteError(result.error || "견적 삭제에 실패했습니다.");
        return;
      }
      router.push(`/customers/${quote.customer_id}/quotes?deleted=1`);
    });
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast(`${label}이(가) 복사되었습니다.`);
    } catch {
      setToast("복사에 실패했습니다. 직접 선택해 복사해 주세요.");
    }
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
              : "border-green-200 bg-green-50 text-green-700"
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
              <h2 className="text-xl font-bold text-gray-900">
                {quote.title}
              </h2>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                  ERP_QUOTE_STATUS_BADGE[quote.status] ??
                  "bg-gray-100 text-gray-600"
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
                label="최종금액"
                value={
                  <span className="text-base font-bold text-navy-900">
                    {formatMoney(quote.final_amount)}
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
              고객 발송
            </button>
            {!quote.is_contract_quote && (
              <button
                type="button"
                onClick={() => setShowContractConfirm(true)}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
              >
                계약 견적으로 지정
              </button>
            )}
            <button
              type="button"
              onClick={() => setDeleteModal(true)}
              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              삭제
            </button>
          </div>
        </div>
      </section>

      {/* Amounts */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="dashboard-card p-4">
          <p className="text-xs text-gray-500">총견적금액</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {formatMoney(quote.total_amount)}
          </p>
          {quote.quote_mode && (
            <p className="mt-1 text-[11px] text-gray-400">
              {quote.quote_mode === "detailed" ? "상세견적" : "간편견적"}
            </p>
          )}
        </div>
        <div className="dashboard-card p-4">
          <p className="text-xs text-gray-500">일반 할인금액</p>
          <p className="mt-1 text-lg font-semibold text-gray-500">
            {quote.discount_amount ? `-${formatMoney(quote.discount_amount)}` : "-"}
          </p>
        </div>
        <div className="dashboard-card p-4">
          <p className="text-xs text-gray-500">LX 자재 할인</p>
          <p className="mt-1 text-lg font-semibold text-gray-500">
            {quote.lx_discount_amount
              ? `-${formatMoney(quote.lx_discount_amount)}`
              : "-"}
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            할인율 {Number(quote.lx_discount_rate ?? 0)}%
          </p>
        </div>
        <div className="dashboard-card border-gold-300 bg-gold-50 p-4">
          <p className="text-xs text-navy-700">최종금액</p>
          <p className="mt-1 text-lg font-bold text-navy-900">
            {formatMoney(quote.final_amount)}
          </p>
        </div>
      </section>

      {/* Files */}
      <section className="dashboard-card p-5">
        <h3 className="dashboard-section-title">첨부파일</h3>
        {files.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">첨부된 파일이 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-4 py-2.5"
              >
                <div className="text-sm">
                  <span className="font-medium text-gray-800">
                    {file.file_name}
                  </span>
                  {file.is_primary && (
                    <span className="ml-2 rounded-full bg-navy-800/5 px-2 py-0.5 text-xs text-navy-800">
                      대표
                    </span>
                  )}
                  <span className="ml-2 text-xs uppercase text-gray-400">
                    {file.file_type}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {file.file_type === "pdf" ? (
                    <button
                      type="button"
                      disabled={urlPending}
                      onClick={() => handleOpenFile(file, "preview")}
                      className="rounded-lg bg-navy-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-60"
                    >
                      PDF 미리보기
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={urlPending}
                      onClick={() => handleOpenFile(file, "download")}
                      className="rounded-lg bg-navy-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-60"
                    >
                      Excel 다운로드
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={urlPending}
                    onClick={() => handleOpenFile(file, "download")}
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
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
          <h3 className="dashboard-section-title text-gray-900">
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
                    <td className="py-2 font-medium text-gray-900">
                      {quote.quote_mode === "simple"
                        ? item.item_name || item.trade_name
                        : item.trade_name}
                    </td>
                    {quote.quote_mode !== "simple" && (
                      <td className="py-2 text-gray-700">
                        {item.item_name ?? "-"}
                      </td>
                    )}
                    <td className="py-2 text-gray-700">
                      {quoteCostTypeLabel(item.cost_type)}
                    </td>
                    {quote.quote_mode !== "simple" && (
                      <>
                        <td className="py-2 text-gray-700">
                          {item.quantity ?? "-"}
                        </td>
                        <td className="py-2 text-gray-700">
                          {formatQuoteUnit(item.unit) || "-"}
                        </td>
                        <td className="py-2 text-right font-medium text-gray-900">
                          {formatMoney(item.unit_price)}
                        </td>
                      </>
                    )}
                    <td className="py-2 text-right font-semibold text-gray-900">
                      {formatMoney(item.amount)}
                    </td>
                    <td className="py-2 text-center text-xs">
                      {item.is_lx_material ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900 ring-1 ring-amber-300">
                          LX
                        </span>
                      ) : (
                        <span className="text-gray-700">-</span>
                      )}
                    </td>
                    <td className="py-2 text-right font-medium text-gray-900">
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
                    className="py-2 text-right font-medium text-gray-700"
                  >
                    합계
                  </td>
                  <td className="py-2 text-right font-bold text-gray-900">
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
          <p className="mt-3 text-sm text-gray-400">버전 이력이 없습니다.</p>
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
                        : "border-gray-100 hover:bg-gray-50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">
                        v{v.version_number}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          ERP_QUOTE_STATUS_BADGE[v.status] ??
                          "bg-gray-100 text-gray-600"
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
                        <span className="text-xs text-gray-400">
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
                      <span className="text-xs text-gray-400">
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
          <p className="mt-3 text-sm text-gray-400">발송 이력이 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sendLogs.map((log) => (
              <li
                key={log.id}
                className="rounded-lg border border-gray-100 px-4 py-2.5 text-sm"
              >
                <p className="text-xs text-gray-400">
                  {formatDateTime(log.created_at)}
                </p>
                {log.note && <p className="mt-1 text-gray-700">{log.note}</p>}
                {log.guide_message && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-gray-500">
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
              <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">
                {quote.customer_message}
              </p>
            </div>
          )}
          {quote.memo && (
            <div>
              <h3 className="dashboard-section-title">내부 메모</h3>
              <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">
                {quote.memo}
              </p>
              <p className="mt-1 text-xs text-gray-400">
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
              <p className="text-sm font-semibold text-gray-900">
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
            <h4 className="text-base font-semibold text-gray-900">
              새 버전 만들기
            </h4>
            <p className="mt-1 text-xs text-gray-500">
              현재 견적(v{quote.version_number})을 복사해 새 버전을 만듭니다.
              새 버전은 작성중 상태로 생성되며 수정 화면으로 이동합니다.
            </p>
            <form action={handleCreateVersion} className="mt-4 space-y-3">
              <input type="hidden" name="quote_id" value={quote.id} />
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="copy_items"
                  value="1"
                  defaultChecked
                  className="h-4 w-4 rounded border-gray-300 text-gold-600 focus:ring-gold-500"
                />
                공종 내역 복사
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="copy_files"
                  value="1"
                  className="h-4 w-4 rounded border-gray-300 text-gold-600 focus:ring-gold-500"
                />
                첨부파일 복사
              </label>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
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
                  className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
                >
                  {versionPending ? "생성 중..." : "새 버전 생성"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Send modal */}
      {sendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h4 className="text-base font-semibold text-gray-900">
              고객 발송
            </h4>
            <p className="mt-1 text-xs text-gray-500">
              카카오톡/문자 등으로 직접 발송한 뒤, 아래 안내 문구를 복사해
              전달하고 발송완료로 표시해 주세요.
            </p>

            <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={includeCover}
                onChange={(e) => {
                  const next = e.target.checked;
                  setIncludeCover(next);
                  rebuildGuideForCover(baseViewUrl ?? viewUrl, next);
                }}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              고객 링크에 회사소개 표지 포함
            </label>

            <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50/70 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500">안내 문구</p>
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(guideMessage ?? previewGuideMessage, "안내 문구")
                  }
                  className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  복사
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                {guideMessage ?? previewGuideMessage}
              </p>
            </div>

            {viewUrl && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
                <p className="truncate text-xs text-sky-800">{viewUrl}</p>
                <button
                  type="button"
                  onClick={() => copyToClipboard(viewUrl, "확인 링크")}
                  className="shrink-0 rounded-md border border-sky-200 bg-white px-2 py-1 text-xs text-sky-700"
                >
                  링크 복사
                </button>
              </div>
            )}

            {quote.customers?.phone && (
              <div className="mt-2 flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                <p className="text-sm text-gray-600">
                  고객 연락처: {quote.customers.phone}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(quote.customers!.phone, "연락처")
                  }
                  className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  복사
                </button>
              </div>
            )}

            <form action={handleMarkSent} className="mt-4 space-y-3">
              <input type="hidden" name="quote_id" value={quote.id} />
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  발송 비고 (선택)
                </label>
                <textarea
                  name="note"
                  rows={2}
                  placeholder="예: 카카오톡으로 발송함"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                />
              </div>
              {sendError && <p className="text-sm text-red-600">{sendError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSendModal(false)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600"
                >
                  닫기
                </button>
                <button
                  type="submit"
                  disabled={sendPending}
                  className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
                >
                  {sendPending ? "처리 중..." : "발송완료로 표시"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contract confirm */}
      {showContractConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h4 className="text-base font-semibold text-gray-900">
              계약 견적으로 지정
            </h4>
            <p className="mt-2 text-sm text-gray-600">
              이 견적을 계약 견적으로 지정합니다. 같은 고객의 다른 계약견적
              지정은 자동으로 해제됩니다.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowContractConfirm(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={contractPending}
                onClick={handleSetContract}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {contractPending ? "처리 중..." : "계약 견적으로 지정"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h4 className="text-base font-semibold text-gray-900">
              견적 삭제 확인
            </h4>
            <p className="mt-2 text-sm text-gray-600">
              삭제한 견적은 목록에서 제거되며 복구할 수 없습니다.
            </p>
            <div className="mt-4 space-y-1.5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <p>
                <span className="text-gray-500">견적명</span>
                <span className="ml-2 font-semibold text-gray-900">
                  {quote.title} (v{quote.version_number})
                </span>
              </p>
              <p>
                <span className="text-gray-500">최종금액</span>
                <span className="ml-2 font-semibold text-gray-900">
                  {formatMoney(quote.final_amount)}
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
                <label className="mb-1 block text-xs font-medium text-gray-500">
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
              {deleteError && (
                <p className="text-sm text-red-600">{deleteError}</p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDeleteModal(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={deletePending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
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
          onClose={() => setPreviewOpen(false)}
          model={previewModel}
          includeCover={includeCover}
          onIncludeCoverChange={setIncludeCover}
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
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-navy-900">{value}</dd>
    </div>
  );
}
