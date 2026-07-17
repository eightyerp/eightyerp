"use server";

import { revalidatePath } from "next/cache";
import {
  createSignedQuoteUrl,
  deleteCustomerQuote,
  parseQuoteFormMeta,
  recordQuoteSend,
  setFinalCustomerQuote,
  updateCustomerQuoteMeta,
  uploadCustomerQuote,
} from "@/lib/crm/quotes";
import type { QuoteBrand, QuoteSendMethod, QuoteStatus } from "@/types/database";

export type QuoteActionResult = {
  success: boolean;
  error?: string;
  message?: string;
  signedUrl?: string;
  quoteId?: string;
};

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

export async function uploadQuoteAction(
  _prev: QuoteActionResult,
  formData: FormData,
): Promise<QuoteActionResult> {
  try {
    const meta = parseQuoteFormMeta(formData);
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false, error: "견적 파일을 선택해 주세요." };
    }

    const quote = await uploadCustomerQuote({ meta, file });
    revalidatePath(`/customers/${meta.customer_id}`);
    revalidatePath("/customers");
    return {
      success: true,
      message: `창호 견적서 v${quote.version}이(가) 업로드되었습니다.`,
      quoteId: quote.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "업로드에 실패했습니다.",
    };
  }
}

export async function updateQuoteMetaAction(
  _prev: QuoteActionResult,
  formData: FormData,
): Promise<QuoteActionResult> {
  try {
    const quoteId = String(formData.get("quote_id") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    if (!quoteId) return { success: false, error: "견적 ID가 없습니다." };

    const amountRaw = String(formData.get("amount") ?? "").replace(/,/g, "").trim();
    let amount: number | null | undefined = undefined;
    if (formData.has("amount")) {
      if (!amountRaw) amount = null;
      else {
        const num = Number(amountRaw);
        if (!Number.isFinite(num)) {
          return { success: false, error: "견적금액 형식이 올바르지 않습니다." };
        }
        amount = Math.round(num);
      }
    }

    await updateCustomerQuoteMeta({
      quote_id: quoteId,
      title: String(formData.get("title") ?? "").trim() || undefined,
      brand: (emptyToNull(formData.get("brand")) as QuoteBrand | null) || undefined,
      amount,
      quote_date: emptyToNull(formData.get("quote_date")),
      valid_until: emptyToNull(formData.get("valid_until")),
      assigned_employee_id: emptyToNull(formData.get("assigned_employee_id")),
      status: (emptyToNull(formData.get("status")) as QuoteStatus | null) || undefined,
      notes: emptyToNull(formData.get("notes")),
    });

    if (customerId) revalidatePath(`/customers/${customerId}`);
    return { success: true, message: "견적 정보가 수정되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "수정에 실패했습니다.",
    };
  }
}

export async function setFinalQuoteAction(
  _prev: QuoteActionResult,
  formData: FormData,
): Promise<QuoteActionResult> {
  try {
    const quoteId = String(formData.get("quote_id") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    if (!quoteId) return { success: false, error: "견적 ID가 없습니다." };

    await setFinalCustomerQuote(quoteId);
    if (customerId) revalidatePath(`/customers/${customerId}`);
    return { success: true, message: "최종본으로 지정되었습니다." };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "최종본 지정에 실패했습니다.",
    };
  }
}

export async function recordQuoteSendAction(
  _prev: QuoteActionResult,
  formData: FormData,
): Promise<QuoteActionResult> {
  try {
    const quoteId = String(formData.get("quote_id") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const sendMethod = String(formData.get("send_method") ?? "").trim();

    if (!quoteId || !sendMethod) {
      return { success: false, error: "발송 방법과 견적을 선택해 주세요." };
    }

    const sentAtRaw = emptyToNull(formData.get("sent_at"));
    const sentAt = sentAtRaw
      ? new Date(sentAtRaw).toISOString()
      : null;

    await recordQuoteSend({
      quote_id: quoteId,
      send_method: sendMethod as QuoteSendMethod,
      recipient: emptyToNull(formData.get("recipient")),
      note: emptyToNull(formData.get("note")),
      sent_at: sentAt,
    });

    if (customerId) revalidatePath(`/customers/${customerId}`);
    return {
      success: true,
      message: "발송기록이 저장되었습니다. (실제 발송 API는 추후 연결)",
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "발송기록 저장에 실패했습니다.",
    };
  }
}

export async function deleteQuoteAction(
  _prev: QuoteActionResult,
  formData: FormData,
): Promise<QuoteActionResult> {
  try {
    const quoteId = String(formData.get("quote_id") ?? "").trim();
    const customerId = String(formData.get("customer_id") ?? "").trim();
    const deleteReason = String(formData.get("delete_reason") ?? "").trim();
    if (!quoteId) return { success: false, error: "견적 ID가 없습니다." };
    if (!deleteReason) {
      return { success: false, error: "삭제 사유를 입력해 주세요." };
    }

    await deleteCustomerQuote({ quoteId, deleteReason });
    if (customerId) revalidatePath(`/customers/${customerId}`);
    return { success: true, message: "견적서가 삭제되었습니다." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "삭제에 실패했습니다.",
    };
  }
}

export async function getQuoteSignedUrlAction(
  quoteId: string,
  customerId: string,
  filePath: string,
): Promise<QuoteActionResult> {
  try {
    if (!quoteId || !filePath) {
      return { success: false, error: "파일 정보가 없습니다." };
    }
    // Ensure caller path belongs to this customer folder
    if (!filePath.startsWith(`${customerId}/`)) {
      return { success: false, error: "파일 접근 권한이 없습니다." };
    }

    const signedUrl = await createSignedQuoteUrl(filePath);
    return { success: true, signedUrl };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "미리보기 URL 생성에 실패했습니다.",
    };
  }
}
