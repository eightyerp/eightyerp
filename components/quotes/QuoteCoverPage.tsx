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

export type QuoteCoverContact = {
  assigneeName?: string | null;
  assigneeTitle?: string | null;
  companyPhone?: string | null;
  companyBusinessNumber?: string | null;
  validUntil?: string | null;
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
  contact?: QuoteCoverContact | null;
};

const PROJECT_PROCESS = [
  {
    step: "01",
    title: "상담·현장 실측",
    body: "고객 요청과 현장 조건을 확인합니다.",
  },
  {
    step: "02",
    title: "디자인·상세 견적",
    body: "공사 범위와 디자인, 세부 금액을 협의합니다.",
  },
  {
    step: "03",
    title: "계약·일정 확정",
    body: "계약 내용과 공사 일정을 최종 확인합니다.",
  },
  {
    step: "04",
    title: "자재·사양 승인",
    body: "색상·마감재·제품 사양을 확정합니다.",
  },
  {
    step: "05",
    title: "시공·품질 관리",
    body: "공정별 시공과 현장 품질을 관리합니다.",
  },
  {
    step: "06",
    title: "준공 검수·인도",
    body: "고객 검수 후 인도하고 사후관리를 진행합니다.",
  },
] as const;

/** 에잇티(premium) 표지 전용 — 자체 신뢰 표시 (공식 기관 로고 아님) */
const EIGHTY_TRUST_MARKS = [
  {
    key: "best",
    eyebrow: "BEST",
    label: "전국최우수 대리점",
    Icon: IconLaurelBest,
  },
  {
    key: "license",
    eyebrow: "LICENSE",
    label: "실내건축면허 보유",
    Icon: IconLicense,
  },
  {
    key: "grade-s",
    eyebrow: "S",
    label: "창호 S등급 시공",
    Icon: IconShieldS,
  },
] as const;

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

