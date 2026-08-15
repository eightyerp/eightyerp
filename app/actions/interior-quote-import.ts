"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { INTERIOR_EXCEL_MAX_BYTES } from "@/lib/crm/interior-quote-excel";
import { QUOTE_FILES_BUCKET } from "@/lib/crm/quote-constants";
import { createQuote, type QuoteItemInput } from "@/lib/crm/quote-mgmt";
import { createClient } from "@/lib/supabase-server";

export type InteriorQuoteImportActionResult = {
  success: boolean;
  error?: string;
  quoteId?: string;
  duplicateWarnings?: string[];
  needsDuplicateConfirmation?: boolean;
};

class InteriorImportValidationError extends Error {}

function validationError(message: string): never {
  throw new InteriorImportValidationError(message);
}

const MIME_BY_EXT = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
} as const;

const ACCEPTED_EXCEL_MIME_TYPES = new Set([
  MIME_BY_EXT.xlsx,
  MIME_BY_EXT.xls,
  "application/octet-stream",
  "application/x-ole-storage",
  "application/vnd.ms-office",
  "",
]);

function cleanFileName(name: string): string {
  const normalized = name.normalize("NFKC").replace(/[^0-9A-Za-z가-힣._-]+/g, "-").replace(/-+/g, "-");
  return normalized.slice(-120) || "interior-quote.xlsx";
}

function validateSignature(bytes: Uint8Array, ext: "xlsx" | "xls") {
  const xlsx = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const xls = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((value, index) => bytes[index] === value);
  if ((ext === "xlsx" && !xlsx) || (ext === "xls" && !xls)) throw new Error("파일 내용과 Excel 확장자가 일치하지 않습니다.");
}

function parseJsonObject(value: FormDataEntryValue | null, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value ?? "")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`${label} 형식이 올바르지 않습니다.`);
  }
}

function parseItems(value: FormDataEntryValue | null): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(String(value ?? "")) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 2000) throw new Error();
    return parsed as Array<Record<string, unknown>>;
  } catch {
    throw new Error("견적 항목 형식이 올바르지 않습니다.");
  }
}

function finiteNonnegative(value: unknown, label: string): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) validationError(`${label}은 0 이상의 숫자여야 합니다.`);
  return parsed;
}

function finiteMoney(value: unknown, label: string): number {
  const parsed = finiteNonnegative(value, label);
  return Math.round(parsed);
}

function safeSaveError(error: unknown): string {
  const message = error instanceof Error ? error.message : "알 수 없는 서버 오류";
  if (error instanceof InteriorImportValidationError) return message;
  if (/permission|forbidden|unauthorized|권한|접근할 수 없/i.test(message)) {
    return "견적을 저장할 권한이 없습니다. 고객과 담당 직원의 권한 범위를 확인해 주세요.";
  }
  if (/고객을 선택|담당 직원|유상 품목|총액|견적 항목|마이그레이션/i.test(message)) {
    return message;
  }
  const summary = /[가-힣]/.test(message) && message.length <= 180
    ? message
    : "서버 저장 요청을 처리하지 못했습니다. 관리자 로그를 확인해 주세요.";
  return `견적 저장에 실패했습니다: ${summary}`;
}

/**
 * 인테리어 Excel 원본을 견적에 멱등적으로 연결한다.
 *
 * create_quote_with_items는 request_id로 재생(replay)될 수 있으므로 원본 파일도
 * 동일 SHA-256 경로를 사용해야 "DB 견적 생성 후 Storage 실패 → 같은 요청 재시도"가
 * 안전하게 복구된다. 공통 createQuote의 created-only 첨부 업로드를 사용하지 않는 이유다.
 */
async function ensureInteriorImportFile(input: {
  customerId: string;
  quoteId: string;
  fileName: string;
  fileHash: string;
  fileSize: number;
  ext: "xlsx" | "xls";
  bytes: Uint8Array;
}) {
  const supabase = await createClient();
  const filePath = `${input.customerId}/${input.quoteId}/interior-import-${input.fileHash}.${input.ext}`;

  const { data: alreadyLinked, error: linkedError } = await supabase
    .from("quote_files")
    .select("id,file_path")
    .eq("quote_id", input.quoteId)
    .eq("file_path", filePath)
    .is("deleted_at", null)
    .maybeSingle();
  if (linkedError) {
    throw new Error("원본 Excel 연결 상태를 확인하지 못했습니다.");
  }
  if (alreadyLinked) return;

  const prefix = `${input.customerId}/${input.quoteId}/interior-import-`;
  const { data: otherImport, error: otherImportError } = await supabase
    .from("quote_files")
    .select("id,file_path")
    .eq("quote_id", input.quoteId)
    .like("file_path", `${prefix}%`)
    .is("deleted_at", null)
    .limit(1);
  if (otherImportError) {
    throw new Error("기존 Excel 원본을 확인하지 못했습니다.");
  }
  if ((otherImport ?? []).some((row) => row.file_path && row.file_path !== filePath)) {
    throw new Error(
      "같은 저장 요청에 다른 Excel 파일이 연결되어 있습니다. 화면을 새로고침한 뒤 다시 저장해 주세요.",
    );
  }

  const { error: uploadError } = await supabase.storage
    .from(QUOTE_FILES_BUCKET)
    .upload(filePath, input.bytes, {
      contentType: MIME_BY_EXT[input.ext],
      upsert: true,
    });
  if (uploadError) {
    throw new Error(
      "견적은 임시 저장되었지만 원본 Excel 업로드에 실패했습니다. 같은 화면에서 다시 저장해 주세요.",
    );
  }

  const { error: metadataError } = await supabase.from("quote_files").insert({
    quote_id: input.quoteId,
    file_type: input.ext,
    file_path: filePath,
    file_name: input.fileName,
    original_file_name: input.fileName,
    mime_type: MIME_BY_EXT[input.ext],
    file_size: input.fileSize,
    is_primary: false,
  });

  if (metadataError) {
    // DB 메타데이터가 실패하면 고아 Storage 객체를 남기지 않는다.
    await supabase.storage.from(QUOTE_FILES_BUCKET).remove([filePath]);
    throw new Error(
      "견적은 임시 저장되었지만 원본 Excel 정보를 연결하지 못했습니다. 같은 화면에서 다시 저장해 주세요.",
    );
  }
}

