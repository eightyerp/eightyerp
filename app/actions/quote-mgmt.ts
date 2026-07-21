"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createQuote,
  createQuoteVersion,
  createSignedQuoteFileUrl,
  ensureQuoteShareToken,
  getQuoteById,
  markQuoteSent,
  parseQuoteForm,
  parseQuoteItemsJson,
  setContractQuote,
  softDeleteQuote,
  softDeleteQuoteFile,
  toQuoteSafeError,
  updateQuote,
} from "@/lib/crm/quote-mgmt";
import { buildQuoteGuideMessage } from "@/lib/crm/quote-constants";

export type QuoteActionResult = {
  success: boolean;
  error?: string;
  message?: string;
  quoteId?: string;
  guideMessage?: string;
  signedUrl?: string;
  viewUrl?: string;
};

function collectFiles(formData: FormData, key: string): File[] {
  return formData
    .getAll(key)
    .filter((v): v is File => v instanceof File && v.size > 0);
}

function revalidateQuotes(customerId?: string | null, quoteId?: string | null) {
  revalidatePath("/quotes");
  if (customerId) {
    revalidatePath(`/customers/${customerId}`);
    revalidatePath(`/customers/${customerId}/quotes`);
  }
  if (quoteId) {
    revalidatePath(`/quotes/${quoteId}`);
    revalidatePath(`/quotes/${quoteId}/edit`);
  }
}

export async function createQuoteAction(
  _prev: QuoteActionResult,
  formData: FormData,
): Promise<QuoteActionResult> {
  try {
    const form = parseQuoteForm(formData);
    const items = parseQuoteItemsJson(
      String(formData.get("items_json") ?? ""),
    );
    const requestId = String(formData.get("request_id") ?? "").trim();
    // 서버에서 randomUUID fallback 금지 — 멱등성 무력화 방지
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      return {
        success: false,
        error:
          "생성 요청 ID가 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.",
      };
    }
    const quote = await createQuote({
      form,
      items,
      files: collectFiles(formData, "files"),
      requestId,
    });
    const quoteId = quote.quote_id || quote.id;
    revalidateQuotes(form.customer_id, quoteId);
    redirect(`/quotes/${quoteId}`);
  } catch (error) {
    if (typeof error === "object" && error && "digest" in error) throw error;
    return {
      success: false,
      error: toQuoteSafeError(error, "견적 등록에 실패했습니다."),
    };
  }
}

export async function updateQuoteAction(
  _prev: QuoteActionResult,
  formData: FormData,
): Promise<QuoteActionResult> {
  try {
    const id = String(formData.get("quote_id") ?? "").trim();
    if (!id) return { success: false, error: "견적 ID가 없습니다." };
    const form = parseQuoteForm(formData);
    const items = parseQuoteItemsJson(
      String(formData.get("items_json") ?? ""),
    );
    let removedItemIds: string[] = [];
    try {
      const raw = String(formData.get("removed_item_ids_json") ?? "[]");
      const parsed = JSON.parse(raw || "[]") as unknown;
      if (Array.isArray(parsed)) {
        removedItemIds = parsed.map((x) => String(x ?? "").trim()).filter(Boolean);
      }
    } catch {
      throw new Error("삭제 항목 형식이 올바르지 않습니다.");
    }
    let originalExistingItemIds: string[] = [];
    try {
      const raw = String(formData.get("original_item_ids_json") ?? "[]");
      const parsed = JSON.parse(raw || "[]") as unknown;
      if (Array.isArray(parsed)) {
        originalExistingItemIds = parsed
          .map((x) => String(x ?? "").trim())
          .filter(Boolean);
      }
    } catch {
      throw new Error("기존 항목 ID 형식이 올바르지 않습니다.");
    }
    const quote = await updateQuote({
      id,
      form,
      items,
      removedItemIds,
      originalExistingItemIds,
      files: collectFiles(formData, "files"),
    });
    revalidateQuotes(form.customer_id, quote.id);
    return { success: true, message: "견적이 수정되었습니다.", quoteId: id };
  } catch (error) {
    return {
      success: false,
      error: toQuoteSafeError(error, "견적 수정에 실패했습니다."),
    };
  }
}