function IconLaurelBest({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14 34c-4-5-5-12-2-18 3 2 5 5 6 9-2 3-3 6-4 9Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M34 34c4-5 5-12 2-18-3 2-5 5-6 9 2 3 3 6 4 9Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M18 18c1.5-3 4-5 6-6 2 1 4.5 3 6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M20 38h8M22 38v-3h4v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconLicense({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="12"
        y="10"
        width="24"
        height="30"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M18 18h12M18 24h12M18 30h7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="32" cy="32" r="6" fill="white" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M29.5 32.2l1.8 1.8 3.4-3.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconShieldS({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M24 8l14 5v11c0 9-6 15-14 18-8-3-14-9-14-18V13l14-5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AmountSummaryCard({
  summary,
  isPrint,
}: {
  summary: QuoteCoverAmountSummary;
  isPrint: boolean;
}) {
  const badge = vatBadgeLabel(summary.vatMode);
  const showDiscount = summary.discountAmount > 0;
  const showLx = summary.lxDiscountAmount > 0;
  const vatRateLabel =
    summary.vatRate != null && Number.isFinite(summary.vatRate)
      ? `${summary.vatRate}%`
      : null;

  return (
    <div
      className={`overflow-hidden rounded-lg border border-slate-200 bg-slate-50/80 ${
        isPrint ? "" : ""
      }`}
      style={
        isPrint
          ? ({
              WebkitPrintColorAdjust: "exact",
              printColorAdjust: "exact",
            } as React.CSSProperties)
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-3.5 py-2">
        <p
          className={`font-semibold tracking-wide text-navy-900 ${
            isPrint ? "text-[11px]" : "text-[12px] sm:text-[13px]"
          }`}
        >
          견적 금액 요약
        </p>
        {badge ? (
          <span className="shrink-0 rounded border border-navy-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-navy-800">
            {badge}
          </span>
        ) : null}
      </div>

      <dl className={`space-y-1.5 px-3.5 py-2.5 ${isPrint ? "text-[11px]" : "text-[12px] sm:text-[13px]"}`}>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">공급가액</dt>
          <dd className="font-semibold tabular-nums text-slate-900">
            {formatWon(summary.supplyAmount)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">
            부가세{vatRateLabel ? ` (${vatRateLabel})` : ""}
          </dt>
          <dd className="font-semibold tabular-nums text-slate-900">
            {formatWon(summary.vatAmount)}
          </dd>
        </div>
        {showLx ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-500">LX 자재 할인</dt>
            <dd className="font-semibold tabular-nums text-rose-600">
              {formatDiscountWon(summary.lxDiscountAmount)}
            </dd>
          </div>
        ) : null}
        {showDiscount ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-500">특별할인</dt>
            <dd className="font-semibold tabular-nums text-rose-600">
              {formatDiscountWon(summary.discountAmount)}
            </dd>
          </div>
        ) : null}
      </dl>

      <div
        className="flex items-end justify-between gap-3 bg-navy-900 px-3.5 py-2.5 text-white"
        style={
          isPrint
            ? ({
                WebkitPrintColorAdjust: "exact",
                printColorAdjust: "exact",
              } as React.CSSProperties)
            : undefined
        }
      >
        <p
          className={`font-semibold text-gold-300 ${
            isPrint ? "text-[12px]" : "text-[13px]"
          }`}
        >
          고객 최종금액
        </p>
        <p
          className={`font-bold tabular-nums leading-none text-white ${
            isPrint
              ? "text-[20px]"
              : "text-[clamp(1.25rem,4.5vw,1.65rem)] sm:text-[26px]"
          }`}
        >
          {formatWon(summary.customerTotalAmount)}
        </p>
      </div>
    </div>
  );
}

function ProjectProcess({ isPrint }: { isPrint: boolean }) {
  return (
    <section
      className="quote-cover-process"
      style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
    >
      <div className="flex items-baseline justify-between gap-2 border-b border-navy-900/15 pb-1.5">
        <div>
          <p
            className={`font-semibold tracking-[0.18em] text-navy-800 ${
              isPrint ? "text-[9px]" : "text-[10px] sm:text-[11px]"
            }`}
          >
            PROJECT PROCESS
          </p>
          <h2
            className={`mt-0.5 font-bold text-navy-900 ${
              isPrint ? "text-[13px]" : "text-[14px] sm:text-[15px]"
            }`}
          >
            공사 진행 절차
          </h2>
        </div>
      </div>

      <ol
        className={`mt-2.5 grid gap-x-3 gap-y-2.5 ${
          isPrint
            ? "grid-cols-3"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        }`}
      >
        {PROJECT_PROCESS.map((item) => (
          <li key={item.step} className="min-w-0">
            <p
              className={`font-bold tabular-nums text-navy-900 ${
                isPrint ? "text-[11px]" : "text-[12px]"
              }`}
            >
              <span className="text-navy-700">{item.step}.</span> {item.title}
            </p>
            <p
              className={`mt-0.5 leading-snug text-slate-600 ${
                isPrint ? "text-[10px]" : "text-[11px] sm:text-[12px]"
              }`}
            >
              {item.body}
            </p>
          </li>
        ))}
      </ol>

      <p
        className={`mt-2.5 border-t border-slate-200 pt-2 leading-snug text-slate-500 ${
          isPrint ? "text-[9px]" : "text-[10px] sm:text-[11px]"
        }`}
      >
        공사 범위·자재·일정은 고객 확인 후 계약서에서 최종 확정되며, 변경사항은
        사전 협의 후 반영됩니다.
      </p>
    </section>
  );
}

function EightyTrustMarks({ isPrint }: { isPrint: boolean }) {
  return (
    <section
      className="quote-cover-trust"
      style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
    >
      <div className="border-b border-navy-900/15 pb-1.5">
        <p
          className={`font-semibold tracking-[0.18em] text-navy-800 ${
            isPrint ? "text-[9px]" : "text-[10px] sm:text-[11px]"
          }`}
        >
          EIGHTY TRUST MARK
        </p>
        <p
          className={`mt-0.5 text-slate-500 ${
            isPrint ? "text-[9px]" : "text-[10px]"
          }`}
        >
          에잇티 자체 신뢰 표시
        </p>
      </div>

      <ul
        className={`mt-2.5 grid gap-2 ${
          isPrint ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3"
        }`}
      >
        {EIGHTY_TRUST_MARKS.map((mark) => (
          <li
            key={mark.key}
            className="flex min-w-0 items-center gap-2.5 rounded-md border border-slate-300 bg-white px-2.5 py-2"
          >
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center text-navy-900">
              <mark.Icon className="h-10 w-10" />
              {mark.key === "grade-s" ? (
                <span
                  className="absolute inset-0 flex items-center justify-center pt-0.5 text-[15px] font-bold leading-none text-navy-900"
                  aria-hidden="true"
                >
                  S
                </span>
              ) : null}
            </div>
            <div className="min-w-0">
              <p
                className="text-[9px] font-semibold tracking-wider text-slate-500"
                aria-hidden="true"
              >
                {mark.key === "grade-s" ? "GRADE S" : mark.eyebrow}
              </p>
              <p
                className={`font-bold leading-snug text-navy-900 ${
                  isPrint ? "text-[11px]" : "text-[12px] sm:text-[13px]"
                }`}
              >
                {mark.label}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CoverHeader({
  brand,
  quoteNumberDisplay,
  issuedAt,
  isPrint,
}: {
  brand: QuoteBrandProfile;
  quoteNumberDisplay: string;
  issuedAt?: string | null;
  isPrint: boolean;
}) {
  return (
    <header className="shrink-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {brand.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logo.src}
              alt={brand.logo.alt}
              width={brand.logo.width}
              height={brand.logo.height}
              className={`shrink-0 object-contain ${
                isPrint ? "h-9 w-9" : "h-10 w-10 sm:h-11 sm:w-11"
              }`}
              loading={isPrint ? "eager" : "lazy"}
              decoding="async"
            />
          ) : (
            <span
              className={`flex shrink-0 items-center justify-center rounded bg-navy-900 font-bold text-white ${
                isPrint ? "h-9 w-9 text-sm" : "h-10 w-10 text-base"
              }`}
            >
              80
            </span>
          )}
          <div className="min-w-0">
            <p
              className={`font-bold text-navy-900 ${
                isPrint ? "text-[13px]" : "text-[14px] sm:text-[15px]"
              }`}
            >
              {brand.companyName}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`font-semibold tracking-[0.2em] text-navy-800 ${
              isPrint ? "text-[9px]" : "text-[10px]"
            }`}
          >
            ESTIMATE
          </p>
          <p
            className={`mt-0.5 tabular-nums text-slate-700 ${
              isPrint ? "text-[10px]" : "text-[11px] sm:text-[12px]"
            }`}
          >
            {quoteNumberDisplay}
          </p>
          <p
            className={`text-slate-500 ${
              isPrint ? "text-[10px]" : "text-[11px]"
            }`}
          >
            {formatDate(issuedAt)}
          </p>
        </div>
      </div>
      <div className="mt-2.5 h-px bg-navy-900" />
    </header>
  );
}

function CoverContactFooter({
  brand,
  contact,
  isPrint,
}: {
  brand: QuoteBrandProfile;
  contact?: QuoteCoverContact | null;
  isPrint: boolean;
}) {
  const assigneeName = contact?.assigneeName?.trim() || "";
  const assigneeTitle = contact?.assigneeTitle?.trim() || "";
  const assignee =
    assigneeName && assigneeTitle
      ? `${assigneeName} ${assigneeTitle}`
      : assigneeName || assigneeTitle;
  const companyPhone =
    contact?.companyPhone?.trim() || brand.phone?.trim() || "";
  const bizNo = contact?.companyBusinessNumber?.trim() || "";
  const validUntil = contact?.validUntil?.trim() || "";

  const hasAssignee = Boolean(assignee);
  const hasCompanyMeta = Boolean(companyPhone || bizNo || validUntil);
  if (!hasAssignee && !hasCompanyMeta && !brand.companyName) return null;

  return (
    <footer
      className={`border-t border-slate-200 pt-2 ${
        isPrint ? "text-[10px]" : "text-[11px] sm:text-[12px]"
      }`}
    >
      {hasAssignee ? (
        <p className="text-slate-800">
          <span className="text-slate-500">담당자</span>
          <span className="ml-2 font-semibold text-navy-900">{assignee}</span>
        </p>
      ) : null}
      <div
        className={`flex flex-wrap gap-x-4 gap-y-0.5 text-slate-600 ${
          hasAssignee ? "mt-1" : ""
        }`}
      >
        <span className="font-medium text-slate-800">{brand.companyName}</span>
        {companyPhone ? <span>대표 {companyPhone}</span> : null}
        {bizNo ? <span>사업자 {bizNo}</span> : null}
        {validUntil ? <span>유효기간 {formatDate(validUntil)}</span> : null}
      </div>
    </footer>
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
  contact = null,
}: Props) {
  const isPrint = variant === "print";
  const name = customerName.trim() || "고객";
  const isPremium = brand.coverStyle === "premium";
  const siteTitle = title.trim() || "-";
  const quoteNumberDisplay =
    quoteNumberLabel?.trim() || quoteNumber?.trim() || "-";

  const shellClass = isPrint
    ? "quote-cover-page box-border flex h-[297mm] w-[210mm] max-h-[297mm] flex-col overflow-hidden bg-white p-[11mm]"
    : "quote-cover-page rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7";

  return (
    <section
      className={shellClass}
      style={
        isPrint
          ? ({
              WebkitPrintColorAdjust: "exact",
              printColorAdjust: "exact",
              backgroundColor: "#ffffff",
            } as React.CSSProperties)
          : undefined
      }
    >
      <CoverHeader
        brand={brand}
        quoteNumberDisplay={quoteNumberDisplay}
        issuedAt={issuedAt}
        isPrint={isPrint}
      />

      <div
        className={`flex min-h-0 flex-1 flex-col ${
          isPrint ? "justify-between gap-3 pt-3" : "gap-5 pt-5 sm:gap-6"
        }`}
      >
        <div>
          <h1
            className={`text-center font-bold tracking-[0.35em] text-navy-900 ${
              isPrint
                ? "text-[22px]"
                : "text-[clamp(1.35rem,5vw,1.85rem)] sm:text-[28px]"
            }`}
          >
            견 적 서
          </h1>
          <p
            className={`mt-2 text-center font-semibold text-slate-800 break-keep ${
              isPrint ? "text-[14px]" : "text-[15px] sm:text-[17px]"
            }`}
          >
            {name} 고객님을 위한 견적서
          </p>
          <p
            className={`mt-1 text-center leading-snug text-slate-600 break-keep ${
              isPrint ? "text-[12px]" : "text-[13px] sm:text-[14px]"
            }`}
          >
            {siteTitle}
          </p>

          <dl
            className={`mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-y border-slate-200 py-2.5 ${
              isPrint ? "text-[11px]" : "text-[12px] sm:text-[13px]"
            }`}
          >
            <div>
              <dt className="text-slate-500">고객명</dt>
              <dd className="mt-0.5 font-medium text-slate-900">{name}</dd>
            </div>
            <div>
              <dt className="text-slate-500">견적명</dt>
              <dd className="mt-0.5 font-medium text-slate-900 break-keep">
                {siteTitle}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">작성일</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {formatDate(issuedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">견적번호</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-slate-900">
                {quoteNumberDisplay}
              </dd>
            </div>
          </dl>
        </div>

        {isPremium ? <ProjectProcess isPrint={isPrint} /> : null}

        {amountSummary ? (
          <AmountSummaryCard summary={amountSummary} isPrint={isPrint} />
        ) : null}

        {isPremium ? <EightyTrustMarks isPrint={isPrint} /> : null}

        <CoverContactFooter
          brand={brand}
          contact={contact}
          isPrint={isPrint}
        />
      </div>
    </section>
  );
}
