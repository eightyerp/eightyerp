"use client";

import { useCallback, useMemo, useState } from "react";
import QuoteCoverPage from "@/components/quotes/QuoteCoverPage";
import QuotePrintBodyPager, {
  type QuotePrintBodyBlock,
} from "@/components/quotes/QuotePrintBodyPager";
import { QuotePageFooter } from "@/components/quotes/QuotePrintPages";
import {
  buildQuoteDocumentViewModel,
  formatQuoteQuantityDisplay,
  formatSpecialDiscountLabel,
  type QuoteDocumentLine,
  type QuoteDocumentModel,
} from "@/lib/crm/quote-document";
import { quoteCostTypeLabel } from "@/lib/crm/quote-constants";
import { buildSimpleQuoteBrand } from "@/lib/crm/quote-brand-shared";
import {
  formatQuantitySetDisplay,
  isLxWindowProductLine,
  parseLxWindowRemark,
  stripLxWindowRemarkBlock,
} from "@/lib/crm/lx-window-meta";
import { LX_WINDOW_TRADE_NAME } from "@/lib/crm/lx-window-excel";

type Props = {
  model: QuoteDocumentModel;
  /** mobile: 고객 공유형 좁은 레이아웃, print: A4 인쇄 */
  variant?: "mobile" | "print";
  className?: string;
};

function formatMoney(value: number): string {
  return `${Math.max(0, Math.round(value)).toLocaleString("ko-KR")}원`;
}

function formatUnitPriceDisplay(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return formatMoney(Number(value));
}

function formatSpecDisplay(description?: string | null): string {
  const text = String(description ?? "").trim();
  return text || "-";
}

function DetailColgroup() {
  return (
    <colgroup>
      <col style={{ width: "32%" }} />
      <col style={{ width: "18%" }} />
      <col style={{ width: "8%" }} />
      <col style={{ width: "8%" }} />
      <col style={{ width: "16%" }} />
      <col style={{ width: "18%" }} />
    </colgroup>
  );
}

function DetailThead({ isPrint }: { isPrint: boolean }) {
  const th = isPrint
    ? "px-1.5 py-1.5 text-[10px] font-semibold text-slate-600"
    : "px-2 py-2 text-xs font-semibold text-slate-600";
  return (
    <thead className="quote-detail-lines-thead">
      <tr className="border-b border-slate-200 bg-slate-50">
        <th scope="col" className={`${th} text-left`}>
          항목
        </th>
        <th scope="col" className={`${th} text-left`}>
          규격
        </th>
        <th scope="col" className={`${th} text-right`}>
          수량
        </th>
        <th scope="col" className={`${th} text-center`}>
          단위
        </th>
        <th scope="col" className={`${th} text-right`}>
          단가
        </th>
        <th scope="col" className={`${th} text-right`}>
          금액
        </th>
      </tr>
    </thead>
  );
}

function LineItemBadges({
  line,
  isPrint,
}: {
  line: QuoteDocumentLine;
  isPrint: boolean;
}) {
  const costLabel = quoteCostTypeLabel(line.cost_type);
  return (
    <div
      className={`mt-0.5 flex flex-wrap items-center gap-1 ${
        isPrint ? "text-[10px]" : "text-[11px]"
      }`}
    >
      {costLabel ? (
        <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 ring-1 ring-slate-200">
          {costLabel}
        </span>
      ) : null}
      {line.is_lx_material ? (
        <span className="inline-flex rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900 ring-1 ring-amber-300">
          LX 자재
        </span>
      ) : null}
    </div>
  );
}

