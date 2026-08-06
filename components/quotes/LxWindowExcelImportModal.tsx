"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildQuoteLinesFromLxImport,
  sumLxImportRows,
  type LxImportCategory,
  type LxImportParseResult,
  type LxImportPreviewRow,
  type LxImportRowStatus,
} from "@/lib/crm/lx-window-excel";
import { lxWindowAdapter, recognizeQuoteWorkbook, type TemplateRecognition } from "@/lib/excel-engine";
import { formatQuantitySetDisplay } from "@/lib/crm/lx-window-meta";
import type { QuoteLineRow } from "@/components/quotes/QuoteTradeItemsPanel";

type Props = {
  open: boolean;
  onClose: () => void;
  createRow: (partial?: Partial<QuoteLineRow>) => QuoteLineRow;
  onApply: (input: {
    rows: QuoteLineRow[];
    promotionDiscount: number;
    promotionMemo: string;
  }) => void;
  /** 데모·검증용: 열릴 때 자동 로드할 xlsx URL */
  initialSourceUrl?: string | null;
};

const CATEGORY_OPTIONS: LxImportCategory[] = [
  "창호제품",
  "추가부자재",
  "부가시공비",
  "표준시공비",
  "프로모션할인",
  "기타",
];

/** body(--foreground 베이지) 상속 차단용 공통 입력 스타일 */
const fieldClass =
  "rounded border border-slate-300 bg-white px-1.5 py-1 text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-white disabled:text-slate-900 disabled:opacity-100";