export async function createQuoteVersionAction(
  formData: FormData,
): Promise<QuoteActionResult> {
  try {
    const sourceId = String(formData.get("quote_id") ?? "").trim();
    const copyFiles = String(formData.get("copy_files") ?? "") === "1";
    const copyItems = String(formData.get("copy_items") ?? "") === "1";
    const titleSuffix = String(formData.get("title_suffix") ?? "").trim();
    const quote = await createQuoteVersion({
      sourceId,
      copyFiles,
      copyItems,
      titleSuffix: titleSuffix || undefined,
    });
    revalidateQuotes(quote.customer_id, quote.id);
    redirect(`/quotes/${quote.id}/edit`);
  } catch (error) {
    if (typeof error === "object" && error && "digest" in error) throw error;
    return {
      success: false,
      error: toQuoteSafeError(error, "새 버전 생성에 실패했습니다."),
    };
  }
}

export async function deleteQuoteAction(
  formData: FormData,
): Promise<QuoteActionResult> {
  try {
    const id = String(formData.get("quote_id") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const deleteReason = String(formData.get("delete_reason") ?? "").trim();
    const deleted = await softDeleteQuote({ id, deleteReason });
    revalidateQuotes(customerId, deleted.quote_id);
    return {
      success: true,
      message: "견적이 삭제되었습니다.",
      quoteId: deleted.quote_id,
    };
  } catch (error) {
    return {
      success: false,
      error: toQuoteSafeError(error, "견적 삭제에 실패했습니다."),
    };
  }
}

export async function prepareQuoteSendAction(
  formData: FormData,
): Promise<QuoteActionResult> {
  try {
    const id = String(formData.get("quote_id") ?? "").trim();
    const origin = String(formData.get("origin") ?? "").trim().replace(/\/$/, "");
    const quote = await getQuoteById(id);
    if (!quote) return { success: false, error: "견적을 찾을 수 없습니다." };
    const token = await ensureQuoteShareToken(id);
    const viewUrl = `${origin || ""}/customer/quotes/${token}`;
    const guideMessage = buildQuoteGuideMessage({
      customerName: quote.customers?.name || "고객",
      title: quote.title,
      validUntil: quote.valid_until,
      finalAmount: quote.final_amount,
      viewUrl,
      customerMessage: quote.customer_message,
    });
    return { success: true, guideMessage, viewUrl, quoteId: id };
  } catch (error) {
    return {
      success: false,
      error: toQuoteSafeError(error, "발송 안내 준비에 실패했습니다."),
    };
  }
}

export async function markQuoteSentAction(
  formData: FormData,
): Promise<QuoteActionResult> {
  try {
    const id = String(formData.get("quote_id") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    const origin = String(formData.get("origin") ?? "").trim().replace(/\/$/, "");
    const token = await ensureQuoteShareToken(id);
    const fromForm = String(formData.get("view_url") ?? "").trim();
    const viewUrl =
      fromForm || (origin ? `${origin}/customer/quotes/${token}` : null);
    const { quote, guideMessage, viewUrl: resolved } = await markQuoteSent({
      id,
      note: note || null,
      viewUrl,
    });
    revalidateQuotes(quote.customer_id, quote.id);
    return {
      success: true,
      message: "발송완료로 처리되었습니다.",
      guideMessage,
      viewUrl: resolved,
      quoteId: quote.id,
    };
  } catch (error) {
    return {
      success: false,
      error: toQuoteSafeError(error, "발송 처리에 실패했습니다."),
    };
  }
}

export async function deleteQuoteFileAction(
  formData: FormData,
): Promise<QuoteActionResult> {
  try {
    const fileId = String(formData.get("file_id") ?? "").trim();
    const quoteId = String(formData.get("quote_id") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    await softDeleteQuoteFile({ fileId, quoteId });
    revalidateQuotes(customerId, quoteId);
    return { success: true, message: "파일이 삭제되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: toQuoteSafeError(error, "파일 삭제에 실패했습니다."),
    };
  }
}

export async function setContractQuoteAction(
  formData: FormData,
): Promise<QuoteActionResult> {
  try {
    const id = String(formData.get("quote_id") ?? "").trim();
    const quote = await setContractQuote(id);
    revalidateQuotes(quote.customer_id, quote.id);
    return {
      success: true,
      message: "계약 견적으로 지정되었습니다.",
      quoteId: quote.id,
    };
  } catch (error) {
    return {
      success: false,
      error: toQuoteSafeError(error, "계약 견적 지정에 실패했습니다."),
    };
  }
}

export async function getQuoteFileSignedUrlAction(
  filePath: string,
): Promise<QuoteActionResult> {
  try {
    const signedUrl = await createSignedQuoteFileUrl(filePath);
    return { success: true, signedUrl };
  } catch (error) {
    return {
      success: false,
      error: toQuoteSafeError(error, "다운로드 링크 생성에 실패했습니다."),
    };
  }
}
