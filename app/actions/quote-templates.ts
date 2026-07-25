"use server";

import { revalidatePath } from "next/cache";
import {
  canManageQuoteTemplates,
  getCurrentCompanyRole,
  getQuoteTemplate,
  listQuoteTemplates,
  renameQuoteTemplate,
  archiveQuoteTemplate,
  saveQuoteTemplate,
  QUOTE_TEMPLATE_TYPES,
} from "@/lib/crm/quote-templates";
import type {
  QuoteTemplateItemPayload,
  QuoteTemplateType,
} from "@/lib/crm/quote-template-shared";
import type { QuoteMode } from "@/lib/crm/quote-constants";
import { toQuoteSafeError } from "@/lib/crm/quote-mgmt";

export type QuoteTemplateActionResult = {
  success: boolean;
  error?: string;
  message?: string;
  templateId?: string;
  templatesJson?: string;
  templateJson?: string;
  canManage?: boolean;
};

export async function listQuoteTemplatesAction(input?: {
  query?: string;
  quoteType?: QuoteTemplateType | "전체";
}): Promise<QuoteTemplateActionResult> {
  try {
    const [templates, role] = await Promise.all([
      listQuoteTemplates(input),
      getCurrentCompanyRole(),
    ]);
    return {
      success: true,
      templatesJson: JSON.stringify(templates),
      canManage: canManageQuoteTemplates(role),
    };
  } catch (e) {
    return { success: false, error: toQuoteSafeError(e) };
  }
}

export async function getQuoteTemplateAction(
  id: string,
): Promise<QuoteTemplateActionResult> {
  try {
    const template = await getQuoteTemplate(id);
    if (!template || template.archived_at) {
      return { success: false, error: "템플릿을 찾을 수 없습니다." };
    }
    return {
      success: true,
      templateId: template.id,
      templateJson: JSON.stringify(template),
    };
  } catch (e) {
    return { success: false, error: toQuoteSafeError(e) };
  }
}

export async function saveQuoteTemplateAction(input: {
  name: string;
  quoteType: string;
  quoteMode: string;
  tradeOrder: string[];
  items: QuoteTemplateItemPayload[];
}): Promise<QuoteTemplateActionResult> {
  try {
    if (!(QUOTE_TEMPLATE_TYPES as readonly string[]).includes(input.quoteType)) {
      return { success: false, error: "견적 유형이 올바르지 않습니다." };
    }
    const mode = (
      input.quoteMode === "simple" ? "simple" : "detailed"
    ) as QuoteMode;
    const saved = await saveQuoteTemplate({
      name: input.name,
      quoteType: input.quoteType as QuoteTemplateType,
      quoteMode: mode,
      tradeOrder: input.tradeOrder,
      items: input.items,
    });
    revalidatePath("/quotes");
    return {
      success: true,
      message: "템플릿으로 저장되었습니다.",
      templateId: saved.id,
    };
  } catch (e) {
    return { success: false, error: toQuoteSafeError(e) };
  }
}

export async function renameQuoteTemplateAction(input: {
  id: string;
  name: string;
}): Promise<QuoteTemplateActionResult> {
  try {
    await renameQuoteTemplate(input);
    return { success: true, message: "템플릿 이름을 변경했습니다." };
  } catch (e) {
    return { success: false, error: toQuoteSafeError(e) };
  }
}

export async function archiveQuoteTemplateAction(
  id: string,
): Promise<QuoteTemplateActionResult> {
  try {
    await archiveQuoteTemplate(id);
    return { success: true, message: "템플릿을 보관 처리했습니다." };
  } catch (e) {
    return { success: false, error: toQuoteSafeError(e) };
  }
}
