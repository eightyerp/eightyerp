"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  archiveQuoteTemplateAction,
  getQuoteTemplateAction,
  listQuoteTemplatesAction,
  renameQuoteTemplateAction,
  saveQuoteTemplateAction,
} from "@/app/actions/quote-templates";
import {
  QUOTE_TEMPLATE_TYPES,
  type QuoteTemplate,
  type QuoteTemplateItemPayload,
  type QuoteTemplateListItem,
  type QuoteTemplateType,
} from "@/lib/crm/quote-template-shared";
import type { QuoteMode } from "@/lib/crm/quote-constants";

type SaveProps = {
  open: boolean;
  onClose: () => void;
  defaultQuoteType: string;
  quoteMode: QuoteMode;
  tradeOrder: string[];
  items: QuoteTemplateItemPayload[];
  onToast?: (message: string) => void;
};

function resolveTemplateType(defaultQuoteType: string): QuoteTemplateType {
  if (defaultQuoteType === "인테리어" || defaultQuoteType === "창호") {
    return defaultQuoteType;
  }
  return "공통";
}

export function QuoteTemplateSaveModal({
  open,
  onClose,
  defaultQuoteType,
  quoteMode,
  tradeOrder,
  items,
  onToast,
}: SaveProps) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [quoteType, setQuoteType] = useState<QuoteTemplateType>(() =>
    resolveTemplateType(defaultQuoteType),
  );
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-navy-900">템플릿으로 저장</h3>
        <p className="mt-1 text-xs text-slate-500">
          고객·특별할인·견적번호는 저장되지 않습니다. 실제 견적은 별도 「저장」으로
          저장하세요.
        </p>
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-slate-600">
            템플릿명
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="예: 30평 기본 인테리어"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            견적 유형
            <select
              value={quoteType}
              onChange={(e) =>
                setQuoteType(e.target.value as QuoteTemplateType)
              }
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              {QUOTE_TEMPLATE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-slate-500">
            공종 {tradeOrder.length}개 · 세부항목 {items.length}건 ·{" "}
            {quoteMode === "detailed" ? "상세견적" : "간편견적"}
          </p>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600"
          >
            취소
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await saveQuoteTemplateAction({
                  name,
                  quoteType,
                  quoteMode,
                  tradeOrder,
                  items,
                });
                if (!result.success) {
                  setError(result.error ?? "저장 실패");
                  return;
                }
                onToast?.(result.message ?? "템플릿으로 저장되었습니다.");
                onClose();
              });
            }}
            className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "저장 중…" : "템플릿 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

type LoadProps = {
  open: boolean;
  onClose: () => void;
  hasExistingItems: boolean;
  onApply: (
    template: QuoteTemplate,
    mode: "replace" | "append",
  ) => void;
  onToast?: (message: string) => void;
};

export function QuoteTemplateLoadModal({
  open,
  onClose,
  hasExistingItems,
  onApply,
  onToast,
}: LoadProps) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<QuoteTemplateType | "전체">(
    "전체",
  );
  const [templates, setTemplates] = useState<QuoteTemplateListItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmTpl, setConfirmTpl] = useState<QuoteTemplate | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function reload(nextQuery = query, nextType = typeFilter) {
    startTransition(async () => {
      setError(null);
      const result = await listQuoteTemplatesAction({
        query: nextQuery,
        quoteType: nextType,
      });
      if (!result.success) {
        setError(result.error ?? "목록 실패");
        setTemplates([]);
        return;
      }
      setCanManage(Boolean(result.canManage));
      try {
        setTemplates(
          JSON.parse(result.templatesJson ?? "[]") as QuoteTemplateListItem[],
        );
      } catch {
        setTemplates([]);
      }
    });
  }

  // 마운트 시 1회 로드 (부모에서 open일 때만 마운트)
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => templates, [templates]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-semibold text-navy-900">
            템플릿 불러오기
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") reload();
              }}
              placeholder="템플릿명 검색"
              className="min-w-[160px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <select
              value={typeFilter}
              onChange={(e) => {
                const next = e.target.value as QuoteTemplateType | "전체";
                setTypeFilter(next);
                reload(query, next);
              }}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="전체">전체</option>
              {QUOTE_TEMPLATE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => reload()}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              검색
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
          {pending && filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">불러오는 중…</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              표시할 템플릿이 없습니다.
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((tpl) => (
                <li
                  key={tpl.id}
                  className="rounded-lg border border-slate-200 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-navy-900">{tpl.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {tpl.quote_type} · 공종 {tpl.trade_count} · 항목{" "}
                        {tpl.item_count} ·{" "}
                        {tpl.updated_at
                          ? new Date(tpl.updated_at).toLocaleString("ko-KR")
                          : "-"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="rounded-md bg-navy-800 px-2.5 py-1.5 text-xs font-medium text-white"
                        onClick={() => {
                          startTransition(async () => {
                            const result = await getQuoteTemplateAction(tpl.id);
                            if (!result.success || !result.templateJson) {
                              setError(result.error ?? "불러오기 실패");
                              return;
                            }
                            const full = JSON.parse(
                              result.templateJson,
                            ) as QuoteTemplate;
                            if (hasExistingItems) {
                              setConfirmTpl(full);
                            } else {
                              onApply(full, "replace");
                              onClose();
                            }
                          });
                        }}
                      >
                        불러오기
                      </button>
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs"
                            onClick={() => {
                              setRenameId(tpl.id);
                              setRenameValue(tpl.name);
                            }}
                          >
                            이름 변경
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900"
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `"${tpl.name}" 템플릿을 보관 처리할까요?`,
                                )
                              ) {
                                return;
                              }
                              startTransition(async () => {
                                const result = await archiveQuoteTemplateAction(
                                  tpl.id,
                                );
                                if (!result.success) {
                                  setError(result.error ?? "보관 실패");
                                  return;
                                }
                                onToast?.(result.message ?? "보관되었습니다.");
                                reload();
                              });
                            }}
                          >
                            보관 처리
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-200 px-5 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600"
          >
            닫기
          </button>
        </div>
      </div>

      {confirmTpl ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h4 className="font-semibold text-navy-900">항목 적용 방식</h4>
            <p className="mt-2 text-sm text-slate-600">
              현재 작성 중인 항목이 있습니다. 원본 견적·템플릿은 삭제되지
              않습니다.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                className="rounded-lg bg-navy-800 px-3 py-2 text-sm font-medium text-white"
                onClick={() => {
                  onApply(confirmTpl, "replace");
                  setConfirmTpl(null);
                  onClose();
                }}
              >
                1. 현재 항목 교체
              </button>
              <button
                type="button"
                className="rounded-lg border border-navy-800 px-3 py-2 text-sm font-medium text-navy-800"
                onClick={() => {
                  onApply(confirmTpl, "append");
                  setConfirmTpl(null);
                  onClose();
                }}
              >
                2. 현재 항목에 추가
              </button>
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600"
                onClick={() => setConfirmTpl(null)}
              >
                3. 취소
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {renameId ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h4 className="font-semibold text-navy-900">템플릿 이름 변경</h4>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              maxLength={120}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                onClick={() => setRenameId(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="rounded-lg bg-navy-800 px-3 py-2 text-sm text-white"
                onClick={() => {
                  startTransition(async () => {
                    const result = await renameQuoteTemplateAction({
                      id: renameId,
                      name: renameValue,
                    });
                    if (!result.success) {
                      setError(result.error ?? "이름 변경 실패");
                      return;
                    }
                    setRenameId(null);
                    onToast?.(result.message ?? "변경되었습니다.");
                    reload();
                  });
                }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
