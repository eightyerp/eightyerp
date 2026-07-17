import { createClient } from "@/lib/supabase-server";
import {
  getCurrentUserAccess,
  requireAuthenticatedAccess,
} from "@/lib/crm/access";
import { writeAuditLog } from "@/lib/crm/customers";
import {
  QUOTE_ALLOWED_EXTENSIONS,
  QUOTE_MAX_FILE_BYTES,
  QUOTE_STORAGE_BUCKET,
} from "@/lib/crm/constants";
import type {
  CustomerQuote,
  CustomerQuoteInsert,
  CustomerQuoteSend,
  QuoteBrand,
  QuoteFileType,
  QuoteSendMethod,
  QuoteStatus,
} from "@/types/database";

function emptyToNull(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text ? text : null;
}

function parseAmount(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error("견적금액 형식이 올바르지 않습니다.");
  }
  return Math.round(num);
}

function getFileExtension(fileName: string): QuoteFileType {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!(["pdf", "xlsx", "xls"] as const).includes(ext as QuoteFileType)) {
    throw new Error(
      `허용 파일: ${QUOTE_ALLOWED_EXTENSIONS.join(", ")}`,
    );
  }
  return ext as QuoteFileType;
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^\w.\-()가-힣\s]/g, "_").slice(0, 180);
}

export function parseQuoteFormMeta(formData: FormData): CustomerQuoteInsert {
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const brand = String(formData.get("brand") ?? "LX하우시스").trim() as QuoteBrand;

  if (!customerId) throw new Error("고객 정보가 없습니다.");
  if (!title) throw new Error("견적 제목을 입력해 주세요.");

  return {
    customer_id: customerId,
    brand,
    title,
    amount: parseAmount(formData.get("amount")),
    quote_date: emptyToNull(String(formData.get("quote_date") ?? "")),
    valid_until: emptyToNull(String(formData.get("valid_until") ?? "")),
    assigned_employee_id: emptyToNull(
      String(formData.get("assigned_employee_id") ?? ""),
    ),
    status: (emptyToNull(String(formData.get("status") ?? "")) ||
      "작성중") as QuoteStatus,
    notes: emptyToNull(String(formData.get("notes") ?? "")),
    parent_quote_id: emptyToNull(String(formData.get("parent_quote_id") ?? "")),
    quote_group_id: emptyToNull(String(formData.get("quote_group_id") ?? "")),
  };
}

export async function getCustomerQuotes(
  customerId: string,
): Promise<CustomerQuote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_quotes")
    .select("*, employees ( id, name, title )")
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerQuote[];
}

export async function getQuoteSends(
  quoteId: string,
): Promise<CustomerQuoteSend[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_quote_sends")
    .select("*")
    .eq("quote_id", quoteId)
    .order("sent_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerQuoteSend[];
}

export async function createSignedQuoteUrl(
  filePath: string,
  expiresInSeconds = 60 * 10,
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(QUOTE_STORAGE_BUCKET)
    .createSignedUrl(filePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "파일 URL을 생성하지 못했습니다.");
  }
  return data.signedUrl;
}