/** 인쇄·미리보기용 6열 표 (항목 그룹 = 본문+비고+LX) */
function LineTable({
  line,
  isPrint,
  includeHeader = false,
}: {
  line: QuoteDocumentLine;
  isPrint: boolean;
  includeHeader?: boolean;
}) {
  const cell = isPrint ? "px-1.5 py-1.5 align-top text-[11px]" : "px-2 py-2 align-top text-sm";
  const remark = stripLxWindowRemarkBlock(line.remark ?? "").trim();
  const showLxBreakdown = line.lxDiscount > 0;
  const meta = parseLxWindowRemark(line.remark);
  const itemTitle = meta?.location
    ? `${line.lineTitle}`
    : line.lineTitle;

  return (
    <table className="quote-detail-lines-table w-full table-fixed border-collapse">
      <DetailColgroup />
      {includeHeader ? <DetailThead isPrint={isPrint} /> : null}
      <tbody className="quote-detail-line-group">
        <tr className="quote-detail-main-row border-b border-slate-100">
          <td className={`${cell} text-left text-slate-900`}>
            <p className="break-words font-semibold leading-snug">
              {itemTitle}
            </p>
            {meta?.location ? (
              <p
                className={`mt-0.5 text-slate-500 ${
                  isPrint ? "text-[10px]" : "text-[11px]"
                }`}
              >
                위치 {meta.location}
              </p>
            ) : null}
            <LineItemBadges line={line} isPrint={isPrint} />
          </td>
          <td className={`${cell} break-words text-left text-slate-700`}>
            {formatSpecDisplay(line.description)}
          </td>
          <td className={`${cell} whitespace-nowrap text-right tabular-nums text-slate-800`}>
            {formatQuoteQuantityDisplay(line.quantity)}
          </td>
          <td className={`${cell} whitespace-nowrap text-center text-slate-700`}>
            {line.unitLabel || "-"}
          </td>
          <td className={`${cell} whitespace-nowrap text-right tabular-nums text-slate-800`}>
            {formatUnitPriceDisplay(line.unit_price)}
          </td>
          <td
            className={`${cell} whitespace-nowrap text-right font-bold tabular-nums text-slate-900`}
          >
            {formatMoney(line.netAmount)}
          </td>
        </tr>
        {remark ? (
          <tr className="quote-detail-meta-row border-b border-slate-100">
            <td
              colSpan={6}
              className={`${cell} whitespace-pre-wrap break-words text-slate-600 ${
                isPrint ? "text-[10px]" : "text-xs"
              }`}
            >
              <span className="font-medium text-slate-500">비고 </span>
              {remark}
            </td>
          </tr>
        ) : null}
        {showLxBreakdown ? (
          <tr className="quote-detail-meta-row border-b border-slate-100">
            <td
              colSpan={6}
              className={`${cell} text-slate-600 ${
                isPrint ? "text-[10px]" : "text-xs"
              }`}
            >
              정상 {formatMoney(line.listAmount)} · LX 할인 -
              {formatMoney(line.lxDiscount)} · 할인 후{" "}
              {formatMoney(line.netAmount)}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

/** 고객용 창호 표 (위치|제품|규격|유리|수량 1 SET|방충망|금액) */
function WindowProductTable({
  lines,
  isPrint,
  includeHeader = true,
}: {
  lines: QuoteDocumentLine[];
  isPrint: boolean;
  includeHeader?: boolean;
}) {
  const th = isPrint
    ? "px-1.5 py-1.5 text-[10px] font-semibold text-slate-600"
    : "px-2 py-2 text-xs font-semibold text-slate-600";
  const cell = isPrint
    ? "px-1.5 py-1.5 align-top text-[11px]"
    : "px-2 py-2 align-top text-sm";

  return (
    <table className="quote-detail-lines-table quote-window-product-table w-full table-fixed border-collapse">
      <colgroup>
        <col style={{ width: "16%" }} />
        <col style={{ width: "22%" }} />
        <col style={{ width: "14%" }} />
        <col style={{ width: "18%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "8%" }} />
        <col style={{ width: "12%" }} />
      </colgroup>
      {includeHeader ? (
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th scope="col" className={`${th} text-left`}>
              위치
            </th>
            <th scope="col" className={`${th} text-left`}>
              제품
            </th>
            <th scope="col" className={`${th} text-left`}>
              규격
            </th>
            <th scope="col" className={`${th} text-left`}>
              유리 사양
            </th>
            <th scope="col" className={`${th} text-right`}>
              수량
            </th>
            <th scope="col" className={`${th} text-center`}>
              방충망
            </th>
            <th scope="col" className={`${th} text-right`}>
              금액
            </th>
          </tr>
        </thead>
      ) : null}
      {lines.map((line, idx) => {
        const meta = parseLxWindowRemark(line.remark);
        return (
          <tbody key={`win-${idx}`} className="quote-detail-line-group">
            <tr className="border-b border-slate-100">
              <td className={`${cell} break-words text-left text-slate-800`}>
                {meta?.location || "-"}
              </td>
              <td className={`${cell} break-words text-left font-semibold text-slate-900`}>
                {line.lineTitle}
              </td>
              <td className={`${cell} break-words text-left text-slate-700`}>
                {formatSpecDisplay(line.description)}
              </td>
              <td className={`${cell} break-words text-left text-slate-700`}>
                {meta?.glassSpec || "-"}
              </td>
              <td className={`${cell} whitespace-nowrap text-right tabular-nums font-medium text-slate-900`}>
                {formatQuantitySetDisplay(line.quantity)}
              </td>
              <td className={`${cell} whitespace-nowrap text-center text-slate-700`}>
                {meta?.mosquitoNet || "-"}
              </td>
              <td className={`${cell} whitespace-nowrap text-right font-bold tabular-nums text-slate-900`}>
                {formatMoney(line.netAmount)}
              </td>
            </tr>
          </tbody>
        );
      })}
    </table>
  );
}

function WindowProductCard({ line }: { line: QuoteDocumentLine }) {
  const meta = parseLxWindowRemark(line.remark);
  return (
    <article className="quote-detail-line-card rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">{line.lineTitle}</p>
          {meta?.location ? (
            <p className="mt-0.5 text-xs text-slate-500">위치 {meta.location}</p>
          ) : null}
        </div>
        <p className="shrink-0 text-sm font-bold tabular-nums text-navy-900">
          {formatMoney(line.netAmount)}
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700">
        <div>
          <dt className="text-[11px] text-slate-500">규격</dt>
          <dd className="mt-0.5 font-medium">
            {formatSpecDisplay(line.description)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-500">수량</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {formatQuantitySetDisplay(line.quantity)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-500">유리 사양</dt>
          <dd className="mt-0.5 font-medium">{meta?.glassSpec || "-"}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-500">방충망</dt>
          <dd className="mt-0.5 font-medium">{meta?.mosquitoNet || "-"}</dd>
        </div>
      </dl>
    </article>
  );
}

/** 모바일 고객 화면용 카드 */
function LineCard({ line }: { line: QuoteDocumentLine }) {
  const remark = stripLxWindowRemarkBlock(line.remark ?? "").trim();
  const showLxBreakdown = line.lxDiscount > 0;
  const isSet = String(line.unit ?? "").trim().toUpperCase() === "SET";

  return (
    <article className="quote-detail-line-card rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-snug text-slate-900">
            {line.lineTitle}
          </p>
          <LineItemBadges line={line} isPrint={false} />
        </div>
        <p className="shrink-0 text-sm font-bold tabular-nums text-navy-900">
          {formatMoney(line.netAmount)}
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-slate-700 sm:grid-cols-4">
        <div>
          <dt className="text-[11px] text-slate-500" data-label="규격">
            규격
          </dt>
          <dd className="mt-0.5 break-words font-medium">
            {formatSpecDisplay(line.description)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-500" data-label="수량">
            수량
          </dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {isSet
              ? formatQuantitySetDisplay(line.quantity)
              : formatQuoteQuantityDisplay(line.quantity)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-500" data-label="단위">
            단위
          </dt>
          <dd className="mt-0.5 font-medium">
            {isSet ? "SET" : line.unitLabel || "-"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-500" data-label="단가">
            단가
          </dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {formatUnitPriceDisplay(line.unit_price)}
          </dd>
        </div>
      </dl>
      {remark ? (
        <p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-600">
          <span className="font-medium text-slate-500">비고 </span>
          {remark}
        </p>
      ) : null}
      {showLxBreakdown ? (
        <p className="mt-2 text-xs text-slate-600">
          정상 {formatMoney(line.listAmount)} · LX 할인 -
          {formatMoney(line.lxDiscount)} · 할인 후{" "}
          {formatMoney(line.netAmount)}
        </p>
      ) : null}
    </article>
  );
}

function TradeColumnHeader({ isPrint }: { isPrint: boolean }) {
  return (
    <table className="quote-detail-lines-table quote-detail-lines-header-only w-full table-fixed border-collapse">
      <DetailColgroup />
      <DetailThead isPrint={isPrint} />
    </table>
  );
}

export default function QuoteDocumentView({
  model,
  variant = "mobile",
  className = "",
}: Props) {
  const view = buildQuoteDocumentViewModel(model);
  const showCover = model.showCover !== false;
  const brand = model.brand ?? buildSimpleQuoteBrand(null);
  const isPrint = variant === "print";
  const [bodyPageCount, setBodyPageCount] = useState(1);
  const onBodyPageCountChange = useCallback((count: number) => {
    setBodyPageCount(Math.max(1, count));
  }, []);

  const cover = (
    <QuoteCoverPage
      brand={brand}
      customerName={model.customerName}
      title={model.title}
      quoteNumber={model.isDraft ? null : model.quoteNumber}
      quoteNumberLabel={model.isDraft ? "저장 전 (미발급)" : null}
      issuedAt={model.issuedAt}
      variant={variant}
      quoteType={model.quoteType}
      amountSummary={{
        totalAmount: view.totals.items_net_total,
        discountAmount: view.totals.discount_amount,
        specialDiscountMemo: view.totals.special_discount_memo,
        lxDiscountAmount: view.totals.lx_discount_amount,
        supplyAmount: view.totals.supply_amount,
        vatAmount: view.totals.vat_amount,
        vatRate: view.totals.vat_rate,
        vatMode: view.totals.vat_mode,
        customerTotalAmount: view.totals.customer_total_amount,
      }}
      contact={{
        assigneeName: model.assigneeName,
        assigneeTitle: model.assigneeTitle,
        assigneePhone: model.assigneePhone,
        assigneeEmail: model.assigneeEmail,
        assigneeShowBusinessCard: model.assigneeShowBusinessCard,
        assigneeCardImageUrl: model.assigneeCardImageUrl,
      }}
    />
  );

  const printBlocks: QuotePrintBodyBlock[] = useMemo(() => {
    if (!isPrint) return [];
    const blocks: QuotePrintBodyBlock[] = [];

    blocks.push({
      key: "header",
      node: (
        <section className="quote-body-section space-y-4 text-[12px] text-slate-800">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] text-slate-500">고객</p>
              <h1 className="mt-1 text-[16px] font-bold text-navy-900">
                {model.customerName || "고객"}
              </h1>
              <p className="mt-1 text-[13px] font-semibold text-slate-900">
                {model.title}
              </p>
              <p className="mt-1 text-[11px] text-slate-600">
                {[
                  model.quoteType,
                  model.isDraft
                    ? "번호 저장 전"
                    : model.quoteNumber
                      ? `번호 ${model.quoteNumber}`
                      : null,
                  model.versionNumber != null
                    ? `V${model.versionNumber}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-[11px] text-slate-500">고객 최종금액</dt>
              <dd className="mt-0.5 text-lg font-semibold text-navy-900">
                {formatMoney(view.totals.customer_total_amount)}
              </dd>
              <dd className="mt-1 text-[11px] text-slate-600">
                총 {formatMoney(view.totals.total_amount)}
                {view.totals.discount_amount > 0
                  ? ` · ${formatSpecialDiscountLabel(view.totals.special_discount_memo)} -${formatMoney(view.totals.discount_amount)}`
                  : ""}
                {view.totals.lx_discount_amount > 0
                  ? ` · LX할인 -${formatMoney(view.totals.lx_discount_amount)}`
                  : ""}
              </dd>
              <dd className="mt-1 text-[11px] text-slate-600">
                공급가액 {formatMoney(view.totals.supply_amount)} · 부가세
                {view.totals.vat_rate != null
                  ? ` ${view.totals.vat_rate}%`
                  : ""}{" "}
                {formatMoney(view.totals.vat_amount)}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-[11px] text-slate-500">유효기간</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-800">
                {model.validUntil || "-"}
              </dd>
            </div>
          </dl>
          {model.customerMessage ? (
            <div className="mt-4 rounded-lg border border-gold-200 bg-gold-50/60 px-3 py-3 text-sm whitespace-pre-wrap text-navy-900">
              {model.customerMessage}
            </div>
          ) : null}
        </section>
      ),
    });

    if (view.groups.length > 0) {
      blocks.push({
        key: "summary",
        node: (
          <section className="space-y-4">
            <h2 className="text-[13px] font-semibold text-slate-900">
              공종별 합계표
            </h2>
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 text-[11px]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="px-3 py-2 font-medium">공종</th>
                    <th className="px-3 py-2 text-right font-medium">소계</th>
                    <th className="px-3 py-2 text-right font-medium">LX 할인</th>
                    <th className="px-3 py-2 text-right font-medium">할인 후</th>
                  </tr>
                </thead>
                <tbody>
                  {view.groups.map((group) => {
                    const listSum = group.lines.reduce(
                      (s, line) => s + line.listAmount,
                      0,
                    );
                    return (
                      <tr
                        key={`summary-${group.tradeLabel}`}
                        className="border-b border-slate-100"
                      >
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {group.tradeLabel}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                          {formatMoney(listSum)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {group.lxDiscount > 0
                            ? `-${formatMoney(group.lxDiscount)}`
                            : "-"}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                          {formatMoney(group.subtotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ),
      });

      blocks.push({
        key: "doc-title",
        role: "doc-title",
        node: (
          <h2 className="text-[13px] font-semibold text-slate-900">
            {view.documentTitle}
          </h2>
        ),
        keepWithNext: true,
      });

      for (const group of view.groups) {
        const isWindowTrade =
          model.quoteType === "창호" &&
          group.tradeLabel === LX_WINDOW_TRADE_NAME;
        const windowLines = isWindowTrade
          ? group.lines.filter((line) => isLxWindowProductLine(line))
          : [];
        const otherLines = isWindowTrade
          ? group.lines.filter((line) => !isLxWindowProductLine(line))
          : group.lines;

        blocks.push({
          key: `group-title-${group.tradeLabel}`,
          role: "group-title",
          groupLabel: group.tradeLabel,
          node: (
            <div className="space-y-1.5">
              <div className="quote-print-group-title flex items-center justify-between border-b border-slate-200 pb-2">
                <h3 className="text-[12px] font-bold text-navy-900">
                  {group.tradeLabel}
                </h3>
                <p className="text-[12px] font-semibold tabular-nums text-slate-800">
                  소계 {formatMoney(group.subtotal)}
                </p>
              </div>
              {windowLines.length > 0 ? (
                <WindowProductTable lines={[]} isPrint includeHeader />
              ) : (
                <TradeColumnHeader isPrint />
              )}
            </div>
          ),
          keepWithNext: true,
        });

        windowLines.forEach((line, idx) => {
          blocks.push({
            key: `win-${group.tradeLabel}-${idx}`,
            role: "line",
            groupLabel: group.tradeLabel,
            node: (
              <WindowProductTable
                lines={[line]}
                isPrint
                includeHeader={false}
              />
            ),
          });
        });

        if (otherLines.length > 0 && windowLines.length > 0) {
          blocks.push({
            key: `group-other-header-${group.tradeLabel}`,
            role: "line",
            groupLabel: group.tradeLabel,
            node: <TradeColumnHeader isPrint />,
            keepWithNext: true,
          });
        }

        otherLines.forEach((line, idx) => {
          blocks.push({
            key: `line-${group.tradeLabel}-${idx}`,
            role: "line",
            groupLabel: group.tradeLabel,
            node: <LineTable line={line} isPrint />,
          });
        });
      }

      blocks.push({
        key: "totals",
        role: "totals",
        node: (
          <div className="quote-print-totals space-y-1 border-t border-slate-200 pt-4 text-[12px]">
            {view.totals.lx_discount_amount > 0 ? (
              <div className="flex justify-between text-slate-700">
                <span>항목 정가 합계</span>
                <span>{formatMoney(view.totals.total_amount)}</span>
              </div>
            ) : null}
            {view.totals.lx_discount_amount > 0 ? (
              <div className="flex justify-between text-slate-700">
                <span>LX 할인 총액</span>
                <span>-{formatMoney(view.totals.lx_discount_amount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-slate-700">
              <span>견적 합계</span>
              <span>{formatMoney(view.totals.items_net_total)}</span>
            </div>
            {view.totals.discount_amount > 0 ? (
              <div className="flex items-start justify-between gap-3 text-slate-700">
                <span
                  className="min-w-0 flex-1 truncate"
                  title={formatSpecialDiscountLabel(
                    view.totals.special_discount_memo,
                  )}
                >
                  {formatSpecialDiscountLabel(view.totals.special_discount_memo)}
                </span>
                <span className="shrink-0 tabular-nums">
                  -{formatMoney(view.totals.discount_amount)}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between text-slate-700">
              <span>공급가액</span>
              <span className="tabular-nums">
                {formatMoney(view.totals.supply_amount)}
              </span>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>
                부가세
                {view.totals.vat_rate != null
                  ? ` (${view.totals.vat_rate}%)`
                  : ""}
              </span>
              <span className="tabular-nums">
                {formatMoney(view.totals.vat_amount)}
              </span>
            </div>
            <div className="flex justify-between pt-2 text-[13px] font-bold text-navy-900">
              <span>고객 최종금액</span>
              <span className="tabular-nums">
                {formatMoney(view.totals.customer_total_amount)}
              </span>
            </div>
          </div>
        ),
      });
    }

    return blocks;
  }, [isPrint, model, view]);

  function renderMobileBody() {
    return (
      <>
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">고객</p>
              <h1 className="mt-1 text-xl font-bold text-navy-900">
                {model.customerName || "고객"}
              </h1>
              <p className="mt-2 text-base font-semibold text-slate-900">
                {model.title}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {[
                  model.quoteType,
                  model.isDraft
                    ? "번호 저장 전"
                    : model.quoteNumber
                      ? `번호 ${model.quoteNumber}`
                      : null,
                  model.versionNumber != null
                    ? `V${model.versionNumber}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-[11px] text-slate-500">고객 최종금액</dt>
              <dd className="mt-0.5 text-lg font-semibold text-navy-900">
                {formatMoney(view.totals.customer_total_amount)}
              </dd>
              <dd className="mt-1 text-[11px] text-slate-600">
                총 {formatMoney(view.totals.total_amount)}
                {view.totals.discount_amount > 0
                  ? ` · ${formatSpecialDiscountLabel(view.totals.special_discount_memo)} -${formatMoney(view.totals.discount_amount)}`
                  : ""}
                {view.totals.lx_discount_amount > 0
                  ? ` · LX할인 -${formatMoney(view.totals.lx_discount_amount)}`
                  : ""}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-[11px] text-slate-500">유효기간</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-800">
                {model.validUntil || "-"}
              </dd>
            </div>
          </dl>
          {model.customerMessage ? (
            <div className="mt-4 rounded-lg border border-gold-200 bg-gold-50/60 px-3 py-3 text-sm whitespace-pre-wrap text-navy-900">
              {model.customerMessage}
            </div>
          ) : null}
        </section>

        {view.groups.length > 0 ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              공종별 합계표
            </h2>
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 text-sm">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="px-3 py-2 font-medium">공종</th>
                    <th className="px-3 py-2 text-right font-medium">소계</th>
                    <th className="px-3 py-2 text-right font-medium">LX 할인</th>
                    <th className="px-3 py-2 text-right font-medium">할인 후</th>
                  </tr>
                </thead>
                <tbody>
                  {view.groups.map((group) => {
                    const listSum = group.lines.reduce(
                      (s, line) => s + line.listAmount,
                      0,
                    );
                    return (
                      <tr
                        key={`summary-${group.tradeLabel}`}
                        className="border-b border-slate-100"
                      >
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {group.tradeLabel}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(listSum)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {group.lxDiscount > 0
                            ? `-${formatMoney(group.lxDiscount)}`
                            : "-"}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {formatMoney(group.subtotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {view.groups.length > 0 ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              {view.documentTitle}
            </h2>
            <div className="mt-3 space-y-5">
              {view.groups.map((group) => {
                const isWindowTrade =
                  model.quoteType === "창호" &&
                  group.tradeLabel === LX_WINDOW_TRADE_NAME;
                const windowLines = isWindowTrade
                  ? group.lines.filter((line) => isLxWindowProductLine(line))
                  : [];
                const otherLines = isWindowTrade
                  ? group.lines.filter((line) => !isLxWindowProductLine(line))
                  : group.lines;
                return (
                  <div key={group.tradeLabel}>
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <h3 className="text-sm font-bold text-navy-900">
                        {group.tradeLabel}
                      </h3>
                      <p className="text-sm font-semibold tabular-nums">
                        소계 {formatMoney(group.subtotal)}
                      </p>
                    </div>
                    <div className="quote-detail-mobile-cards mt-3 space-y-3 print:hidden">
                      {windowLines.map((line, idx) => (
                        <WindowProductCard
                          key={`${group.tradeLabel}-wcard-${idx}`}
                          line={line}
                        />
                      ))}
                      {otherLines.map((line, idx) => (
                        <LineCard
                          key={`${group.tradeLabel}-card-${idx}`}
                          line={line}
                        />
                      ))}
                    </div>
                    <div className="quote-detail-print-tables mt-2 hidden print:block">
                      {windowLines.length > 0 ? (
                        <WindowProductTable
                          lines={windowLines}
                          isPrint={false}
                          includeHeader
                        />
                      ) : null}
                      {otherLines.length > 0 ? (
                        <>
                          <TradeColumnHeader isPrint={false} />
                          {otherLines.map((line, idx) => (
                            <LineTable
                              key={`${group.tradeLabel}-table-${idx}`}
                              line={line}
                              isPrint={false}
                            />
                          ))}
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="quote-print-totals mt-5 space-y-1 border-t border-slate-200 pt-4 text-sm">
              <div className="flex justify-between text-slate-700">
                <span>견적 합계</span>
                <span>{formatMoney(view.totals.items_net_total)}</span>
              </div>
              <div className="flex justify-between pt-2 text-base font-bold text-navy-900">
                <span>고객 최종금액</span>
                <span className="tabular-nums">
                  {formatMoney(view.totals.customer_total_amount)}
                </span>
              </div>
            </div>
          </section>
        ) : null}
      </>
    );
  }

  if (isPrint) {
    const totalPageCount = (showCover ? 1 : 0) + bodyPageCount;
    return (
      <div
        className={`quote-print-root bg-white text-slate-900${
          showCover ? " quote-print-has-cover" : ""
        } ${className}`}
      >
        {showCover ? (
          <div className="quote-print-cover-wrap">
            {cover}
            <QuotePageFooter
              pageIndex={0}
              pageCount={totalPageCount}
              quoteNumber={model.isDraft ? null : model.quoteNumber}
            />
          </div>
        ) : null}
        <QuotePrintBodyPager
          blocks={printBlocks}
          pageIndexOffset={showCover ? 1 : 0}
          totalPageCount={totalPageCount}
          quoteNumber={model.isDraft ? null : model.quoteNumber}
          documentTitle={view.documentTitle}
          onBodyPageCountChange={onBodyPageCountChange}
          continuationExtra={
            <TradeColumnHeader isPrint />
          }
        />
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {showCover ? cover : null}
      {renderMobileBody()}
    </div>
  );
}