function formatWon(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}${Math.abs(rounded).toLocaleString("ko-KR")}원`;
}

function refreshQuantityDisplay(row: LxImportPreviewRow): string {
  if (row.category === "프로모션할인") return "-";
  if (row.quantity == null) return "-";
  if (row.category === "창호제품" || row.unit === "SET") {
    return formatQuantitySetDisplay(row.quantity);
  }
  const n = Math.round(row.quantity * 1000) / 1000;
  const q = Number.isInteger(n)
    ? String(n)
    : String(n)
        .replace(/(\.\d*?[1-9])0+$/, "$1")
        .replace(/\.0+$/, "");
  return row.unit ? `${q} ${row.unit}` : q;
}

function recomputeRowStatus(row: LxImportPreviewRow): LxImportPreviewRow {
  const reasons = [...row.statusReasons].filter(
    (r) =>
      !r.includes("수량") &&
      !r.includes("금액") &&
      !r.includes("단위를 확인"),
  );
  let status: LxImportRowStatus =
    row.status === "error" && reasons.length ? "error" : "ok";

  if (row.kind !== "detail") {
    status = row.status === "error" ? "error" : row.status;
  } else if (
    row.includeInSum !== false &&
    row.amount == null &&
    row.category !== "프로모션할인"
  ) {
    status = "error";
    reasons.push("금액을 읽지 못했습니다.");
  }
  if (
    row.kind === "detail" &&
    row.category === "창호제품" &&
    row.includeInSum !== false &&
    (row.quantity == null || !Number.isFinite(row.quantity))
  ) {
    status = status === "error" ? "error" : "warn";
    reasons.push("수량이 비어 있거나 숫자가 아닙니다. 반영 전 확인해 주세요.");
  }

  const keepErrors = row.statusReasons.filter(
    (r) => r.includes("연결") || r.includes("수량이 달라") || r.includes("유리"),
  );
  for (const e of keepErrors) {
    if (!reasons.includes(e)) reasons.push(e);
    status = "error";
  }

  const fixFields: string[] = [];
  for (const reason of reasons) {
    if (reason.includes("금액")) fixFields.push("금액");
    if (reason.includes("수량")) fixFields.push("수량");
    if (reason.includes("단위")) fixFields.push("단위");
    if (reason.includes("연결") || reason.includes("유리")) {
      fixFields.push("유리 사양", "분류");
    }
    if (reason.includes("분류")) fixFields.push("분류");
  }

  const selectable =
    row.kind === "detail" && status !== "error" && row.includeInSum !== false;
  const wasError = row.status === "error";

  return {
    ...row,
    status,
    statusReasons: reasons,
    fixFields: [...new Set(fixFields.length ? fixFields : row.fixFields)],
    quantityDisplay: refreshQuantityDisplay(row),
    selectable,
    selected: selectable ? (wasError ? true : row.selected) : false,
  };
}

export default function LxWindowExcelImportModal({
  open,
  onClose,
  createRow,
  onApply,
  initialSourceUrl = null,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const firstErrorRef = useRef<HTMLTableRowElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<LxImportParseResult | null>(null);
  const [recognition, setRecognition] = useState<TemplateRecognition | null>(null);
  const [rows, setRows] = useState<LxImportPreviewRow[]>([]);

  const inputsLocked = parsing || applying;

  const breakdown = useMemo(() => sumLxImportRows(rows), [rows]);

  const problemRows = useMemo(
    () => rows.filter((r) => r.status === "error" || r.status === "warn"),
    [rows],
  );
  const errorRows = useMemo(
    () => rows.filter((r) => r.status === "error"),
    [rows],
  );

  const original = result?.header.finalAmount ?? null;
  const diff =
    original != null && Number.isFinite(original)
      ? breakdown.net - original
      : null;

  async function loadBuffer(buffer: ArrayBuffer, name: string) {
    setParsing(true);
    setParseError(null);
    try {
      const recognized = recognizeQuoteWorkbook(buffer);
      const parsed = lxWindowAdapter.parse(buffer);
      setRecognition(recognized);
      setResult(parsed);
      setRows(
        parsed.rows.map((r) =>
          recomputeRowStatus({
            ...r,
            excelRow: r.excelRow ?? null,
            sourceLabel: r.sourceLabel ?? r.product,
            fixFields: r.fixFields ?? [],
            includeInSum: r.includeInSum !== false,
            kind: r.kind ?? "detail",
            selectable: r.selectable !== false,
          }),
        ),
      );
      setFileName(name);
    } catch (e) {
      setParseError(
        e instanceof Error ? e.message : "엑셀을 분석하지 못했습니다.",
      );
    } finally {
      setParsing(false);
    }
  }

  useEffect(() => {
    if (!open || !initialSourceUrl) return;
    let cancelled = false;
    void fetch(initialSourceUrl)
      .then((r) => {
        if (!r.ok) throw new Error("샘플 파일을 불러오지 못했습니다.");
        return r.arrayBuffer();
      })
      .then((buf) => {
        if (cancelled) return;
        return loadBuffer(
          buf,
          initialSourceUrl.split("/").pop() || "sample.xlsx",
        );
      })
      .catch((e) => {
        if (!cancelled) {
          setParseError(e instanceof Error ? e.message : "샘플 로드 실패");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, initialSourceUrl]);

  const applyBlocked = useMemo(() => {
    if (!result) return ["엑셀을 먼저 분석해 주세요."];
    const reasons: string[] = [];

    if (errorRows.length > 0) {
      reasons.push(
        `확인 필요(오류) 행이 ${errorRows.length}개 있습니다. 수정하거나 제외해 주세요.`,
      );
    }
    if (
      rows.some(
        (r) =>
          r.selected &&
          r.includeInSum !== false &&
          r.category === "창호제품" &&
          (r.quantity == null || !Number.isFinite(r.quantity)),
      )
    ) {
      reasons.push("선택된 창호 행의 수량이 숫자가 아닙니다.");
    }
    if (
      rows.some(
        (r) =>
          r.selected &&
          r.includeInSum !== false &&
          r.amount == null &&
          r.category !== "프로모션할인",
      )
    ) {
      reasons.push("선택된 행에 금액이 없습니다.");
    }
    if (original == null) {
      reasons.push("원본 최종금액을 읽지 못해 합계를 검증할 수 없습니다.");
    } else if (original !== breakdown.net) {
      reasons.push(
        `원본 최종금액과 선택 최종합계가 다릅니다. (원본 ${formatWon(original)} / 선택 ${formatWon(breakdown.net)} / 차이 ${formatWon(diff)})`,
      );
    }
    if (!rows.some((r) => r.selected && r.includeInSum !== false)) {
      reasons.push("반영할 행을 선택해 주세요.");
    }
    return reasons;
  }, [result, rows, errorRows.length, original, breakdown.net, diff]);

  if (!open) return null;

  async function onFile(file: File | null) {
    setParseError(null);
    setResult(null);
    setRows([]);
    setFileName(null);
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      setParseError(".xlsx 파일만 업로드할 수 있습니다.");
      return;
    }
    const buffer = await file.arrayBuffer();
    await loadBuffer(buffer, file.name);
  }

  function updateRow(id: string, patch: Partial<LxImportPreviewRow>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        if (patch.category === "창호제품") next.unit = "SET";
        return recomputeRowStatus(next);
      }),
    );
  }

  function handleApply() {
    if (Array.isArray(applyBlocked) && applyBlocked.length > 0) return;
    setApplying(true);
    try {
      const built = buildQuoteLinesFromLxImport(rows);
      const quoteRows = built.lines.map((line) =>
        createRow({
          trade_name: line.trade_name,
          item_name: line.item_name,
          description: line.description,
          remark: line.remark,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unit_price,
          amount: line.amount,
          cost_type: line.cost_type,
          is_lx_material: line.is_lx_material,
          window_item_kind: line.window_item_kind,
          window_location: line.window_location,
          window_extra_remark: line.window_extra_remark,
          isPlaceholder: false,
        }),
      );
      onApply({
        rows: quoteRows,
        promotionDiscount: built.promotionDiscount,
        promotionMemo: built.promotionMemo,
      });
      onClose();
    } finally {
      setApplying(false);
    }
  }

  function scrollToFirstProblem() {
    firstErrorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  const blockList = Array.isArray(applyBlocked) ? applyBlocked : [];
  const canApply = blockList.length === 0 && !!result && !inputsLocked;
  const firstProblemId = problemRows[0]?.id ?? null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white text-slate-900 shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-navy-900">
              LX 본사 엑셀 가져오기
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              업로드 → 변환 미리보기 → 확인 후 견적에 반영합니다. 이 단계에서는
              DB에 저장되지 않습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900"
          >
            닫기
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              disabled={inputsLocked}
              onClick={() => fileRef.current?.click()}
              className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-semibold text-white hover:bg-navy-700 disabled:opacity-75"
            >
              .xlsx 선택
            </button>
            <span className="text-xs text-slate-600">
              {parsing ? "분석 중…" : fileName || "파일 없음"}
            </span>
            {errorRows.length > 0 ? (
              <button
                type="button"
                onClick={scrollToFirstProblem}
                className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100"
              >
                확인하기 (오류 {errorRows.length}건)
              </button>
            ) : null}
          </div>

          {parseError ? (
            <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              {parseError}
            </p>
          ) : null}

          {result ? (
            <>
              {recognition ? (
                <div className={`rounded-lg border px-3 py-2 text-sm ${recognition.confidence < 70 ? "border-amber-300 bg-amber-50 text-amber-950" : "border-sky-200 bg-sky-50 text-slate-900"}`}>
                  <b>{recognition.label} · 신뢰도 {recognition.confidence}%</b>
                  {recognition.confidence < 70 ? <p className="mt-1 text-amber-900">양식 인식 신뢰도가 낮습니다. 변환 결과를 직접 확인해 주세요.</p> : null}
                </div>
              ) : null}
              <dl className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-slate-600">견적번호</dt>
                  <dd className="font-medium text-slate-900">
                    {result.header.quoteNumber || "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-600">현장명</dt>
                  <dd className="font-medium text-slate-900">
                    {result.header.siteName || "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-600">원본 최종금액</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">
                    {formatWon(original)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-600">선택 최종합계</dt>
                  <dd className="font-semibold tabular-nums text-navy-900">
                    {formatWon(breakdown.net)}
                  </dd>
                </div>
              </dl>

              <dl className="grid gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-slate-600">선택한 창호·유리 합계</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">
                    {formatWon(breakdown.windowGlass)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-600">부가시공비</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">
                    {formatWon(breakdown.extras)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-600">표준시공비</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">
                    {formatWon(breakdown.labor)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-600">프로모션 할인</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">
                    {breakdown.promo > 0
                      ? `-${Math.abs(breakdown.promo).toLocaleString("ko-KR")}원`
                      : formatWon(0)}
                  </dd>
                </div>
                {breakdown.materials > 0 ? (
                  <div>
                    <dt className="text-slate-600">추가 부자재</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">
                      {formatWon(breakdown.materials)}
                    </dd>
                  </div>
                ) : null}
                {breakdown.other > 0 ? (
                  <div>
                    <dt className="text-slate-600">기타(선택)</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">
                      {formatWon(breakdown.other)}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-slate-600">선택 최종합계</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">
                    {formatWon(breakdown.net)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-600">원본 최종금액</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">
                    {formatWon(original)}
                  </dd>
                </div>
                <div className="sm:col-span-2 lg:col-span-2">
                  <dt className="text-slate-600">차이 금액</dt>
                  <dd
                    className={`font-semibold tabular-nums ${
                      diff === 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {formatWon(diff)}
                    {diff === 0 ? " (일치)" : null}
                  </dd>
                </div>
              </dl>

              {result.warnings.length > 0 ? (
                <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  {result.warnings.map((w) => (
                    <li key={w}>· {w}</li>
                  ))}
                </ul>
              ) : null}

              {blockList.length > 0 ? (
                <ul className="space-y-1 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
                  {blockList.map((w) => (
                    <li key={w}>· {w}</li>
                  ))}
                </ul>
              ) : null}

              {problemRows.length > 0 ? (
                <div className="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-xs text-slate-900">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-red-800">
                      확인 필요 행 {problemRows.length}개 (오류{" "}
                      {errorRows.length} / 경고{" "}
                      {problemRows.length - errorRows.length})
                    </p>
                    <button
                      type="button"
                      onClick={scrollToFirstProblem}
                      className="rounded border border-red-300 bg-white px-2.5 py-1 font-semibold text-red-800"
                    >
                      확인하기
                    </button>
                  </div>
                  <ul className="space-y-1">
                    {problemRows.slice(0, 8).map((r) => (
                      <li key={r.id} className="text-slate-900">
                        · 엑셀 {r.excelRow != null ? `${r.excelRow}행` : "-"} /{" "}
                        {r.sourceLabel || r.product || "(품명 없음)"} —{" "}
                        {r.statusReasons[0] || "확인 필요"}
                        {r.fixFields.length
                          ? ` (수정: ${r.fixFields.join(", ")})`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="overflow-x-auto rounded-lg border border-slate-300">
                <table className="min-w-[1200px] w-full text-left text-xs text-slate-900">
                  <thead className="bg-slate-100 text-slate-900">
                    <tr>
                      <th className="px-2 py-2">선택</th>
                      <th className="px-2 py-2">위치</th>
                      <th className="px-2 py-2">제품</th>
                      <th className="px-2 py-2">규격</th>
                      <th className="px-2 py-2">유리 사양</th>
                      <th className="px-2 py-2">수량</th>
                      <th className="px-2 py-2">방충망</th>
                      <th className="px-2 py-2">분류</th>
                      <th className="px-2 py-2 text-right">금액</th>
                      <th className="px-2 py-2">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const isFirstProblem = row.id === firstProblemId;
                      return (
                        <tr
                          key={row.id}
                          ref={isFirstProblem ? firstErrorRef : undefined}
                          className={`border-t border-slate-200 ${
                            row.status === "error"
                              ? "border-l-4 border-l-red-500 bg-red-50"
                              : row.status === "warn"
                                ? "border-l-4 border-l-amber-400 bg-amber-50"
                                : "bg-white"
                          }`}
                        >
                          <td className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              disabled={
                                inputsLocked || row.selectable === false
                              }
                              onChange={(e) =>
                                updateRow(row.id, {
                                  selected: e.target.checked,
                                })
                              }
                              className="disabled:opacity-100"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={row.location}
                              disabled={inputsLocked}
                              placeholder="위치"
                              onChange={(e) =>
                                updateRow(row.id, {
                                  location: e.target.value,
                                })
                              }
                              className={`w-28 ${fieldClass}`}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={row.product}
                              disabled={inputsLocked}
                              placeholder="제품"
                              onChange={(e) =>
                                updateRow(row.id, { product: e.target.value })
                              }
                              className={`w-36 ${fieldClass}`}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={row.spec}
                              disabled={inputsLocked}
                              placeholder="규격"
                              onChange={(e) =>
                                updateRow(row.id, { spec: e.target.value })
                              }
                              className={`w-28 ${fieldClass}`}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={row.glassSpec}
                              disabled={inputsLocked}
                              placeholder="유리 사양"
                              onChange={(e) =>
                                updateRow(row.id, {
                                  glassSpec: e.target.value,
                                })
                              }
                              className={`w-36 ${fieldClass}`}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex flex-col gap-0.5">
                              <input
                                value={
                                  row.quantity == null
                                    ? ""
                                    : String(row.quantity)
                                }
                                disabled={inputsLocked}
                                placeholder="수량"
                                onChange={(e) => {
                                  const raw = e.target.value.trim();
                                  if (!raw) {
                                    updateRow(row.id, {
                                      quantity: null,
                                      quantityRaw: "",
                                    });
                                    return;
                                  }
                                  const n = Number(raw.replace(/,/g, ""));
                                  updateRow(row.id, {
                                    quantity: Number.isFinite(n) ? n : null,
                                    quantityRaw: raw,
                                  });
                                }}
                                className={`w-20 tabular-nums ${fieldClass}`}
                                inputMode="decimal"
                              />
                              <span className="text-[10px] text-slate-600">
                                {row.quantityDisplay}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              value={row.mosquitoNet}
                              disabled={inputsLocked}
                              onChange={(e) =>
                                updateRow(row.id, {
                                  mosquitoNet: e.target.value as
                                    | "포함"
                                    | "미포함"
                                    | "",
                                })
                              }
                              className={fieldClass}
                            >
                              <option value="">-</option>
                              <option value="포함">포함</option>
                              <option value="미포함">미포함</option>
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              value={row.category}
                              disabled={inputsLocked}
                              onChange={(e) =>
                                updateRow(row.id, {
                                  category: e.target
                                    .value as LxImportCategory,
                                })
                              }
                              className={fieldClass}
                            >
                              {CATEGORY_OPTIONS.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <input
                              value={
                                row.amount == null ? "" : String(row.amount)
                              }
                              disabled={inputsLocked}
                              placeholder="금액"
                              onChange={(e) => {
                                const raw = e.target.value.trim().replace(/,/g, "");
                                if (!raw) {
                                  updateRow(row.id, { amount: null });
                                  return;
                                }
                                const n = Number(raw);
                                updateRow(row.id, {
                                  amount: Number.isFinite(n)
                                    ? Math.round(n)
                                    : null,
                                });
                              }}
                              className={`w-28 text-right font-semibold tabular-nums ${fieldClass}`}
                              inputMode="numeric"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            {row.status === "ok" ? (
                              <span className="font-medium text-emerald-700">
                                정상
                              </span>
                            ) : (
                              <div className="min-w-[140px] space-y-0.5 rounded border border-red-300 bg-white px-1.5 py-1">
                                <p
                                  className={
                                    row.status === "error"
                                      ? "font-semibold text-red-800"
                                      : "font-semibold text-amber-900"
                                  }
                                >
                                  확인 필요
                                </p>
                                <p className="text-[10px] text-slate-900">
                                  엑셀{" "}
                                  {row.excelRow != null
                                    ? `${row.excelRow}행`
                                    : "-"}
                                </p>
                                <p className="text-[10px] text-slate-900">
                                  {row.sourceLabel || row.product || "-"}
                                </p>
                                {row.statusReasons.map((reason) => (
                                  <p
                                    key={reason}
                                    className="text-[10px] leading-snug text-slate-900"
                                  >
                                    {reason}
                                  </p>
                                ))}
                                {row.fixFields.length > 0 ? (
                                  <p className="text-[10px] font-medium text-red-800">
                                    수정: {row.fixFields.join(", ")}
                                  </p>
                                ) : null}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-600">
              LX 본사 창호견적 .xlsx를 선택하면 변환 미리보기가 표시됩니다.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!canApply}
            onClick={handleApply}
            className="rounded-lg bg-navy-800 px-4 py-2 text-xs font-semibold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:opacity-100 disabled:text-white"
          >
            {applying ? "반영 중…" : "견적에 반영"}
          </button>
        </div>
      </div>
    </div>
  );
}
