import { createClient } from "@/lib/supabase-server";
import { requireAuthenticatedAccess } from "@/lib/crm/access";
import type { QuoteMode } from "@/lib/crm/quote-constants";
import {
  canManageQuoteTemplates,
  normalizeTemplateItem,
  QUOTE_TEMPLATE_TYPES,
  type QuoteTemplate,
  type QuoteTemplateItemPayload,
  type QuoteTemplateListItem,
  type QuoteTemplateType,
} from "@/lib/crm/quote-template-shared";

export type {
  QuoteTemplate,
  QuoteTemplateItemPayload,
  QuoteTemplateListItem,
  QuoteTemplateType,
} from "@/lib/crm/quote-template-shared";
export {
  canManageQuoteTemplates,
  QUOTE_TEMPLATE_TYPES,
  templateItemDedupeKey,
} from "@/lib/crm/quote-template-shared";

async function requireCompanyId(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_company_id");
  if (error || !data) {
    throw new Error("회사 정보를 확인할 수 없습니다.");
  }
  return String(data);
}

export async function getCurrentCompanyRole(): Promise<string | null> {
  await requireAuthenticatedAccess();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_company_role");
  if (error) return null;
  return data ? String(data) : null;
}

function mapRow(row: Record<string, unknown>): QuoteTemplate {
  const tradeOrder = Array.isArray(row.trade_order)
    ? row.trade_order.map((t) => String(t))
    : [];
  const items = Array.isArray(row.items)
    ? row.items
        .map((item) => normalizeTemplateItem(item))
        .filter((item): item is QuoteTemplateItemPayload => Boolean(item))
    : [];
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    name: String(row.name ?? ""),
    quote_type: String(row.quote_type ?? "공통"),
    quote_mode: String(row.quote_mode ?? "detailed") as QuoteMode,
    trade_order: tradeOrder,
    items,
    trade_count: Number(row.trade_count ?? tradeOrder.length),
    item_count: Number(row.item_count ?? items.length),
    archived_at: row.archived_at ? String(row.archived_at) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    updated_by: row.updated_by ? String(row.updated_by) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function listQuoteTemplates(input?: {
  query?: string;
  quoteType?: QuoteTemplateType | "전체";
  includeArchived?: boolean;
}): Promise<QuoteTemplateListItem[]> {
  await requireAuthenticatedAccess();
  const companyId = await requireCompanyId();
  const supabase = await createClient();

  let q = supabase
    .from("quote_templates")
    .select(
      "id, name, quote_type, quote_mode, trade_count, item_count, updated_at, archived_at",
    )
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });

  if (!input?.includeArchived) {
    q = q.is("archived_at", null);
  }

  const typeFilter = input?.quoteType;
  if (typeFilter && typeFilter !== "전체") {
    q = q.eq("quote_type", typeFilter);
  }

  const search = String(input?.query ?? "").trim();
  if (search) {
    q = q.ilike("name", `%${search}%`);
  }

  const { data, error } = await q;
  if (error) {
    throw new Error(
      error.message.includes("quote_templates")
        ? "견적 템플릿 테이블이 아직 없습니다. migration 43을 적용한 뒤 다시 시도해 주세요."
        : "템플릿 목록을 불러오지 못했습니다.",
    );
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    quote_type: String(row.quote_type ?? "공통"),
    quote_mode: String(row.quote_mode ?? "detailed"),
    trade_count: Number(row.trade_count ?? 0),
    item_count: Number(row.item_count ?? 0),
    updated_at: String(row.updated_at ?? ""),
    archived_at: row.archived_at ? String(row.archived_at) : null,
  }));
}

export async function getQuoteTemplate(id: string): Promise<QuoteTemplate | null> {
  await requireAuthenticatedAccess();
  const companyId = await requireCompanyId();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quote_templates")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error("템플릿을 불러오지 못했습니다.");
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function saveQuoteTemplate(input: {
  name: string;
  quoteType: QuoteTemplateType;
  quoteMode: QuoteMode;
  tradeOrder: string[];
  items: QuoteTemplateItemPayload[];
}): Promise<QuoteTemplate> {
  const access = await requireAuthenticatedAccess();
  const role = await getCurrentCompanyRole();
  if (!canManageQuoteTemplates(role)) {
    throw new Error("템플릿 저장 권한이 없습니다. (owner/director/admin)");
  }

  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("템플릿명을 입력해 주세요.");
  if (name.length > 120) throw new Error("템플릿명은 120자 이하여야 합니다.");
  if (!(QUOTE_TEMPLATE_TYPES as readonly string[]).includes(input.quoteType)) {
    throw new Error("견적 유형이 올바르지 않습니다.");
  }

  const items = input.items
    .map((item) => normalizeTemplateItem(item))
    .filter((item): item is QuoteTemplateItemPayload => Boolean(item));
  if (items.length === 0) {
    throw new Error("템플릿에 저장할 항목이 없습니다.");
  }

  const tradeOrder =
    input.tradeOrder.length > 0
      ? input.tradeOrder
      : Array.from(new Set(items.map((i) => i.trade_name)));

  const companyId = await requireCompanyId();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quote_templates")
    .insert({
      company_id: companyId,
      name,
      quote_type: input.quoteType,
      quote_mode: input.quoteMode,
      trade_order: tradeOrder,
      items,
      trade_count: tradeOrder.length,
      item_count: items.length,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      error?.message?.includes("quote_templates")
        ? "견적 템플릿 테이블이 아직 없습니다. migration 43을 적용한 뒤 다시 시도해 주세요."
        : "템플릿 저장에 실패했습니다.",
    );
  }
  return mapRow(data as Record<string, unknown>);
}

export async function renameQuoteTemplate(input: {
  id: string;
  name: string;
}): Promise<void> {
  const access = await requireAuthenticatedAccess();
  const role = await getCurrentCompanyRole();
  if (!canManageQuoteTemplates(role)) {
    throw new Error("템플릿 이름 변경 권한이 없습니다.");
  }
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("템플릿명을 입력해 주세요.");
  const companyId = await requireCompanyId();
  const supabase = await createClient();
  const { error } = await supabase
    .from("quote_templates")
    .update({ name, updated_by: access.userId })
    .eq("id", input.id)
    .eq("company_id", companyId)
    .is("archived_at", null);
  if (error) throw new Error("템플릿 이름 변경에 실패했습니다.");
}

export async function archiveQuoteTemplate(id: string): Promise<void> {
  const access = await requireAuthenticatedAccess();
  const role = await getCurrentCompanyRole();
  if (!canManageQuoteTemplates(role)) {
    throw new Error("템플릿 보관 권한이 없습니다.");
  }
  const companyId = await requireCompanyId();
  const supabase = await createClient();
  const { error } = await supabase
    .from("quote_templates")
    .update({
      archived_at: new Date().toISOString(),
      updated_by: access.userId,
    })
    .eq("id", id)
    .eq("company_id", companyId)
    .is("archived_at", null);
  if (error) throw new Error("템플릿 보관에 실패했습니다.");
}
