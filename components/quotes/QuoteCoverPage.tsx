import EightyLogo from "@/components/brand/EightyLogo";
import QuoteAssigneeContactBlock from "@/components/quotes/QuoteAssigneeContactBlock";
import {
  isEightyMarkSrc,
  type QuoteBrandProfile,
} from "@/lib/crm/quote-brand-shared";
import type { QuoteVatMode } from "@/lib/crm/quote-constants";
import { formatSpecialDiscountLabel } from "@/lib/crm/quote-document";

export type QuoteCoverAmountSummary = {
  totalAmount: number;
  discountAmount: number;
  /** 특별할인 메모 (금액>0일 때만 라벨에 사용) */
  specialDiscountMemo?: string | null;
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
  assigneePhone?: string | null;
  assigneeEmail?: string | null;
  /** @deprecated 명함 UI 제거 — 데이터 필드는 호환용으로만 유지 */
  assigneeShowBusinessCard?: boolean | null;
  /** @deprecated 명함 UI 제거 — 데이터 필드는 호환용으로만 유지 */
  assigneeCardImageUrl?: string | null;
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
  /** 견적유형 — 창호일 때 공사 절차 대신 체크·주의사항 표시 */
  quoteType?: string | null;
};

const PROJECT_PROCESS = [
  {
    step: "01",
    title: "상담·현장진단",
    body: "요구사항과 현장 상태 확인",
  },
  {
    step: "02",
    title: "실측·맞춤견적",
    body: "공사 범위와 금액 제안",
  },
  {
    step: "03",
    title: "계약·자재확정",
    body: "디자인·제품·일정 확정",
  },
  {
    step: "04",
    title: "공사준비",
    body: "자재 발주와 공정 사전 점검",
  },
  {
    step: "05",
    title: "전문시공·검수",
    body: "기준 시공 후 최종 품질 확인",
  },
  {
    step: "06",
    title: "완료검수·인계",
    body: "고객 확인 후 최종 인계",
  },
] as const;

