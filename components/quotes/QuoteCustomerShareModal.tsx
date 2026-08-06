"use client";

import { useEffect, useState, useTransition } from "react";
import {
  markQuoteSentAction,
  prepareQuoteSendAction,
  regenerateQuoteShareLinkAction,
  revokeQuoteShareLinkAction,
} from "@/app/actions/quote-mgmt";
import { buildQuoteGuideMessage } from "@/lib/crm/quote-constants";
import { withQuoteCoverQuery } from "@/lib/crm/quote-document";

type Props = {
  open: boolean;
  onClose: () => void;
  /** null이면 미저장 — 링크 생성 금지 */
  quoteId: string | null;
  customerName: string;
  title: string;
  validUntil?: string | null;
  finalAmount: number;
  customerMessage?: string | null;
  customerPhone?: string | null;
  /** 상세 화면에서 발송완료 표시 유지 */
  showMarkSent?: boolean;
  onToast?: (message: string) => void;
  onChanged?: () => void;
};

export default function QuoteCustomerShareModal({
  open,
  onClose,
  quoteId,
  customerName,
  title,
  validUntil = null,
  finalAmount,
  customerMessage = null,
  customerPhone = null,
  showMarkSent = false,
  onToast,
  onChanged,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [guideMessage, setGuideMessage] = useState<string | null>(null);
  const [baseViewUrl, setBaseViewUrl] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [includeCover, setIncludeCover] = useState(true);
  const [note, setNote] = useState("");

  function applyCover(url: string | null, cover: boolean) {
    if (!url) return null;
    return withQuoteCoverQuery(url, cover);
  }

  function rebuildGuide(url: string | null, cover: boolean) {
    const nextUrl = applyCover(url, cover);
    setViewUrl(nextUrl);
    setGuideMessage(
      buildQuoteGuideMessage({
        customerName: customerName || "고객",
        title,
        validUntil,
        finalAmount,
        customerMessage,
        viewUrl: nextUrl,
      }),
    );
  }

  function applyPrepareResult(
    result: {
      success: boolean;
      error?: string;
      viewUrl?: string;
      guideMessage?: string;
      message?: string;
    },
    cover: boolean,
  ) {
    if (!result.success) {
      setError(result.error || "고객전송 링크 준비에 실패했습니다.");
      return;
    }
    const raw = result.viewUrl || null;
    setBaseViewUrl(raw);
    const nextUrl = applyCover(raw, cover);
    setViewUrl(nextUrl);
    setGuideMessage(
      result.guideMessage && raw && nextUrl
        ? result.guideMessage.replace(raw, nextUrl)
        : buildQuoteGuideMessage({
            customerName: customerName || "고객",
            title,
            validUntil,
            finalAmount,
            customerMessage,
            viewUrl: nextUrl,
          }),
    );
    if (result.message) setMessage(result.message);
  }

  function loadLink() {
    if (!quoteId) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("quote_id", quoteId);
      fd.set("origin", window.location.origin);
      const result = await prepareQuoteSendAction(fd);
      applyPrepareResult(result, includeCover);
    });
  }

  useEffect(() => {
    if (!open || !quoteId) return;
    let cancelled = false;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("quote_id", quoteId);
      fd.set("origin", window.location.origin);
      const result = await prepareQuoteSendAction(fd);
      if (cancelled) return;
      applyPrepareResult(result, true);
    });
    return () => {
      cancelled = true;
    };
    // includeCover는 체크박스에서만 URL 갱신
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quoteId]);

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      onToast?.(`${label}를 복사했습니다.`);
      setMessage(`${label}를 복사했습니다.`);
    } catch {
      setError(`${label} 복사에 실패했습니다.`);
    }
  }

  async function shareLink() {
    if (!viewUrl) return;
    const shareData = {
      title: `${customerName || "고객"} 견적서`,
      text: guideMessage || `${title} 견적서를 확인해 주세요.`,
      url: viewUrl,
    };
    try {
      if (
        typeof navigator.share === "function" &&
        navigator.canShare?.(shareData)
      ) {
        await navigator.share(shareData);
        onToast?.("공유 창을 열었습니다.");
        return;
      }
      if (typeof navigator.share === "function") {
        await navigator.share({ url: viewUrl, title: shareData.title });
        onToast?.("공유 창을 열었습니다.");
        return;
      }
      await copyText(viewUrl, "링크");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("공유에 실패했습니다. 링크 복사를 이용해 주세요.");
    }
  }

  function handleRegenerate() {
    if (!quoteId) return;
    if (
      !window.confirm(
        "기존 고객전송 링크를 폐기하고 새 링크를 발급할까요? 이전 링크는 더 이상 열리지 않습니다.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("quote_id", quoteId);
      fd.set("origin", window.location.origin);
      const result = await regenerateQuoteShareLinkAction(fd);
      applyPrepareResult(result, includeCover);
      if (result.success) {
        onToast?.(result.message || "새 링크가 발급되었습니다.");
        onChanged?.();
      }
    });
  }

  function handleRevoke() {
    if (!quoteId) return;
    if (
      !window.confirm(
        "고객전송 링크를 비활성화할까요? 기존 링크는 더 이상 열리지 않습니다.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("quote_id", quoteId);
      const result = await revokeQuoteShareLinkAction(fd);
      if (!result.success) {
        setError(result.error || "링크 비활성화에 실패했습니다.");
        return;
      }
      setBaseViewUrl(null);
      setViewUrl(null);
      setGuideMessage(null);
      setMessage(result.message || "링크가 비활성화되었습니다.");
      onToast?.(result.message || "링크가 비활성화되었습니다.");
      onChanged?.();
    });
  }

  function handleMarkSent() {
    if (!quoteId) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("quote_id", quoteId);
      fd.set("origin", window.location.origin);
      if (viewUrl) fd.set("view_url", viewUrl);
      if (note.trim()) fd.set("note", note.trim());
      const result = await markQuoteSentAction(fd);
      if (!result.success) {
        setError(result.error || "발송 처리에 실패했습니다.");
        return;
      }
      const raw = result.viewUrl || baseViewUrl;
      if (raw) setBaseViewUrl(raw);
      rebuildGuide(raw ?? null, includeCover);
      setMessage(result.message || "발송완료로 처리되었습니다.");
      onToast?.(result.message || "발송완료로 처리되었습니다.");
      onChanged?.();
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h4 className="text-base font-semibold text-slate-900">고객전송 링크</h4>
        <p className="mt-1 text-xs text-slate-600">
          링크를 복사하거나 모바일 공유로 전달하세요. (카카오톡 자동발송은 지원하지
          않습니다.)
        </p>

        {!quoteId ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            먼저 저장해 주세요. 저장된 견적에서만 고객전송 링크를 만들 수 있습니다.
          </div>
        ) : (
          <>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-900">
              <input
                type="checkbox"
                checked={includeCover}
                onChange={(e) => {
                  const next = e.target.checked;
                  setIncludeCover(next);
                  rebuildGuide(baseViewUrl ?? viewUrl, next);
                }}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              고객 링크에 회사소개 표지 포함
            </label>

            <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50/70 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-600">안내 문구</p>
                <button
                  type="button"
                  disabled={!guideMessage || pending}
                  onClick={() =>
                    guideMessage && copyText(guideMessage, "안내 문구")
                  }
                  className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-slate-100 disabled:opacity-75"
                >
                  복사
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-900">
                {pending && !guideMessage
                  ? "링크 준비 중…"
                  : (guideMessage ?? "—")}
              </p>
            </div>

            {viewUrl ? (
              <div className="mt-2 space-y-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
                <p className="break-all text-xs text-sky-800">{viewUrl}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => copyText(viewUrl, "링크")}
                    className="rounded-md border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-75"
                  >
                    링크 복사
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void shareLink()}
                    className="rounded-md bg-sky-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-75"
                  >
                    공유하기
                  </button>
                  <a
                    href={viewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100"
                  >
                    미리 열기
                  </a>
                </div>
              </div>
            ) : (
              <div className="mt-2 rounded-lg border border-dashed border-gray-200 px-3 py-3 text-xs text-slate-600">
                {pending
                  ? "링크를 준비하는 중…"
                  : "활성 링크가 없습니다. 아래에서 링크를 다시 준비하거나 재발급하세요."}
                {!pending ? (
                  <button
                    type="button"
                    onClick={loadLink}
                    className="mt-2 block rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100"
                  >
                    링크 준비
                  </button>
                ) : null}
              </div>
            )}

            {customerPhone ? (
              <div className="mt-2 flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                <p className="text-sm text-gray-600">
                  고객 연락처: {customerPhone}
                </p>
                <button
                  type="button"
                  onClick={() => copyText(customerPhone, "연락처")}
                  className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-slate-100"
                >
                  복사
                </button>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={handleRegenerate}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-75"
              >
                새 링크 재발급
              </button>
              <button
                type="button"
                disabled={pending || !viewUrl}
                onClick={handleRevoke}
                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-75"
              >
                링크 비활성화
              </button>
            </div>

            {showMarkSent ? (
              <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
                <p className="text-xs text-slate-600">
                  직접 전달한 뒤 상태를 발송완료로 표시할 수 있습니다.
                </p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="발송 비고 (선택)"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleMarkSent}
                  className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-75"
                >
                  {pending ? "처리 중…" : "발송완료로 표시"}
                </button>
              </div>
            ) : null}
          </>
        )}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {message ? (
          <p className="mt-3 text-sm text-emerald-700">{message}</p>
        ) : null}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:bg-slate-100"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