export async function uploadCustomerQuote(input: {
  meta: CustomerQuoteInsert;
  file: File;
}): Promise<CustomerQuote> {
  const access = await getCurrentUserAccess();
  if (!access.isAuthenticated || !access.userId) {
    throw new Error("로그인이 필요합니다.");
  }

  const file = input.file;
  if (!file || file.size <= 0) throw new Error("견적 파일을 선택해 주세요.");
  if (file.size > QUOTE_MAX_FILE_BYTES) {
    throw new Error("파일 크기는 50MB 이하여야 합니다.");
  }

  const fileType = getFileExtension(file.name);
  const safeName = sanitizeFileName(file.name);
  const supabase = await createClient();

  let quoteGroupId = input.meta.quote_group_id || crypto.randomUUID();
  let version = 1;
  let parentQuoteId = input.meta.parent_quote_id || null;

  if (parentQuoteId) {
    const { data: parent, error: parentError } = await supabase
      .from("customer_quotes")
      .select("id, quote_group_id, version, customer_id")
      .eq("id", parentQuoteId)
      .is("deleted_at", null)
      .maybeSingle();

    if (parentError) throw new Error(parentError.message);
    if (!parent) throw new Error("원본 견적을 찾을 수 없습니다.");
    if (parent.customer_id !== input.meta.customer_id) {
      throw new Error("고객 정보가 일치하지 않습니다.");
    }

    quoteGroupId = parent.quote_group_id;
    version = (parent.version ?? 1) + 1;

    const { data: latest } = await supabase
      .from("customer_quotes")
      .select("version")
      .eq("quote_group_id", quoteGroupId)
      .is("deleted_at", null)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest?.version && latest.version >= version) {
      version = latest.version + 1;
    }
  }

  const quoteId = crypto.randomUUID();
  const filePath = `${input.meta.customer_id}/${quoteGroupId}/v${version}_${quoteId}_${safeName}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(QUOTE_STORAGE_BUCKET)
    .upload(filePath, bytes, {
      contentType: file.type || undefined,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message || "파일 업로드에 실패했습니다.");
  }

  const { data, error } = await supabase
    .from("customer_quotes")
    .insert({
      id: quoteId,
      customer_id: input.meta.customer_id,
      quote_category: "창호",
      brand: input.meta.brand,
      title: input.meta.title,
      amount: input.meta.amount ?? null,
      quote_date: input.meta.quote_date ?? null,
      valid_until: input.meta.valid_until ?? null,
      assigned_employee_id: input.meta.assigned_employee_id ?? null,
      file_name: safeName,
      file_path: filePath,
      file_type: fileType,
      file_size: file.size,
      quote_group_id: quoteGroupId,
      version,
      parent_quote_id: parentQuoteId,
      is_final: false,
      status: input.meta.status ?? "작성중",
      notes: input.meta.notes ?? null,
      created_by: access.userId,
    })
    .select("*, employees ( id, name, title )")
    .single();

  if (error) {
    await supabase.storage.from(QUOTE_STORAGE_BUCKET).remove([filePath]);
    throw new Error(error.message);
  }

  await writeAuditLog({
    entity_type: "customer_quote",
    entity_id: quoteId,
    action: parentQuoteId ? "upload_revision" : "upload",
    payload: {
      customer_id: input.meta.customer_id,
      file_name: safeName,
      file_path: filePath,
      version,
      quote_group_id: quoteGroupId,
    },
  });

  return data as CustomerQuote;
}

export async function updateCustomerQuoteMeta(input: {
  quote_id: string;
  title?: string;
  brand?: QuoteBrand;
  amount?: number | null;
  quote_date?: string | null;
  valid_until?: string | null;
  assigned_employee_id?: string | null;
  status?: QuoteStatus;
  notes?: string | null;
}): Promise<CustomerQuote> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};

  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.brand !== undefined) patch.brand = input.brand;
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.quote_date !== undefined) patch.quote_date = input.quote_date;
  if (input.valid_until !== undefined) patch.valid_until = input.valid_until;
  if (input.assigned_employee_id !== undefined) {
    patch.assigned_employee_id = input.assigned_employee_id;
  }
  if (input.status !== undefined) patch.status = input.status;
  if (input.notes !== undefined) patch.notes = input.notes;

  const { data, error } = await supabase
    .from("customer_quotes")
    .update(patch)
    .eq("id", input.quote_id)
    .is("deleted_at", null)
    .select("*, employees ( id, name, title )")
    .single();

  if (error) throw new Error(error.message);

  await writeAuditLog({
    entity_type: "customer_quote",
    entity_id: input.quote_id,
    action: "update_meta",
    payload: patch,
  });

  return data as CustomerQuote;
}

export async function setFinalCustomerQuote(quoteId: string): Promise<CustomerQuote> {
  const supabase = await createClient();
  const { data: quote, error } = await supabase
    .from("customer_quotes")
    .select("*")
    .eq("id", quoteId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!quote) throw new Error("견적을 찾을 수 없습니다.");

  const { error: clearError } = await supabase
    .from("customer_quotes")
    .update({ is_final: false })
    .eq("quote_group_id", quote.quote_group_id)
    .is("deleted_at", null);

  if (clearError) throw new Error(clearError.message);

  const { data, error: setError } = await supabase
    .from("customer_quotes")
    .update({ is_final: true, status: "최종견적" })
    .eq("id", quoteId)
    .select("*, employees ( id, name, title )")
    .single();

  if (setError) throw new Error(setError.message);

  await writeAuditLog({
    entity_type: "customer_quote",
    entity_id: quoteId,
    action: "set_final",
    payload: {
      quote_group_id: quote.quote_group_id,
      version: quote.version,
    },
  });

  return data as CustomerQuote;
}

/**
 * 계약 모듈 연결용.
 * contracts 테이블 생성 후 linked_contract_id 에 FK를 추가하면 됩니다.
 */
export async function linkQuoteToContract(input: {
  quote_id: string;
  contract_id: string;
}): Promise<CustomerQuote> {
  const supabase = await createClient();

  const { data: quote, error } = await supabase
    .from("customer_quotes")
    .select("*")
    .eq("id", input.quote_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!quote) throw new Error("견적을 찾을 수 없습니다.");

  if (!quote.is_final) {
    await setFinalCustomerQuote(input.quote_id);
  }

  const { data, error: linkError } = await supabase
    .from("customer_quotes")
    .update({
      linked_contract_id: input.contract_id,
      status: "계약전환",
      is_final: true,
    })
    .eq("id", input.quote_id)
    .select("*, employees ( id, name, title )")
    .single();

  if (linkError) throw new Error(linkError.message);

  await writeAuditLog({
    entity_type: "customer_quote",
    entity_id: input.quote_id,
    action: "link_contract",
    payload: { contract_id: input.contract_id },
  });

  return data as CustomerQuote;
}

export async function recordQuoteSend(input: {
  quote_id: string;
  send_method: QuoteSendMethod;
  recipient?: string | null;
  note?: string | null;
  sent_at?: string | null;
}): Promise<CustomerQuoteSend> {
  const access = await getCurrentUserAccess();
  if (!access.userId) throw new Error("로그인이 필요합니다.");

  const supabase = await createClient();
  const { data: quote, error } = await supabase
    .from("customer_quotes")
    .select("id, customer_id, status")
    .eq("id", input.quote_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!quote) throw new Error("견적을 찾을 수 없습니다.");

  const { data, error: sendError } = await supabase
    .from("customer_quote_sends")
    .insert({
      quote_id: input.quote_id,
      customer_id: quote.customer_id,
      send_method: input.send_method,
      recipient: input.recipient ?? null,
      note: input.note ?? null,
      sent_at: input.sent_at || new Date().toISOString(),
      provider: null,
      provider_status: "recorded",
      provider_payload: {
        channel: input.send_method,
        integration: "manual_record",
        // 향후: twilio / alimtalk / smtp 등 provider 필드로 확장
      },
      created_by: access.userId,
    })
    .select("*")
    .single();

  if (sendError) throw new Error(sendError.message);

  if (quote.status === "작성중" || quote.status === "수정요청") {
    await supabase
      .from("customer_quotes")
      .update({ status: "고객발송" })
      .eq("id", input.quote_id);
  }

  await writeAuditLog({
    entity_type: "customer_quote_send",
    entity_id: data.id,
    action: "record_send",
    payload: {
      quote_id: input.quote_id,
      send_method: input.send_method,
      recipient: input.recipient ?? null,
    },
  });

  return data as CustomerQuoteSend;
}

/**
 * 견적서 삭제 — 모든 로그인 직원 가능 (고객/자재 삭제와 권한 분리).
 * DB soft-delete + Storage 파일 삭제 + audit_logs 기록.
 */
export async function deleteCustomerQuote(input: {
  quoteId: string;
  deleteReason: string;
}): Promise<void> {
  const access = await requireAuthenticatedAccess();
  const reason = input.deleteReason.trim();
  if (!reason) {
    throw new Error("삭제 사유를 입력해 주세요.");
  }

  const supabase = await createClient();

  const { data: quote, error } = await supabase
    .from("customer_quotes")
    .select("*, customers ( id, name )")
    .eq("id", input.quoteId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!quote) throw new Error("견적을 찾을 수 없습니다.");

  const customerName =
    (quote as { customers?: { name?: string } | null }).customers?.name ?? null;
  const deletedAt = new Date().toISOString();
  const actorName = access.profile?.employees?.name ?? access.userId;

  const { error: softError } = await supabase
    .from("customer_quotes")
    .update({
      deleted_at: deletedAt,
      deleted_by: access.userId,
      delete_reason: reason,
      is_final: false,
    })
    .eq("id", input.quoteId);

  if (softError) throw new Error(softError.message);

  const { error: storageError } = await supabase.storage
    .from(QUOTE_STORAGE_BUCKET)
    .remove([quote.file_path]);

  await writeAuditLog({
    entity_type: "customer_quote",
    entity_id: input.quoteId,
    action: "delete",
    payload: {
      permission_scope: "quote_delete_authenticated_staff",
      actor_user_id: access.userId,
      actor_name: actorName,
      actor_role: access.role,
      deleted_at: deletedAt,
      customer_id: quote.customer_id,
      customer_name: customerName,
      quote_id: quote.id,
      quote_title: quote.title,
      quote_category: quote.quote_category,
      file_name: quote.file_name,
      file_path: quote.file_path,
      amount: quote.amount,
      version: quote.version,
      delete_reason: reason,
      storage_removed: !storageError,
      storage_error: storageError?.message ?? null,
    },
  });
}
