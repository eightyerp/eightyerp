import type { QuoteBrandProfile } from "@/lib/crm/quote-brand-shared";
import type { QuoteVatMode } from "@/lib/crm/quote-constants";

export type QuoteCoverAmountSummary = {
  totalAmount: number;
  discountAmount: number;
  lxDiscountAmount: number;
  supplyAmount: number;
  vatAmount: number;
  vatRate: number | null;
  vatMode: QuoteVatMode | null;
  customerTotalAmount: number;
};

type Props = {
  brand: QuoteBrandProfile;
  customerName: string;
  title: string;
  quoteNumber?: string | null;
  /** 견적번호 자리 대체 문구 (예: 저장 전 (미발급)) */
  quoteNumberLabel?: string | null;
  issuedAt?: string | null;
  variant?: "mobile" | "print";
  /** 공통 뷰모델 totals 기반 표지 금액 요약 */
  amountSummary?: QuoteCoverAmountSummary | null;
};

function formatWon(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatDiscountWon(value: number): string {
  return `-${Math.max(0, Math.round(value)).toLocaleString("ko-KR")}원`;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function vatBadgeLabel(mode: QuoteVatMode | null): string | null {
  if (mode === "inclusive") return "VAT 포함";
  if (mode === "exclusive") return "VAT 별도";
  return null;
}

function AmountSummaryCard({
  summary,
  tone,
  isPrint,
}: {
  summary: QuoteCoverAmountSummary;
  tone: "navy" | "light";
  isPrint: boolean;
}) {
  const isNavy = tone === "navy";
  const badge = vatBadgeLabel(summary.vatMode);
  const showDiscount = summary.discountAmount > 0;
  const showLx = summary.lxDiscountAmount > 0;
  const vatRateLabel =
    summary.vatRate != null && Number.isFinite(summary.vatRate)
      ? `${summary.vatRate}%`
      : null;

  const labelClass = isNavy
    ? isPrint
      ? "text-[12px] text-slate-200"
      : "text-[12px] text-white/70 sm:text-[13px]"
    : isPrint
      ? "text-[12px] text-slate-500"
      : "text-[12px] text-slate-500 sm:text-[13px]";

  const valueClass = isNavy
    ? isPrint
      ? "text-[13px] font-semibold tabular-nums text-white"
      : "text-[13px] font-semibold tabular-nums text-white sm:text-[14px]"
    : isPrint
      ? "text-[13px] font-semibold tabular-nums text-slate-900"
      : "text-[13px] font-semibold tabular-nums text-slate-900 sm:text-[14px]";

  const discountClass = isNavy
    ? "tabular-nums text-rose-200"
    : "tabular-nums text-rose-600";

  return (
    <div
      className={
        isNavy
          ? `rounded-2xl border border-white/25 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-[2px] ${
              isPrint ? "px-4 py-3" : "px-4 py-3.5 sm:px-5 sm:py-4"
            }`
          : `rounded-2xl border border-slate-200 bg-slate-50 ${
              isPrint ? "px-4 py-3" : "px-4 py-3.5"
            }`
      }
      style={
        isPrint && isNavy
          ? ({
              WebkitPrintColorAdjust: "exact",
              printColorAdjust: "exact",
            } as React.CSSProperties)
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p
          className={
            isNavy
              ? `font-semibold tracking-wide text-gold-300 ${
                  isPrint ? "text-[12px]" : "text-[12px] sm:text-[13px]"
                }`
              : `font-semibold tracking-wide text-navy-800 ${
                  isPrint ? "text-[12px]" : "text-[12px] sm:text-[13px]"
                }`
          }
        >
          금액 요약
        </p>
        {badge ? (
          <span
            className={
              isNavy
                ? "shrink-0 rounded-full border border-gold-400/50 bg-gold-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-gold-300"
                : "shrink-0 rounded-full border border-navy-200 bg-navy-50 px-2.5 py-0.5 text-[11px] font-semibold text-navy-800"
            }
          >
            {badge}
          </span>
        ) : null}
      </div>

      <dl className={`mt-2.5 space-y-1.5 ${isPrint ? "mt-2" : ""}`}>
        <div className="flex items-baseline justify-between gap-3">
          <dt className={labelClass}>견적 합계</dt>
          <dd className={valueClass}>{formatWon(summary.totalAmount)}</dd>
        </div>
        {showDiscount ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className={labelClass}>특별할인</dt>
            <dd className={`${valueClass} ${discountClass}`}>
              {formatDiscountWon(summary.discountAmount)}
            </dd>
          </div>
        ) : null}
        {showLx ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className={labelClass}>LX 자재 할인</dt>
            <dd className={`${valueClass} ${discountClass}`}>
              {formatDiscountWon(summary.lxDiscountAmount)}
            </dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-3">
          <dt className={labelClass}>공급가액</dt>
          <dd className={valueClass}>{formatWon(summary.supplyAmount)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className={labelClass}>
            부가세{vatRateLabel ? ` ${vatRateLabel}` : ""}
          </dt>
          <dd className={valueClass}>{formatWon(summary.vatAmount)}</dd>
        </div>
      </dl>

      <div
        className={`mt-2.5 flex items-end justify-between gap-3 border-t pt-2.5 ${
          isNavy ? "border-white/20" : "border-slate-200"
        } ${isPrint ? "mt-2 pt-2" : ""}`}
      >
        <p
          className={
            isNavy
              ? `font-semibold text-gold-300 ${
                  isPrint ? "text-[13px]" : "text-[13px] sm:text-[14px]"
                }`
              : `font-semibold text-navy-800 ${
                  isPrint ? "text-[13px]" : "text-[13px] sm:text-[14px]"
                }`
          }
        >
          고객 최종금액
        </p>
        <p
          className={
            isNavy
              ? `font-bold tabular-nums leading-none text-white ${
                  isPrint
                    ? "text-[22px]"
                    : "text-[clamp(1.35rem,5vw,1.75rem)] sm:text-[28px]"
                }`
              : `font-bold tabular-nums leading-none text-navy-900 ${
                  isPrint
                    ? "text-[22px]"
                    : "text-[clamp(1.35rem,5vw,1.75rem)] sm:text-[28px]"
                }`
          }
        >
          {formatWon(summary.customerTotalAmount)}
        </p>
      </div>
    </div>
  );
}

export default function QuoteCoverPage({
  brand,
  customerName,
  title,
  quoteNumber,
  quoteNumberLabel,
  issuedAt,
  variant = "mobile",
  amountSummary = null,
}: Props) {
  const isPrint = variant === "print";
  const name = customerName.trim() || "고객";
  const isPremium = brand.coverStyle === "premium";
  const siteTitle = title.trim() || "-";
  const quoteNumberDisplay =
    quoteNumberLabel?.trim() || quoteNumber?.trim() || "-";
  const hasAmountSummary = amountSummary != null;
  const showImages =
    !isPrint &&
    (brand.certImages.length > 0 || brand.siteImages.length > 0);
  const advantages = isPrint
    ? brand.advantages.slice(0, hasAmountSummary ? 2 : 3)
    : brand.advantages;

  if (!isPremium) {
    return (
      <section
        className={`quote-cover-page ${
          isPrint
            ? "box-border flex h-[297mm] w-[210mm] max-h-[297mm] flex-col justify-between border border-slate-200 bg-white p-[14mm]"
            : "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
        }`}
      >
        <div>
          <p
            className={`font-medium tracking-wide text-slate-600 ${
              isPrint ? "text-[18px]" : "text-[15px] sm:text-[17px]"
            }`}
          >
            {brand.companyName}
          </p>
          <h1
            className={`mt-3 font-bold leading-snug text-navy-900 break-keep ${
              isPrint
                ? "text-[38px]"
                : "text-[clamp(1.5rem,6vw,2.25rem)] sm:text-[36px]"
            }`}
          >
            <span className="line-clamp-3">
              {name} 고객님을 위한 견적서
            </span>
          </h1>
          <p
            className={`mt-2 font-semibold text-slate-800 break-keep ${
              isPrint ? "text-[18px]" : "text-[16px] sm:text-[17px]"
            }`}
          >
            {siteTitle}
          </p>
        </div>
        <dl className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="text-[13px] text-slate-500">작성일</dt>
            <dd
              className={`mt-0.5 font-medium text-slate-900 ${
                isPrint ? "text-[17px]" : "text-[16px]"
              }`}
            >
              {formatDate(issuedAt)}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="text-[13px] text-slate-500">견적번호</dt>
            <dd
              className={`mt-0.5 font-medium text-slate-900 ${
                isPrint ? "text-[17px]" : "text-[16px]"
              }`}
            >
              {quoteNumberDisplay}
            </dd>
          </div>
        </dl>
        {amountSummary ? (
          <div className={`mt-4 ${isPrint ? "mt-3" : ""}`}>
            <AmountSummaryCard
              summary={amountSummary}
              tone="light"
              isPrint={isPrint}
            />
          </div>
        ) : null}
        {brand.trustLine ? (
          <p
            className={`mt-8 text-slate-600 ${
              isPrint ? "text-[16px]" : "text-[15px]"
            }`}
          >
            {brand.trustLine}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className={`quote-cover-page relative overflow-hidden ${
        isPrint
          ? "box-border flex h-[297mm] w-[210mm] max-h-[297mm] flex-col justify-between overflow-hidden p-[12mm]"
          : "rounded-2xl border border-navy-900/20 bg-white p-5 shadow-sm sm:p-8"
      }`}
      style={
        isPrint
          ? ({
              WebkitPrintColorAdjust: "exact",
              printColorAdjust: "exact",
              backgroundColor: "#0a1628",
            } as React.CSSProperties)
          : undefined
      }
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700" />
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold-500/15 blur-2xl" />
        <div className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-gold-400/10 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-gold-500 to-transparent" />
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col text-white">
        <header className="flex shrink-0 items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {brand.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logo.src}
                alt={brand.logo.alt}
                width={brand.logo.width}
                height={brand.logo.height}
                className={`shrink-0 rounded-xl bg-white/10 object-contain p-1 ring-1 ring-gold-500/40 ${
                  isPrint ? "h-12 w-12" : "h-14 w-14"
                }`}
                loading={isPrint ? "eager" : "lazy"}
                decoding="async"
              />
            ) : (
              <span
                className={`flex shrink-0 items-center justify-center rounded-xl bg-gold-500/15 font-bold text-gold-400 ring-1 ring-gold-500/40 ${
                  isPrint ? "h-12 w-12 text-xl" : "h-14 w-14 text-2xl"
                }`}
              >
                80
              </span>
            )}
            <div className="min-w-0">
              <p
                className={`tracking-[0.25em] text-gold-400 ${
                  isPrint ? "text-[13px]" : "text-[13px]"
                }`}
              >
                {brand.displayName}
              </p>
              <p
                className={`mt-1 font-semibold text-white break-keep ${
                  isPrint ? "text-[16px]" : "text-[16px] sm:text-[18px]"
                }`}
              >
                {brand.companyName}
              </p>
            </div>
          </div>
          {brand.slogan?.trim() ? (
            <p
              className={`max-w-[40%] shrink-0 text-right font-medium text-gold-300 break-keep ${
                isPrint ? "text-[14px]" : "text-[14px] sm:text-[15px]"
              }`}
            >
              {brand.slogan.trim()}
            </p>
          ) : null}
        </header>

        <div className={`shrink-0 ${isPrint ? "mt-5" : "mt-8 sm:mt-10"}`}>
          <p
            className={`tracking-wide ${
              isPrint ? "text-[12px] text-slate-200" : "text-[13px] text-white/70"
            }`}
          >
            견적서
          </p>
          <h1
            className={`mt-1.5 font-bold leading-snug text-white break-keep ${
              isPrint
                ? "text-[30px]"
                : "text-[clamp(1.5rem,6.5vw,2.2rem)] sm:text-[36px]"
            }`}
          >
            <span className="line-clamp-2">
              {name} 고객님을 위한 견적서
            </span>
          </h1>
          {brand.intro && !isPrint ? (
            <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-white/85 sm:text-[18px]">
              {brand.intro}
            </p>
          ) : null}
        </div>

        <div
          className={`grid shrink-0 gap-2.5 sm:grid-cols-2 ${
            isPrint ? "mt-4" : "mt-6"
          }`}
        >
          <div className="rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5">
            <p
              className={`text-[12px] ${isPrint ? "text-slate-200" : "text-white/70"}`}
            >
              고객명
            </p>
            <p
              className={`mt-0.5 font-semibold text-white break-keep ${
                isPrint ? "text-[15px]" : "text-[15px] sm:text-[16px]"
              }`}
            >
              <span className="line-clamp-1">{name}</span>
            </p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5">
            <p
              className={`text-[12px] ${isPrint ? "text-slate-200" : "text-white/70"}`}
            >
              견적명 / 현장명
            </p>
            <p
              className={`mt-0.5 font-semibold text-white break-keep ${
                isPrint ? "text-[15px]" : "text-[15px] sm:text-[16px]"
              }`}
            >
              <span className="line-clamp-1">{siteTitle}</span>
            </p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5">
            <p
              className={`text-[12px] ${isPrint ? "text-slate-200" : "text-white/70"}`}
            >
              작성일
            </p>
            <p
              className={`mt-0.5 font-semibold text-white ${
                isPrint ? "text-[15px]" : "text-[15px] sm:text-[16px]"
              }`}
            >
              {formatDate(issuedAt)}
            </p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5">
            <p
              className={`text-[12px] ${isPrint ? "text-slate-200" : "text-white/70"}`}
            >
              견적번호
            </p>
            <p
              className={`mt-0.5 font-semibold text-white ${
                isPrint ? "text-[15px]" : "text-[15px] sm:text-[16px]"
              }`}
            >
              {quoteNumberDisplay}
            </p>
          </div>
        </div>

        {amountSummary ? (
          <div className={`shrink-0 ${isPrint ? "mt-3.5" : "mt-5"}`}>
            <AmountSummaryCard
              summary={amountSummary}
              tone="navy"
              isPrint={isPrint}
            />
          </div>
        ) : null}

        {advantages.length > 0 ? (
          <div className={`min-h-0 shrink ${isPrint ? "mt-3.5" : "mt-6"}`}>
            <p
              className={`font-semibold tracking-wide text-gold-400 ${
                isPrint ? "text-[13px]" : "text-[14px]"
              }`}
            >
              왜 {brand.displayName}인가
            </p>
            <ul className={`mt-2 space-y-1.5 ${isPrint ? "mt-1.5" : ""}`}>
              {advantages.map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className={`flex items-start gap-2 break-keep ${
                    isPrint
                      ? "text-[13px] text-slate-100"
                      : "text-[15px] text-white/90 sm:text-[16px]"
                  }`}
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-[11px] font-bold text-gold-400">
                    {index + 1}
                  </span>
                  <span className="line-clamp-2">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {showImages ? (
          <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${isPrint ? "" : "mt-5"}`}>
            {[...brand.certImages, ...brand.siteImages]
              .slice(0, hasAmountSummary ? 2 : 3)
              .map((img) => (
                <div
                  key={img.src}
                  className="overflow-hidden rounded-lg border border-white/10 bg-white/5"
                  style={{ aspectRatio: "4 / 3" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.src}
                    alt={img.alt}
                    width={img.width}
                    height={img.height}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ))}
          </div>
        ) : null}

        <footer className="mt-auto shrink-0 pt-4">
          {brand.trustLine ? (
            <p
              className={`font-medium text-gold-300 ${
                isPrint ? "text-[13px]" : "text-[15px]"
              }`}
            >
              {brand.trustLine}
            </p>
          ) : null}
          <div
            className={`mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/20 pt-2.5 ${
              isPrint
                ? "text-[12px] text-slate-200"
                : "text-[13px] text-white/75"
            }`}
          >
            <span>{brand.companyName}</span>
            {brand.phone ? <span>대표 연락처 {brand.phone}</span> : null}
          </div>
        </footer>
      </div>
    </section>
  );
}
