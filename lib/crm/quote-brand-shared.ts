/**
 * 견적 표지 브랜드 — 클라이언트/서버 공용 (순수 함수·타입만).
 * Supabase / next/headers 의존 금지.
 */

export type QuoteBrandImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

export type QuoteBrandProfile = {
  companyName: string;
  displayName: string;
  slogan: string | null;
  intro: string | null;
  advantages: string[];
  phone: string | null;
  trustLine: string | null;
  logo: QuoteBrandImage | null;
  certImages: QuoteBrandImage[];
  siteImages: QuoteBrandImage[];
  coverStyle: "premium" | "simple";
};

export type CompanyBrandRow = {
  name?: string | null;
  business_number_normalized?: string | null;
  brand_preset?: string | null;
  brand_slogan?: string | null;
  brand_intro?: string | null;
  brand_advantages?: unknown;
  brand_phone?: string | null;
  brand_trust_line?: string | null;
  brand_logo_path?: string | null;
  brand_cert_image_paths?: unknown;
  brand_site_image_paths?: unknown;
};

/** 표지 전용 최적화 로고 (원본 PWA 아이콘은 유지) */
const EIGHTY_LOGO: QuoteBrandImage = {
  src: "/pwa/eighty-logo-96.webp",
  alt: "에잇티 로고",
  width: 96,
  height: 96,
};

const EIGHTY_BUSINESS_NUMBER = "5328102974";

const EIGHTY_ADVANTAGES = [
  "LX 전국 최우수대리점",
  "본사 인증 최고등급 시공사",
  "실내건축공사업 면허 보유",
  "풍부한 창호·주거 인테리어 시공 경험",
  "상담부터 시공·사후관리까지 원스톱 운영",
] as const;

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function toPublicImage(
  path: string | null | undefined,
  alt: string,
  size = 160,
): QuoteBrandImage | null {
  const src = (path ?? "").trim();
  if (!src) return null;
  // 외부 URL 무단 사용 금지 — 상대 경로(/...) 또는 동일 오리진만 허용
  if (/^https?:\/\//i.test(src) && !src.includes("supabase")) {
    return null;
  }
  return { src, alt, width: size, height: size };
}

export function buildSimpleQuoteBrand(
  companyName?: string | null,
): QuoteBrandProfile {
  const name = (companyName ?? "").trim() || "회사";
  return {
    companyName: name,
    displayName: name,
    slogan: null,
    intro: null,
    advantages: [],
    phone: null,
    trustLine: "견적 내용을 확인해 주시기 바랍니다.",
    logo: null,
    certImages: [],
    siteImages: [],
    coverStyle: "simple",
  };
}

export function buildEightyQuoteBrand(
  companyName?: string | null,
): QuoteBrandProfile {
  return {
    companyName: (companyName ?? "").trim() || "주식회사 에잇티",
    displayName: "EIGHTY",
    slogan: null,
    intro: "창호부터 주거 인테리어까지, 신뢰로 완성합니다.",
    advantages: [...EIGHTY_ADVANTAGES],
    phone: null,
    trustLine: "상담부터 시공·사후관리까지 원스톱으로 책임집니다.",
    logo: EIGHTY_LOGO,
    certImages: [],
    siteImages: [],
    coverStyle: "premium",
  };
}

export function resolveQuoteBrandFromCompany(
  row: CompanyBrandRow | null | undefined,
): QuoteBrandProfile {
  if (!row?.name?.trim()) {
    return buildSimpleQuoteBrand(null);
  }

  const name = row.name.trim();
  const preset = (row.brand_preset ?? "").trim();
  const isEightySeed =
    preset === "eighty" ||
    row.business_number_normalized === EIGHTY_BUSINESS_NUMBER;

  const customAdvantages = parseStringList(row.brand_advantages);
  const hasCustomCopy = Boolean(
    row.brand_slogan?.trim() ||
      row.brand_intro?.trim() ||
      customAdvantages.length > 0 ||
      row.brand_logo_path?.trim(),
  );

  if (preset === "simple") {
    return buildSimpleQuoteBrand(name);
  }

  if (preset === "custom" || (hasCustomCopy && preset !== "eighty")) {
    const logo = toPublicImage(row.brand_logo_path, `${name} 로고`, 96);
    const certImages = parseStringList(row.brand_cert_image_paths)
      .map((src, i) => toPublicImage(src, `${name} 인증 ${i + 1}`, 140))
      .filter((x): x is QuoteBrandImage => Boolean(x));
    const siteImages = parseStringList(row.brand_site_image_paths)
      .map((src, i) => toPublicImage(src, `${name} 시공 사진 ${i + 1}`, 200))
      .filter((x): x is QuoteBrandImage => Boolean(x));

    return {
      companyName: name,
      displayName: name,
      slogan: row.brand_slogan?.trim() || null,
      intro: row.brand_intro?.trim() || null,
      advantages: customAdvantages,
      phone: row.brand_phone?.trim() || null,
      trustLine: row.brand_trust_line?.trim() || null,
      logo,
      certImages,
      siteImages,
      coverStyle: "premium",
    };
  }

  if (isEightySeed) {
    const eighty = buildEightyQuoteBrand(name);
    const logo = toPublicImage(row.brand_logo_path, "에잇티 로고", 96);
    return {
      ...eighty,
      phone: row.brand_phone?.trim() || eighty.phone,
      trustLine: row.brand_trust_line?.trim() || eighty.trustLine,
      logo: logo ?? eighty.logo,
    };
  }

  return buildSimpleQuoteBrand(name);
}

export function resolveQuoteBrandFromShare(share: {
  company_name?: string | null;
  company_business_number?: string | null;
  brand_preset?: string | null;
  brand_slogan?: string | null;
  brand_intro?: string | null;
  brand_advantages?: unknown;
  brand_phone?: string | null;
  brand_trust_line?: string | null;
  brand_logo_path?: string | null;
  brand_cert_image_paths?: unknown;
  brand_site_image_paths?: unknown;
}): QuoteBrandProfile {
  return resolveQuoteBrandFromCompany({
    name: share.company_name,
    business_number_normalized: share.company_business_number,
    brand_preset: share.brand_preset,
    brand_slogan: share.brand_slogan,
    brand_intro: share.brand_intro,
    brand_advantages: share.brand_advantages,
    brand_phone: share.brand_phone,
    brand_trust_line: share.brand_trust_line,
    brand_logo_path: share.brand_logo_path,
    brand_cert_image_paths: share.brand_cert_image_paths,
    brand_site_image_paths: share.brand_site_image_paths,
  });
}

/** PostgREST/스키마 오류가 브랜드 컬럼 미적용인지 판별 */
export function isMissingBrandColumnError(
  message: string | null | undefined,
): boolean {
  const text = (message ?? "").toLowerCase();
  if (!text) return false;
  return (
    text.includes("brand_preset") ||
    text.includes("brand_slogan") ||
    text.includes("brand_intro") ||
    text.includes("brand_advantages") ||
    text.includes("brand_phone") ||
    text.includes("brand_trust_line") ||
    text.includes("brand_logo_path") ||
    text.includes("brand_cert_image") ||
    text.includes("brand_site_image") ||
    (text.includes("column") && text.includes("brand_")) ||
    text.includes("schema cache")
  );
}
