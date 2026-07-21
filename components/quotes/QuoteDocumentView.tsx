import QuoteCoverPage from "@/components/quotes/QuoteCoverPage";
import {
  buildQuoteDocumentViewModel,
  type QuoteDocumentModel,
} from "@/lib/crm/quote-document";
import { ERP_QUOTE_STATUS_BADGE, quoteCostTypeLabel } from "@/lib/crm/quote-constants";
import { buildSimpleQuoteBrand } from "@/lib/crm/quote-brand-shared";

type Props = {
  model: QuoteDocumentModel;
  /** mobile: 고객 공유형 좁은 레이아웃, print: A4 인쇄 */
  variant?: "mobile" | "print";
  className?: string;
};

function formatMoney(value: number): string {
  return `${Math.max(0, Math.round(value)).toLocaleString("ko-KR")}원`;
}

export default function QuoteDocumentView({
  model,
  variant = "mobile",
  className = "",
}: Props) {
  const view = buildQuoteDocumentViewModel(model);
  const showCover = model.showCover !== false;
  const brand = model.brand ?? buildSimpleQuoteBrand(null);
  const badge =
    (model.status && ERP_QUOTE_STATUS_BADGE[model.status]) ||
    "bg-gray-100 text-gray-600";
  const isPrint = variant === "print";

  return (
    <div
      className={`${
        isPrint
          ? `quote-print-root bg-white text-slate-900${showCover ? " quote-print-has-cover" : ""}`
          : ""
      } ${className}`}
    >
      {showCover ? (
        <div className={isPrint ? "quote-print-cover-wrap" : "mx-auto max-w-3xl px-4 pt-6"}>
          <QuoteCoverPage
            brand={brand}
            customerName={model.customerName}
            title={model.title}
            quoteNumber={model.isDraft ? null : model.quoteNumber}
            quoteNumberLabel={
              model.isDraft ? "저장 전 (미발급)" : null
            }
            issuedAt={model.issuedAt}
            variant={variant}
            amountSummary={{
              totalAmount: view.totals.total_amount,
              discountAmount: view.totals.discount_amount,
              lxDiscountAmount: view.totals.lx_discount_amount,
              supplyAmount: view.totals.supply_amount,
              vatAmount: view.totals.vat_amount,
              vatRate: view.totals.vat_rate,
              vatMode: view.totals.vat_mode,
              customerTotalAmount: view.totals.customer_total_amount,
            }}
          />
        </div>
      ) : null}

      <div
        className={
          isPrint
            ? "quote-body-page space-y-6"
            : "mx-auto max-w-3xl space-y-6 px-4 py-8"
        }
      >
        <section
          className={
            isPrint
              ? "quote-body-section space-y-4 text-[12px] text-slate-800"
              : "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          }
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p
                className={
                  isPrint ? "text-[11px] text-slate-500" : "text-xs text-slate-500"
                }
              >
                고객
              </p>
              <h1
                className={
                  isPrint
                    ? "mt-1 text-[16px] font-bold text-navy-900"
                    : "mt-1 text-xl font-bold text-navy-900"
                }
              >
                {model.customerName || "고객"}
              </h1>
              <p
                className={
                  isPrint
                    ? "mt-1 text-[13px] font-semibold text-slate-900"
                    : "mt-2 text-base font-semibold text-slate-900"
                }
              >
                {model.title}
              </p>
              <p
                className={
                  isPrint
                    ? "mt-1 text-[11px] text-slate-600"
                    : "mt-1 text-sm text-slate-600"
                }
              >
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
            {model.status ? (
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${badge}`}
              >
                {model.status}
              </span>
            ) : null}
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
                  ? ` · 특별할인 -${formatMoney(view.totals.discount_amount)}`
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

        {view.groups.length > 0 ? (
          <section
            className={
              isPrint
                ? "space-y-4"
                : "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
            }
          >
            <h2
              className={
                isPrint
                  ? "text-[13px] font-semibold text-slate-900"
                  : "text-base font-semibold text-slate-900"
              }
            >
              공종별 합계표
            </h2>
            <div
              className={`mt-3 overflow-hidden rounded-lg border border-slate-200 ${
                isPrint ? "text-[11px]" : "text-sm"
              }`}
            >
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="px-3 py-2 font-medium">공종</th>
                    <th className="px-3 py-2 text-right font-medium">소계</th>
                    <th className="px-3 py-2 text-right font-medium">
                      LX 할인
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      할인 후
                    </th>
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
        ) : null}

        {view.groups.length > 0 ? (
          <section
            className={
              isPrint
                ? "space-y-4"
                : "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
            }
          >
            <h2
              className={
                isPrint
                  ? "text-[13px] font-semibold text-slate-900"
                  : "text-base font-semibold text-slate-900"
              }
            >
              {view.documentTitle}
            </h2>

            <div className="mt-3 space-y-5">
              {view.groups.map((group) => (
                <div key={group.tradeLabel} className="quote-print-group">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h3
                      className={
                        isPrint
                          ? "text-[12px] font-bold text-navy-900"
                          : "text-sm font-bold text-navy-900"
                      }
                    >
                      {group.tradeLabel}
                    </h3>
                    <p
                      className={
                        isPrint
                          ? "text-[12px] font-semibold tabular-nums text-slate-800"
                          : "text-sm font-semibold tabular-nums text-slate-800"
                      }
                    >
                      소계 {formatMoney(group.subtotal)}
                    </p>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {group.lines.map((line, idx) => (
                      <li
                        key={`${group.tradeLabel}-${line.lineTitle}-${idx}`}
                        className={`quote-print-line flex items-start justify-between gap-3 py-2.5 ${
                          isPrint ? "text-[12px]" : "py-3 text-sm"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">
                            {line.lineTitle}
                          </p>
                          <p
                            className={`mt-0.5 text-slate-600 ${
                              isPrint ? "text-[11px]" : "text-xs"
                            }`}
                          >
                            {[
                              quoteCostTypeLabel(line.cost_type),
                              line.quantity != null
                                ? `${line.quantity}${line.unitLabel ? ` ${line.unitLabel}` : ""}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {line.is_lx_material ? (
                            <p className="mt-1">
                              <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-300">
                                LX 자재
                              </span>
                            </p>
                          ) : null}
                          {line.lxDiscount > 0 ? (
                            <p
                              className={`mt-1 text-slate-600 ${
                                isPrint ? "text-[11px]" : "text-xs"
                              }`}
                            >
                              정상 {formatMoney(line.listAmount)} · 할인 -
                              {formatMoney(line.lxDiscount)} · 할인 후{" "}
                              {formatMoney(line.netAmount)}
                            </p>
                          ) : null}
                        </div>
                        <p className="shrink-0 font-semibold tabular-nums text-slate-900">
                          {formatMoney(line.netAmount)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div
              className={`quote-print-totals mt-5 space-y-1 border-t border-slate-200 pt-4 ${
                isPrint ? "text-[12px]" : "text-sm"
              }`}
            >
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
                <span>항목 합계</span>
                <span>{formatMoney(view.totals.items_net_total)}</span>
              </div>
              {view.totals.discount_amount > 0 ? (
                <div className="flex justify-between text-slate-700">
                  <span>특별할인</span>
                  <span>-{formatMoney(view.totals.discount_amount)}</span>
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
              <div
                className={`flex justify-between pt-2 font-bold text-navy-900 ${
                  isPrint ? "text-[13px]" : "text-base"
                }`}
              >
                <span>고객 최종금액</span>
                <span className="tabular-nums">
                  {formatMoney(view.totals.customer_total_amount)}
                </span>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
