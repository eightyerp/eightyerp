"use client";

import { useEffect, useMemo, useState } from "react";
import QuoteDocumentView from "@/components/quotes/QuoteDocumentView";
import LxWindowExcelImportModal from "@/components/quotes/LxWindowExcelImportModal";
import {
  buildQuoteLinesFromLxImport,
  parseLxWindowExcelBuffer,
} from "@/lib/crm/lx-window-excel";
import type { QuoteDocumentModel } from "@/lib/crm/quote-document";
import { buildEightyQuoteBrand } from "@/lib/crm/quote-brand-shared";
import type { QuoteLineRow } from "@/components/quotes/QuoteTradeItemsPanel";

let demoKeySeq = 0;

function demoRow(partial?: Partial<QuoteLineRow>): QuoteLineRow {
  demoKeySeq += 1;
  return {
    key: partial?.key ?? `demo-${demoKeySeq}`,
    id: null,
    trade_name: partial?.trade_name ?? "창호공사",
    item_name: partial?.item_name ?? "",
    description: partial?.description ?? "",
    remark: partial?.remark ?? "",
    quantity: partial?.quantity ?? "",
    unit: partial?.unit ?? "",
    unit_price: partial?.unit_price ?? "0",
    amount: partial?.amount ?? "0",
    cost_type: partial?.cost_type ?? "자재",
    is_lx_material: Boolean(partial?.is_lx_material),
    lx_discount_base_amount: "",
    lx_discount_type: "",
    lx_discount_value: "0",
  };
}

/**
 * 로그인 없이 LX 가져오기 미리보기 + 고객용 창호 표 확인용 데모.
 */
export default function LxWindowDemoPage() {
  const [importOpen, setImportOpen] = useState(true);
  const [items, setItems] = useState<QuoteLineRow[]>([]);
  const [promo, setPromo] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/samples/lx-yeongdeungpo-prugio.xlsx");
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        const parsed = parseLxWindowExcelBuffer(buf);
        const built = buildQuoteLinesFromLxImport(
          parsed.rows.map((r) => ({
            ...r,
            selected: Boolean(r.selected && r.status !== "error"),
          })),
        );
        if (cancelled) return;
        setItems(built.lines.map((line) => demoRow(line)));
        setPromo(built.promotionDiscount);
        setReady(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const model: QuoteDocumentModel = useMemo(
    () => ({
      customerName: "샘플 고객",
      title: "당산 샘플 아파트 창호 견적",
      quoteType: "창호",
      quoteMode: "detailed",
      quoteNumber: "DEMO-LX-001",
      discountAmount: promo,
      specialDiscountMemo: promo > 0 ? "LX 프로모션 할인" : null,
      lxDiscountRate: 0,
      vatMode: "inclusive",
      vatRate: 10,
      brand: buildEightyQuoteBrand("주식회사 에잇티"),
      showCover: true,
      items: items.map((row, index) => ({
        trade_name: row.trade_name,
        item_name: row.item_name,
        description: row.description,
        remark: row.remark,
        quantity: row.quantity === "" ? null : Number(row.quantity),
        unit: row.unit,
        unit_price: Number(row.unit_price) || 0,
        amount: Number(row.amount) || 0,
        cost_type: row.cost_type,
        is_lx_material: row.is_lx_material,
        sort_order: index,
      })),
    }),
    [items, promo],
  );

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <h1 className="text-lg font-bold text-navy-900">
            LX 창호 엑셀 가져오기 · 고객 표 데모
          </h1>
          <p className="mt-1 text-xs text-slate-600">
            샘플 파일로 변환 미리보기와 고객용 창호 표(1 SET)를 확인합니다. DB
            저장 없음.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-semibold text-white"
            >
              변환 미리보기 열기
            </button>
            <a
              href="/samples/lx-yeongdeungpo-prugio.xlsx"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800"
            >
              영등포푸르지오 샘플 xlsx
            </a>
            <span className="self-center text-xs text-slate-500">
              {ready ? `항목 ${items.length}건 · 프로모션 ${promo.toLocaleString("ko-KR")}원` : "샘플 로딩…"}
            </span>
          </div>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <p className="px-2 py-1 text-xs font-semibold text-slate-600">
            고객용 창호견적서 미리보기
          </p>
          <QuoteDocumentView model={model} variant="print" />
        </section>
      </div>

      <LxWindowExcelImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        createRow={demoRow}
        initialSourceUrl="/samples/lx-window-sample.xlsx"
        onApply={({ rows, promotionDiscount }) => {
          setItems(rows);
          setPromo(promotionDiscount);
        }}
      />
    </main>
  );
}