export async function saveInteriorQuoteImportAction(formData: FormData): Promise<InteriorQuoteImportActionResult> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size <= 0) throw new Error("Excel 파일을 선택해 주세요.");
    if (file.size > INTERIOR_EXCEL_MAX_BYTES) throw new Error("Excel 파일은 15MB 이하여야 합니다.");
    const cleanName = cleanFileName(file.name);
    const ext = cleanName.split(".").pop()?.toLowerCase();
    if (ext !== "xlsx" && ext !== "xls") throw new Error("xlsx 또는 xls 파일만 업로드할 수 있습니다.");
    if (!ACCEPTED_EXCEL_MIME_TYPES.has(file.type)) {
      throw new Error("Excel MIME 형식이 올바르지 않습니다.");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    validateSignature(bytes, ext);
    const fileHash = createHash("sha256").update(bytes).digest("hex");
    const header = parseJsonObject(formData.get("header_json"), "견적 헤더");
    const items = parseItems(formData.get("items_json"));
    const customerId = String(header.customer_id ?? "").trim();
    const employeeId = String(header.assigned_employee_id ?? "").trim();
    if (!customerId) validationError("고객을 선택해 주세요.");
    if (!employeeId) validationError("담당 직원을 선택해 주세요.");
    if (String(header.quote_type ?? "") !== "인테리어") validationError("견적 유형이 올바르지 않습니다.");

    const normalizedItems = items.map((item, index) => {
      const itemName = String(item.item_name ?? "").trim();
      const description = String(item.description ?? "").trim();
      if (!itemName && !description) validationError(`${index + 1}번째 품목의 품목명 또는 설명이 필요합니다.`);
      return {
        ...item,
        item_name: itemName || null,
        description: description || null,
        quantity: finiteNonnegative(item.quantity, `${index + 1}번째 품목 수량`),
        unit_price: finiteMoney(item.unit_price, `${index + 1}번째 품목 단가`),
        amount: finiteMoney(item.amount, `${index + 1}번째 품목 금액`),
      };
    }) as unknown as QuoteItemInput[];
    const paidItemCount = normalizedItems.filter((item) => item.amount > 0).length;
    const referenceItemCount = normalizedItems.length - paidItemCount;
    if (paidItemCount === 0) validationError("유효한 유상 품목이 1개 이상 필요합니다.");
    const subtotal = normalizedItems.reduce((sum, item) => sum + item.amount, 0);
    const headerSubtotal = finiteMoney(header.total_amount, "품목 소계");
    if (Math.abs(subtotal - headerSubtotal) > 1) validationError("저장 품목 소계와 화면 계산 소계가 일치하지 않습니다.");
    const discount = finiteMoney(header.discount_amount, "할인 금액");
    const supply = finiteMoney(header.supply_amount, "공급가");
    const vat = finiteMoney(header.vat_amount, "부가세");
    const total = finiteMoney(header.customer_total_amount, "총액");
    if (Math.abs(supply + vat - total) > 1) validationError("공급가·부가세·총액이 일치하지 않습니다.");

    console.info("[interior-quote-import] save-attempt", {
      customerId,
      assignedEmployeeId: employeeId,
      quoteType: "인테리어",
      itemCount: normalizedItems.length,
      referenceItemCount,
      subtotal,
      vat,
      discount,
      total,
      fileHashPrefix: fileHash.slice(0, 12),
    });
    const quote = await createQuote({
      requestId: String(header.request_id ?? ""),
      form: {
        customer_id: customerId, project_id: null, quote_type: "인테리어", quote_mode: "detailed",
        title: String(header.title ?? "인테리어 견적"), quote_number: null, status: "작성중",
        total_amount: subtotal, discount_amount: discount,
        lx_discount_rate: 0, final_amount: Number(header.final_amount ?? 0), valid_until: null,
        issued_at: String(header.issued_at ?? ""), assigned_employee_id: employeeId,
        is_contract_quote: false, customer_message: null, memo: `Excel Import · SHA-256 ${fileHash.slice(0, 12)}`,
      },
      items: normalizedItems,
      // 원본 Excel은 아래 멱등 연결 단계에서 처리한다. createQuote의 created-only 첨부를 사용하면
      // Storage 실패 후 request_id replay 시 파일이 영구 누락될 수 있다.
      files: [],
    });
    const quoteId = quote.quote_id || quote.id;
    if (!quoteId) throw new Error("생성된 견적 ID를 확인할 수 없습니다.");

    await ensureInteriorImportFile({
      customerId,
      quoteId,
      fileName: cleanName,
      fileHash,
      fileSize: file.size,
      ext,
      bytes,
    });

    revalidatePath("/quotes");
    revalidatePath(`/customers/${customerId}`);
    return { success: true, quoteId };
  } catch (error) {
    const detail = error as Error & { code?: string; details?: string; hint?: string };
    console.error("[interior-quote-import] save-failed", {
      name: detail?.name ?? null,
      message: detail?.message ?? String(error),
      code: detail?.code ?? null,
      details: detail?.details ?? null,
      hint: detail?.hint ?? null,
    });
    return { success: false, error: safeSaveError(error) };
  }
}
