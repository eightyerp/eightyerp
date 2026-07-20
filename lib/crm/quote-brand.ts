import "server-only";

import { createClient } from "@/lib/supabase-server";
import {
  buildSimpleQuoteBrand,
  isMissingBrandColumnError,
  resolveQuoteBrandFromCompany,
  type CompanyBrandRow,
  type QuoteBrandProfile,
} from "@/lib/crm/quote-brand-shared";

export type {
  CompanyBrandRow,
  QuoteBrandImage,
  QuoteBrandProfile,
} from "@/lib/crm/quote-brand-shared";

export {
  buildEightyQuoteBrand,
  buildSimpleQuoteBrand,
  isMissingBrandColumnError,
  resolveQuoteBrandFromCompany,
  resolveQuoteBrandFromShare,
} from "@/lib/crm/quote-brand-shared";

/**
 * 현재 활성 회사의 견적 표지 브랜드를 1회 조회한다.
 * 브랜드 컬럼(migration 28)이 없으면 회사명·BN 기준으로 안전하게 대체한다.
 * 컬럼 누락이 아닌 DB 오류는 호출부에 전달한다.
 */
export async function getCurrentCompanyQuoteBrand(): Promise<QuoteBrandProfile> {
  const supabase = await createClient();
  const { data: companyId, error: idError } = await supabase.rpc(
    "current_company_id",
  );
  if (idError) {
    throw new Error(idError.message || "회사 정보를 확인하지 못했습니다.");
  }
  if (!companyId) {
    return buildSimpleQuoteBrand(null);
  }

  const fullSelect =
    "name, business_number_normalized, brand_preset, brand_slogan, brand_intro, brand_advantages, brand_phone, brand_trust_line, brand_logo_path, brand_cert_image_paths, brand_site_image_paths";

  const full = await supabase
    .from("companies")
    .select(fullSelect)
    .eq("id", companyId)
    .maybeSingle();

  if (!full.error && full.data) {
    return resolveQuoteBrandFromCompany(full.data as CompanyBrandRow);
  }

  if (full.error && !isMissingBrandColumnError(full.error.message)) {
    throw new Error(full.error.message || "회사 브랜드를 불러오지 못했습니다.");
  }

  const basic = await supabase
    .from("companies")
    .select("name, business_number_normalized")
    .eq("id", companyId)
    .maybeSingle();

  if (basic.error) {
    throw new Error(basic.error.message || "회사 정보를 불러오지 못했습니다.");
  }

  if (basic.data) {
    return resolveQuoteBrandFromCompany(basic.data as CompanyBrandRow);
  }

  return buildSimpleQuoteBrand(null);
}
