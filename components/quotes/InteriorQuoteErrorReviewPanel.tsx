"use client";

import { useMemo, useState } from "react";
import {
  applyInteriorResolution,
  type InteriorDiagnostic,
  type InteriorResolutionDraft,
  type InteriorResolutionKind,
} from "@/lib/crm/interior-quote-diagnostics";
import type { InteriorExcelItem } from "@/lib/crm/interior-quote-excel";

const money = (value: number | null | undefined) =>
  value == null ? "빈 값" : `${Math.round(value).toLocaleString("ko-KR")}원`;

type Props = {
  item: InteriorExcelItem;
  issues: InteriorDiagnostic[];
  tradeSubtotal: number;
  quoteTotal: number;
  onApply: (item: InteriorExcelItem, draft: InteriorResolutionDraft) => void;
  onClose: () => void;
};

export default function InteriorQuoteErrorReviewPanel({
  item,
  issues,
  tradeSubtotal,
  quoteTotal,
  onApply,
  onClose,
}: Props) {
  const [kind, setKind] = useState<InteriorResolutionKind>("keep_calculated");
  const [materialUnitPrice, setMaterialUnitPrice] = useState(item.materialUnitPrice);
  const [laborUnitPrice, setLaborUnitPrice] = useState(item.laborUnitPrice);
  const [allocation, setAllocation] = useState<"material" | "labor">("material");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const draft = useMemo<InteriorResolutionDraft>(
    () => ({ kind, materialUnitPrice, laborUnitPrice, allocation, reason }),
    [allocation, kind, laborUnitPrice, materialUnitPrice, reason],
  );
  const preview = useMemo(() => {
    try {
      return applyInteriorResolution(item, draft);
    } catch {
      return { item, adjustment: undefined };
    }
  }, [draft, item]);
  const nextTradeSubtotal = tradeSubtotal - item.amount + preview.item.amount + (preview.adjustment?.amount ?? 0);
  const nextQuoteTotal = quoteTotal - item.amount + preview.item.amount + (preview.adjustment?.amount ?? 0);
  const adjustmentDifference = (item.excelOriginal.amount ?? item.amount) - item.amount;

  function apply() {
    try {
      applyInteriorResolution(item, draft);
      setError(null);
      onApply(item, draft);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "수정안을 적용할 수 없습니다.");
    }
  }

  return (
    <aside className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-amber-900">오류 진단 및 수정</p>
          <h4 className="mt-1 font-bold">{item.itemName || item.specification}</h4>
          <p className="text-xs text-slate-600">Excel {item.sourceRow}행 · 자동 적용되지 않습니다.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm">닫기</button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {issues.map((issue) => (
          <div key={issue.id} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
            <b>{issue.code}</b>
            <p className="mt-1 text-slate-700">{issue.message}</p>
            <p className="mt-1 text-xs text-slate-600">
              Excel {money(issue.excelAmount)} · ERP {money(issue.erpAmount)} · 차이 {money(issue.difference)}
              {issue.differenceRate == null ? "" : ` (${issue.differenceRate.toFixed(2)}%)`}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <OriginalValueTable item={item} />
        <ValueTable title="변경 전" item={item} />
        <ValueTable title="변경 후" item={preview.item} />
      </div>

      <fieldset className="mt-4 grid gap-2 rounded-lg border border-slate-300 bg-white p-3 text-sm">
        <legend className="px-1 font-bold">추천 수정안 선택</legend>
        {([
          ["excel_amount", "A. Excel 금액 기준 적용"],
          ["keep_calculated", "B. 현재 계산값 유지"],
          ["manual_prices", "C/D. 자재·인건비단가 직접 수정"],
          ["adjustment", "E. 차액 조정항목 생성"],
          ["reference", "F. 참고항목 전환"],
        ] as const).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input type="radio" checked={kind === value} disabled={value === "adjustment" && adjustmentDifference <= 0} onChange={() => setKind(value)} />
            {label}{value === "adjustment" && adjustmentDifference <= 0 ? " (감액은 단가 수정 사용)" : ""}
          </label>
        ))}
      </fieldset>

      {kind === "excel_amount" ? (
        <label className="mt-3 block text-sm font-semibold">
          자재/인건비 구분
          <select value={allocation} onChange={(event) => setAllocation(event.target.value as "material" | "labor")} className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2">
            <option value="material">Excel 금액을 자재비로 적용</option>
            <option value="labor">Excel 금액을 인건비로 적용</option>
          </select>
        </label>
      ) : null}
      {kind === "manual_prices" ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">자재단가<input type="number" min={0} value={materialUnitPrice} onChange={(event) => setMaterialUnitPrice(Number(event.target.value))} className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2" /></label>
          <label className="text-sm font-semibold">인건비단가<input type="number" min={0} value={laborUnitPrice} onChange={(event) => setLaborUnitPrice(Number(event.target.value))} className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2" /></label>
        </div>
      ) : null}
      {kind === "adjustment" ? (
        <label className="mt-3 block text-sm font-semibold">조정사유<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="차액 조정 사유를 입력해 주세요" className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2" /></label>
      ) : null}

      <div className="mt-4 grid gap-2 rounded-lg bg-slate-900 p-3 text-sm text-white sm:grid-cols-2">
        <span>적용 후 공종 소계 <b>{money(nextTradeSubtotal)}</b></span>
        <span>적용 후 전체 합계 <b>{money(nextQuoteTotal)}</b></span>
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={apply} className="rounded-lg bg-amber-800 px-4 py-2 text-sm font-bold text-white">수정 적용</button>
      </div>
    </aside>
  );
}

function OriginalValueTable({ item }: { item: InteriorExcelItem }) {
  const original = item.excelOriginal;
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
      <b>Excel 원본 값</b>
      <dl className="mt-2 grid grid-cols-2 gap-1 text-slate-700">
        <dt>수량</dt><dd className="text-right">{original.quantity ?? "빈 값"}</dd>
        <dt>자재단가</dt><dd className="text-right">{money(original.materialUnitPrice)}</dd>
        <dt>자재금액</dt><dd className="text-right">{money(original.materialAmount)}</dd>
        <dt>인건비단가</dt><dd className="text-right">{money(original.laborUnitPrice)}</dd>
        <dt>인건비금액</dt><dd className="text-right">{money(original.laborAmount)}</dd>
        <dt>행 합계</dt><dd className="text-right font-bold">{money(original.amount)}</dd>
      </dl>
    </div>
  );
}

function ValueTable({ title, item }: { title: string; item: InteriorExcelItem }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <b>{title}</b>
      <dl className="mt-2 grid grid-cols-2 gap-1 text-slate-700">
        <dt>자재단가</dt><dd className="text-right">{money(item.materialUnitPrice)}</dd>
        <dt>인건비단가</dt><dd className="text-right">{money(item.laborUnitPrice)}</dd>
        <dt>합산단가</dt><dd className="text-right">{money(item.unitPrice)}</dd>
        <dt>금액</dt><dd className="text-right font-bold">{money(item.amount)}</dd>
      </dl>
    </div>
  );
}
