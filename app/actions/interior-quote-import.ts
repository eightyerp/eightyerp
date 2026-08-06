"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAuthenticatedAccess } from "@/lib/crm/access";
import { INTERIOR_EXCEL_MAX_BYTES } from "@/lib/crm/interior-quote-excel";
import { QUOTE_FILES_BUCKET } from "@/lib/crm/quote-constants";
import { createClient } from "@/lib/supabase-server";

export type InteriorQuoteImportActionResult = {
  success: boolean;
  error?: string;
  quoteId?: string;
  duplicateWarnings?: string[];
  needsDuplicateConfirmation?: boolean;
};

const MIME_BY_EXT = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
} as const;

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

export async function saveInteriorQuoteImportAction(formData: FormData): Promise<InteriorQuoteImportActionResult> {
  let uploadedPath: string | null = null;
  try {
    const access = await requireAuthenticatedAccess();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size <= 0) throw new Error("Excel 파일을 선택해 주세요.");
    if (file.size > INTERIOR_EXCEL_MAX_BYTES) throw new Error("Excel 파일은 15MB 이하여야 합니다.");
    const cleanName = cleanFileName(file.name);
    const ext = cleanName.split(".").pop()?.toLowerCase();
    if (ext !== "xlsx" && ext !== "xls") throw new Error("xlsx 또는 xls 파일만 업로드할 수 있습니다.");
    if (file.type !== MIME_BY_EXT[ext]) throw new Error("Excel MIME 형식이 올바르지 않습니다.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    validateSignature(bytes, ext);
    const fileHash = createHash("sha256").update(bytes).digest("hex");
    const header = parseJsonObject(formData.get("header_json"), "견적 헤더");
    const items = parseItems(formData.get("items_json"));
    const importInfo = parseJsonObject(formData.get("import_json"), "Excel 분석 정보");
    const customerId = String(header.customer_id ?? "");
    const totalAmount = Number((importInfo.parsed_totals as Record<string, unknown> | undefined)?.totalAmount ?? 0);
    if (!customerId) throw new Error("기존 고객을 선택해 주세요.");

    const supabase = await createClient();
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recent, error: duplicateError } = await supabase
      .from("interior_quote_imports")
      .select("source_file_hash, parsed_totals, created_at")
      .eq("customer_id", customerId)
      .gte("created_at", since)
      .limit(20);
    if (duplicateError) throw new Error("인테리어 Excel 마이그레이션 적용 여부를 확인해 주세요.");
    const duplicateWarnings: string[] = [];
    if (recent?.some((row) => row.source_file_hash === fileHash)) duplicateWarnings.push("같은 고객에게 동일한 파일이 최근 업로드되었습니다.");
    if (totalAmount > 0 && recent?.some((row) => Number((row.parsed_totals as Record<string, unknown> | null)?.totalAmount ?? 0) === totalAmount)) {
      duplicateWarnings.push("같은 고객에게 동일 총액의 Excel 견적이 30분 이내 업로드되었습니다.");
    }
    if (duplicateWarnings.length && formData.get("confirm_duplicate") !== "true") {
      return { success: false, duplicateWarnings, needsDuplicateConfirmation: true };
    }

    uploadedPath = `interior-imports/${access.userId}/${randomUUID()}-${cleanName}`;
    const { error: uploadError } = await supabase.storage.from(QUOTE_FILES_BUCKET).upload(uploadedPath, bytes, {
      contentType: MIME_BY_EXT[ext], upsert: false, cacheControl: "3600",
    });
    if (uploadError) throw new Error("원본 Excel 파일 보관에 실패했습니다.");

    const { data, error } = await supabase.rpc("create_interior_quote_from_excel", {
      p_header: { ...header, quote_type: "인테리어" },
      p_items: items,
      p_import: {
        ...importInfo,
        file_path: uploadedPath,
        file_name: cleanName,
        file_hash: fileHash,
        file_size: file.size,
        mime_type: MIME_BY_EXT[ext],
      },
    });
    if (error) throw new Error(error.message || "견적 저장에 실패했습니다.");
    const quoteId = String((data as Record<string, unknown> | null)?.quote_id ?? "");
    if (!quoteId) throw new Error("생성된 견적 ID를 확인할 수 없습니다.");
    revalidatePath("/quotes");
    revalidatePath(`/customers/${customerId}`);
    return { success: true, quoteId };
  } catch (error) {
    if (uploadedPath) {
      try { const supabase = await createClient(); await supabase.storage.from(QUOTE_FILES_BUCKET).remove([uploadedPath]); } catch { /* best-effort orphan cleanup */ }
    }
    return { success: false, error: error instanceof Error ? error.message : "인테리어 견적 저장에 실패했습니다." };
  }
}
