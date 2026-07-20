import type { QuoteBrandProfile } from "@/lib/crm/quote-brand-shared";

type Props = {
  brand: QuoteBrandProfile;
  customerName: string;
  title: string;
  quoteNumber?: string | null;
  issuedAt?: string | null;
  variant?: "mobile" | "print";
};

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

export default function QuoteCoverPage({
  brand,
  customerName,
  title,
  quoteNumber,
  issuedAt,
  variant = "mobile",
}: Props) {
  const isPrint = variant === "print";
  const name = customerName.trim() || "고객";
  const isPremium = brand.coverStyle === "premium";
  const siteTitle = title.trim() || "-";

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
              {quoteNumber?.trim() || "-"}
            </dd>
          </div>
        </dl>
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
          ? "box-border flex h-[297mm] w-[210mm] max-h-[297mm] flex-col justify-between p-[14mm]"
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

      <div className="relative z-10 flex flex-1 flex-col text-white">
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {brand.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logo.src}
                alt={brand.logo.alt}
                width={brand.logo.width}
                height={brand.logo.height}
                className="h-14 w-14 shrink-0 rounded-xl bg-white/10 object-contain p-1 ring-1 ring-gold-500/40"
                loading={isPrint ? "eager" : "lazy"}
                decoding="async"
              />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gold-500/15 text-2xl font-bold text-gold-400 ring-1 ring-gold-500/40">
                80
              </span>
            )}
            <div className="min-w-0">
              <p
                className={`tracking-[0.25em] text-gold-400 ${
                  isPrint ? "text-[14px]" : "text-[13px]"
                }`}
              >
                {brand.displayName}
              </p>
              <p
                className={`mt-1 font-semibold text-white break-keep ${
                  isPrint ? "text-[18px]" : "text-[16px] sm:text-[18px]"
                }`}
              >
                {brand.companyName}
              </p>
            </div>
          </div>
          {brand.slogan?.trim() ? (
            <p
              className={`max-w-[40%] shrink-0 text-right font-medium text-gold-300 break-keep ${
                isPrint ? "text-[16px]" : "text-[14px] sm:text-[15px]"
              }`}
            >
              {brand.slogan.trim()}
            </p>
          ) : null}
        </header>

        <div className={`mt-8 ${isPrint ? "mt-10" : "sm:mt-12"}`}>
          <p
            className={`tracking-wide ${
              isPrint ? "text-[13px] text-slate-200" : "text-[13px] text-white/70"
            }`}
          >
            견적서
          </p>
          <h1
            className={`mt-2 font-bold leading-snug text-white break-keep ${
              isPrint
                ? "text-[38px]"
                : "text-[clamp(1.65rem,7vw,2.35rem)] sm:text-[38px]"
            }`}
          >
            <span className="line-clamp-3">
              {name} 고객님을 위한 견적서
            </span>
          </h1>
          {brand.intro ? (
            <p
              className={`mt-3 max-w-xl leading-relaxed ${
                isPrint
                  ? "text-[19px] text-slate-100"
                  : "text-[16px] text-white/85 sm:text-[18px]"
              }`}
            >
              {brand.intro}
            </p>
          ) : null}
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
            <p
              className={`text-[13px] ${isPrint ? "text-slate-200" : "text-white/70"}`}
            >
              고객명
            </p>
            <p
              className={`mt-1 font-semibold text-white break-keep ${
                isPrint ? "text-[17px]" : "text-[16px] sm:text-[17px]"
              }`}
            >
              <span className="line-clamp-2">{name}</span>
            </p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
            <p
              className={`text-[13px] ${isPrint ? "text-slate-200" : "text-white/70"}`}
            >
              견적명 / 현장명
            </p>
            <p
              className={`mt-1 font-semibold text-white break-keep ${
                isPrint ? "text-[17px]" : "text-[16px] sm:text-[17px]"
              }`}
            >
              <span className="line-clamp-2">{siteTitle}</span>
            </p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
            <p
              className={`text-[13px] ${isPrint ? "text-slate-200" : "text-white/70"}`}
            >
              작성일
            </p>
            <p
              className={`mt-1 font-semibold text-white ${
                isPrint ? "text-[17px]" : "text-[16px] sm:text-[17px]"
              }`}
            >
              {formatDate(issuedAt)}
            </p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
            <p
              className={`text-[13px] ${isPrint ? "text-slate-200" : "text-white/70"}`}
            >
              견적번호
            </p>
            <p
              className={`mt-1 font-semibold text-white ${
                isPrint ? "text-[17px]" : "text-[16px] sm:text-[17px]"
              }`}
            >
              {quoteNumber?.trim() || "-"}
            </p>
          </div>
        </div>

        {brand.advantages.length > 0 ? (
          <div className="mt-8">
            <p
              className={`font-semibold tracking-wide text-gold-400 ${
                isPrint ? "text-[15px]" : "text-[14px]"
              }`}
            >
              왜 {brand.displayName}인가
            </p>
            <ul className="mt-3 space-y-2">
              {brand.advantages.map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className={`flex items-start gap-2 break-keep ${
                    isPrint
                      ? "text-[16px] text-slate-100"
                      : "text-[15px] text-white/90 sm:text-[16px]"
                  }`}
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-[11px] font-bold text-gold-400">
                    {index + 1}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {(brand.certImages.length > 0 || brand.siteImages.length > 0) && (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[...brand.certImages, ...brand.siteImages]
              .slice(0, 3)
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
        )}

        <footer className="mt-auto pt-6">
          {brand.trustLine ? (
            <p
              className={`font-medium text-gold-300 ${
                isPrint ? "text-[16px]" : "text-[15px]"
              }`}
            >
              {brand.trustLine}
            </p>
          ) : null}
          <div
            className={`mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/20 pt-3 ${
              isPrint
                ? "text-[14px] text-slate-200"
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
