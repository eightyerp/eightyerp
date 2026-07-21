import "server-only";

import { createClient } from "@/lib/supabase-server";
import { requireAuthenticatedAccess } from "@/lib/crm/access";
import {
  DEFAULT_QUOTE_VAT_MODE,
  DEFAULT_QUOTE_VAT_RATE,
  computeQuoteVatAmounts,
  normalizeQuoteVatMode,
  normalizeQuoteVatRate,
  resolveQuoteVatDisplayAmounts,
  type QuoteVatAmounts,
  type QuoteVatMode,
} from "@/lib/crm/quote-constants";

/** 회사 VAT 설정의 단일 계산 진입점 (서버). 클라이언트는 quote-constants 동일 함수 사용. */
export {
  computeQuoteVatAmounts,
  resolveQuoteVatDisplayAmounts,
  type QuoteVatAmounts,
  type QuoteVatMode,
};

export type CompanyQuoteVatSettings = {
  company_id: string;
  quote_vat_input_mode: QuoteVatMode;
  quote_vat_rate: number;
};

function isMissingCompanyVatRpcError(message: string | undefined): boolean {
  const text = (message ?? "").toLowerCase();
  return (
    text.includes("update_company_quote_vat_settings") ||
    text.includes("quote_vat_input_mode") ||
    text.includes("quote_vat_rate") ||
    text.includes("could not find the function") ||
    text.includes("schema cache")
  );
}

/**
 * 현재 활성 회사의 견적 VAT 기본값 조회.
 * migration 32 컬럼이 없으면 exclusive/10 fallback.
 */
export async function getCurrentCompanyQuoteVatSettings(): Promise<CompanyQuoteVatSettings> {
  await requireAuthenticatedAccess();
  const fallbackMode = DEFAULT_QUOTE_VAT_MODE;
  const fallbackRate = DEFAULT_QUOTE_VAT_RATE;

  const supabase = await createClient();
  const { data: companyId, error: idError } = await supabase.rpc(
    "current_company_id",
  );
  if (idError || !companyId) {
    return {
      company_id: "",
      quote_vat_input_mode: fallbackMode,
      quote_vat_rate: fallbackRate,
    };
  }

  const { data, error } = await supabase
    .from("companies")
    .select("quote_vat_input_mode, quote_vat_rate")
    .eq("id", companyId)
    .maybeSingle();

  if (error || !data) {
    return {
      company_id: String(companyId),
      quote_vat_input_mode: fallbackMode,
      quote_vat_rate: fallbackRate,
    };
  }

  return {
    company_id: String(companyId),
    quote_vat_input_mode:
      normalizeQuoteVatMode(
        (data as { quote_vat_input_mode?: string | null }).quote_vat_input_mode,
      ) ?? fallbackMode,
    quote_vat_rate: normalizeQuoteVatRate(
      (data as { quote_vat_rate?: number | null }).quote_vat_rate,
    ),
  };
}

/**
 * 회사 VAT 기본설정 저장 (RPC update_company_quote_vat_settings).
 * owner/director/admin만. 기존 견적 snapshot은 변경되지 않음.
 */
export async function updateCompanyQuoteVatSettings(input: {
  companyId: string;
  quoteVatInputMode: QuoteVatMode;
  quoteVatRate: number;
}): Promise<CompanyQuoteVatSettings> {
  await requireAuthenticatedAccess();

  const mode = normalizeQuoteVatMode(input.quoteVatInputMode);
  if (!mode) {
    throw new Error("부가세 입력 방식은 exclusive 또는 inclusive만 가능합니다.");
  }
  const rate = normalizeQuoteVatRate(input.quoteVatRate);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "update_company_quote_vat_settings",
    {
      p_company_id: input.companyId,
      p_quote_vat_input_mode: mode,
      p_quote_vat_rate: rate,
    },
  );

  if (error) {
    if (isMissingCompanyVatRpcError(error.message)) {
      throw new Error(
        "부가세 설정(migration 33)이 아직 적용되지 않았습니다. DB 마이그레이션 후 다시 시도해 주세요.",
      );
    }
    throw new Error(error.message || "회사 부가세 설정 저장에 실패했습니다.");
  }

  const row = data as {
    company_id?: string;
    quote_vat_input_mode?: string;
    quote_vat_rate?: number;
  } | null;

  if (!row?.company_id) {
    throw new Error("회사 부가세 설정 저장에 실패했습니다.");
  }

  return {
    company_id: row.company_id,
    quote_vat_input_mode:
      normalizeQuoteVatMode(row.quote_vat_input_mode) ?? mode,
    quote_vat_rate: normalizeQuoteVatRate(row.quote_vat_rate ?? rate),
  };
}