const COVER_CATCHPHRASE = [
  "공간의 완성은, 에잇티.",
  "보이는 디자인, 보이지 않는 품질.",
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
    /** 고객용 메인 문구 — 내부 S등급 인증 근거는 보조로 유지 */
    label: "프리미엄 시공관리",
    sublabel: "LX 본사 인증 S등급 시공사",
    Icon: IconShieldS,
  },
  {
    key: "eighty-on",
    eyebrow: "AFTER CARE",
    label: "EIGHTY ON",
    Icon: IconEightyOn,
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

function IconEightyOn({ className }: { className?: string }) {
  // lucide-react Wrench path (패키지 미도입 — SVG만 재사용)
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
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
        {summary.totalAmount > 0 ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-500">견적 합계</dt>
            <dd className="font-semibold tabular-nums text-slate-900">
              {formatWon(summary.totalAmount)}
            </dd>
          </div>
        ) : null}
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
            <dt
              className="min-w-0 flex-1 truncate text-slate-500"
              title={formatSpecialDiscountLabel(summary.specialDiscountMemo)}
            >
              {formatSpecialDiscountLabel(summary.specialDiscountMemo)}
            </dt>
            <dd className="shrink-0 font-semibold tabular-nums text-rose-600">
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

      <dl
        className={`space-y-1 border-t border-slate-200/80 px-3.5 py-2 ${
          isPrint ? "text-[10px]" : "text-[11px] sm:text-[12px]"
        }`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">공급가액</dt>
          <dd className="font-medium tabular-nums text-slate-800">
            {formatWon(summary.supplyAmount)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">
            부가세{vatRateLabel ? ` (${vatRateLabel})` : ""}
          </dt>
          <dd className="font-medium tabular-nums text-slate-800">
            {formatWon(summary.vatAmount)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

const WINDOW_QUOTE_CHECKS = [
  "제품·유리 사양·방충망·색상이 현장 요구와 일치하는지 확인",
  "창호 수량(SET)·규격·설치 위치가 누락·중복 없는지 확인",
  "철거·양중·부가시공·표준시공비 등 공사 범위가 포함됐는지 확인",
  "특별할인·프로모션 적용 금액과 고객 최종금액을 확인",
] as const;

const WINDOW_QUOTE_CAUTIONS = [
  "본 견적은 실측 전 기준이며, 현장 실측 후 규격·사양·금액이 조정될 수 있습니다.",
  "발주·생산 착수 이후 제품·유리·색상 변경 시 추가 비용과 일정이 발생할 수 있습니다.",
  "확장·양중·폐기·안전관리 등 현장 특수 조건은 계약 전 별도 협의가 필요합니다.",
  "공사 범위·자재·일정은 고객 확인 후 계약서에서 최종 확정됩니다.",
] as const;

function WindowQuoteNotes({ isPrint }: { isPrint: boolean }) {
  return (
    <section
      className="quote-cover-window-notes"
      style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
    >
      <div className="border-b border-navy-900/15 pb-1.5">
        <p
          className={`font-semibold tracking-[0.18em] text-navy-800 ${
            isPrint ? "text-[9px]" : "text-[10px] sm:text-[11px]"
          }`}
        >
          WINDOW QUOTE GUIDE
        </p>
        <h2
          className={`mt-0.5 font-bold text-navy-900 ${
            isPrint ? "text-[13px]" : "text-[14px] sm:text-[15px]"
          }`}
        >
          창호 견적 체크사항 · 주의사항
        </h2>
      </div>

      <div
        className={`mt-2.5 grid gap-3 ${
          isPrint ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"
        }`}
      >
        <div>
          <p
            className={`font-semibold text-navy-900 ${
              isPrint ? "text-[11px]" : "text-[12px]"
            }`}
          >
            체크사항
          </p>
          <ol
            className={`mt-1.5 list-decimal space-y-1 pl-4 leading-snug text-slate-600 ${
              isPrint ? "text-[10px]" : "text-[11px] sm:text-[12px]"
            }`}
          >
            {WINDOW_QUOTE_CHECKS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
        <div>
          <p
            className={`font-semibold text-navy-900 ${
              isPrint ? "text-[11px]" : "text-[12px]"
            }`}
          >
            주의사항
          </p>
          <ul
            className={`mt-1.5 list-disc space-y-1 pl-4 leading-snug text-slate-600 ${
              isPrint ? "text-[10px]" : "text-[11px] sm:text-[12px]"
            }`}
          >
            {WINDOW_QUOTE_CAUTIONS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
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
          isPrint
            ? "grid-cols-4"
            : "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4"
        }`}
      >
        {EIGHTY_TRUST_MARKS.map((mark) => (
          <li
            key={mark.key}
            className={`flex min-w-0 items-center rounded-md border border-slate-300 bg-white ${
              isPrint ? "gap-1.5 px-1.5 py-1.5" : "gap-2 px-2 py-2 sm:gap-2.5 sm:px-2.5"
            }`}
          >
            <div
              className={`relative flex shrink-0 items-center justify-center text-navy-900 ${
                isPrint ? "h-8 w-8" : "h-9 w-9 sm:h-10 sm:w-10"
              }`}
            >
              <mark.Icon
                className={isPrint ? "h-8 w-8" : "h-9 w-9 sm:h-10 sm:w-10"}
              />
              {mark.key === "grade-s" ? (
                <span
                  className={`absolute inset-0 flex items-center justify-center pt-0.5 font-bold leading-none text-navy-900 ${
                    isPrint ? "text-[12px]" : "text-[13px] sm:text-[15px]"
                  }`}
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
                  mark.key === "grade-s" ? "whitespace-nowrap " : ""
                }${isPrint ? "text-[11px]" : "text-[12px] sm:text-[13px]"}`}
              >
                {mark.label}
              </p>
              {"sublabel" in mark && mark.sublabel ? (
                <p
                  className={`mt-0.5 font-medium leading-snug text-slate-600 ${
                    isPrint ? "text-[8px]" : "text-[9px] sm:text-[10px]"
                  }`}
                >
                  {mark.sublabel}
                </p>
              ) : null}
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
  const useEightyMark =
    Boolean(brand.useEightyMark) || isEightyMarkSrc(brand.logo?.src);
  // 표지 본문은 흰 배경 → 딥네이비 로고 (네이비 패널이 생기면 white로 분기)
  const eightyVariant = "navy" as const;

  return (
    <header className="shrink-0">
      <div
        className={`flex items-start justify-between gap-4 ${
          isPrint ? "pt-1 pb-1" : "pt-1 pb-1.5"
        }`}
      >
        <div
          className={`flex min-w-0 items-center ${
            isPrint ? "gap-3.5" : "gap-4"
          }`}
        >
          {useEightyMark ? (
            <div
              className={`flex shrink-0 items-center justify-center ${
                isPrint ? "px-1 py-1.5" : "px-1.5 py-2"
              }`}
            >
              <EightyLogo
                variant={eightyVariant}
                layout="full"
                className={`h-auto w-auto object-contain ${
                  isPrint ? "h-7 max-w-[148px]" : "h-8 max-w-[168px] sm:h-9 sm:max-w-[188px]"
                }`}
                title="EIGHTY"
              />
            </div>
          ) : brand.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logo.src}
              alt={brand.logo.alt}
              width={brand.logo.width}
              height={brand.logo.height}
              className={`shrink-0 object-contain ${
                isPrint ? "h-8 w-auto max-h-8" : "h-9 w-auto max-h-9 sm:h-10"
              }`}
              loading={isPrint ? "eager" : "lazy"}
              decoding="async"
            />
          ) : (
            <span
              className={`flex shrink-0 items-center justify-center rounded bg-navy-900 font-bold text-white ${
                isPrint ? "h-8 w-8 text-sm" : "h-9 w-9 text-base"
              }`}
            >
              80
            </span>
          )}
          <div className="min-w-0">
            <p
              className={`font-bold text-navy-900 ${
                isPrint ? "text-[12px]" : "text-[13px] sm:text-[14px]"
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
      <div className={`h-px bg-navy-900 ${isPrint ? "mt-3" : "mt-3.5"}`} />
    </header>
  );
}

function CoverContactFooter({
  contact,
  companyPhone,
  isPrint,
}: {
  contact?: QuoteCoverContact | null;
  companyPhone?: string | null;
  isPrint: boolean;
}) {
  return (
    <QuoteAssigneeContactBlock
      contact={{
        assigneeName: contact?.assigneeName,
        assigneeTitle: contact?.assigneeTitle,
        assigneePhone: contact?.assigneePhone,
        assigneeEmail: contact?.assigneeEmail,
        companyPhone,
      }}
      variant={isPrint ? "print" : "mobile"}
    />
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
  quoteType = null,
}: Props) {
  const isPrint = variant === "print";
  const name = customerName.trim() || "고객";
  const isPremium = brand.coverStyle === "premium";
  const isWindowQuote = quoteType?.trim() === "창호";
  const siteTitle = title.trim() || "-";
  const quoteNumberDisplay =
    quoteNumberLabel?.trim() || quoteNumber?.trim() || "-";

  const shellClass = isPrint
    ? "quote-cover-page box-border flex h-[279mm] w-[210mm] max-h-[279mm] flex-col overflow-hidden bg-white px-[11mm] pb-[12mm] pt-[11mm]"
    : "quote-cover-page flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7";

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

          {isPremium ? (
            <p
              className={`mt-2.5 text-center leading-snug text-navy-900 break-keep ${
                isPrint ? "text-[11px]" : "text-[12px] sm:text-[13px]"
              }`}
            >
              <span className="font-semibold">{COVER_CATCHPHRASE[0]}</span>
              <br />
              <span className="text-slate-600">{COVER_CATCHPHRASE[1]}</span>
            </p>
          ) : null}

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

        {isPremium && isWindowQuote ? (
          <WindowQuoteNotes isPrint={isPrint} />
        ) : null}
        {isPremium && !isWindowQuote ? (
          <ProjectProcess isPrint={isPrint} />
        ) : null}

        {amountSummary ? (
          <AmountSummaryCard summary={amountSummary} isPrint={isPrint} />
        ) : null}

        {isPremium ? <EightyTrustMarks isPrint={isPrint} /> : null}

        <CoverContactFooter
          contact={contact}
          companyPhone={brand.phone}
          isPrint={isPrint}
        />
      </div>
    </section>
  );
}
