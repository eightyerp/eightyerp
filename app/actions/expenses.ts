"use server";

import { createHash, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { analyzeExpenseDocumentWithAi } from "@/lib/crm/receipt-ai";
import {
  approveExpenseRequest,
  approveVendor,
  attachExpenseDocument,
  cancelExpenseRequest,
  checkExpenseDocumentDuplicate,
  findOrCreateVendorCandidate,
  getExpenseAccess,
  listMyExpenseNotifications,
  markExpensePaid,
  rejectExpenseRequest,
  registerExpenseRequest,
} from "@/lib/crm/expenses";
import { enqueueNotificationEvent } from "@/lib/crm/notifications";
import type {
  ExpenseDocumentAnalysis,
  ExpenseDocumentType,
  ExpenseNotificationItem,
  ExpensePaymentMethod,
} from "@/lib/crm/expense-shared";

export type ExpenseActionResult = { success: boolean; message?: string; error?: string; expenseId?: string };
export type ExpenseAnalysisResult = {
  success: boolean;
  analysis?: ExpenseDocumentAnalysis;
  duplicate?: boolean;
  error?: string;
};

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function intMoney(value: FormDataEntryValue | null, label: string): number {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) throw new Error(`${label}은 원 단위 정수로 입력해 주세요.`);
  return n;
}

function assertDocument(file: File) {
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) throw new Error("증빙 파일은 15MB 이하만 등록할 수 있습니다.");
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) throw new Error("증빙은 JPG, PNG, WEBP, PDF만 등록할 수 있습니다.");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function extFor(file: File): string {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "pdf"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function documentType(value: FormDataEntryValue | null): ExpenseDocumentType {
  const raw = String(value ?? "receipt");
  return ["receipt", "transaction_statement", "invoice", "other"].includes(raw)
    ? (raw as ExpenseDocumentType)
    : "receipt";
}

async function expenseNotificationContext(expenseId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("expense_requests").select(`
    id, customer_id, project_id, description, total_amount, status, vendor_name_snapshot,
    requested_by_employee_id,
    requested_employee:employees!expense_requests_requested_by_employee_id_fkey ( id, name, title, phone, email )
  `).eq("id", expenseId).maybeSingle();
  if (!data) return null;
  const employee = Array.isArray(data.requested_employee) ? data.requested_employee[0] ?? null : data.requested_employee;
  return { ...data, requested_employee: employee };
}

async function pushExpenseEvent(eventType: "expense_requested" | "expense_approved" | "expense_paid", expenseId: string) {
  const row = await expenseNotificationContext(expenseId);
  if (!row) return;
  const employee = row.requested_employee;
  const requesterName = employee ? [employee.name, employee.title].filter(Boolean).join(" ") : "직원";
  await enqueueNotificationEvent({
    event_type: eventType,
    customer_id: row.customer_id,
    project_id: row.project_id,
    recipient: eventType === "expense_requested" ? null : employee?.phone || employee?.email || null,
    body: `[에잇티 지출] ${requesterName} / ${row.vendor_name_snapshot ?? "거래처"} / ${Number(row.total_amount).toLocaleString("ko-KR")}원`,
    payload: {
      target: eventType === "expense_requested" ? "finance_admins" : "requester",
      expense_id: row.id,
      requester_employee_id: row.requested_by_employee_id,
      requester_name: requesterName,
      vendor_name: row.vendor_name_snapshot,
      description: row.description,
      amount: row.total_amount,
      status: row.status,
    },
  });
}

export async function analyzeExpenseDocumentAction(formData: FormData): Promise<ExpenseAnalysisResult> {
  try {
    await getExpenseAccess();
    const file = formData.get("document");
    if (!(file instanceof File)) throw new Error("영수증 또는 거래명세서를 선택해 주세요.");
    assertDocument(file);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const digest = sha256(bytes);
    if (await checkExpenseDocumentDuplicate(digest)) {
      return { success: false, duplicate: true, error: "같은 증빙 파일이 이미 등록되어 있습니다. 중복 지출 여부를 확인해 주세요." };
    }
    const ai = await analyzeExpenseDocumentWithAi(file);
    if (!ai.available) return { success: false, duplicate: false, error: ai.error };
    return { success: true, duplicate: false, analysis: ai.analysis };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "증빙 자동인식에 실패했습니다." };
  }
}

export async function registerExpenseRequestAction(_prev: ExpenseActionResult, formData: FormData): Promise<ExpenseActionResult> {
  let uploadedPath: string | null = null;
  try {
    const access = await getExpenseAccess();
    const projectId = String(formData.get("project_id") ?? "").trim();
    if (!projectId) throw new Error("현장을 반드시 선택해 주세요.");
    const category = String(formData.get("category") ?? "").trim();
    const paymentMethod = String(formData.get("payment_method") ?? "") as ExpensePaymentMethod;
    const description = String(formData.get("description") ?? "").trim();
    if (!description) throw new Error("지출 내용을 입력해 주세요.");
    const supplyAmount = intMoney(formData.get("supply_amount"), "공급가");
    const vatAmount = intMoney(formData.get("vat_amount"), "부가세");
    const totalAmount = intMoney(formData.get("total_amount"), "합계");
    if (totalAmount <= 0 || supplyAmount + vatAmount !== totalAmount) throw new Error("공급가 + 부가세 = 합계가 되도록 금액을 확인해 주세요.");
    const expenseDate = String(formData.get("expense_date") ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) throw new Error("지출일을 선택해 주세요.");
    const paymentDueDate = String(formData.get("payment_due_date") ?? "").trim() || null;
    const vendorName = String(formData.get("vendor_name") ?? "").trim();
    let vendorId = String(formData.get("vendor_id") ?? "").trim() || null;
    const businessNumber = String(formData.get("business_number") ?? "").trim() || null;
    const vendorPhone = String(formData.get("vendor_phone") ?? "").trim() || null;
    const file = formData.get("document");
    const hasDocument = file instanceof File && file.size > 0;
    if (paymentMethod === "company_card" && !hasDocument) {
      throw new Error("법인카드 지출은 영수증 첨부가 필수입니다.");
    }

    let bytes: Uint8Array | null = null;
    let digest: string | null = null;
    if (hasDocument && file instanceof File) {
      assertDocument(file);
      bytes = new Uint8Array(await file.arrayBuffer());
      digest = sha256(bytes);
      if (await checkExpenseDocumentDuplicate(digest)) throw new Error("같은 증빙 파일이 이미 등록되어 있습니다. 중복 지출 여부를 확인해 주세요.");
    }

    if (!vendorId && vendorName) {
      const vendor = await findOrCreateVendorCandidate({
        name: vendorName,
        businessNumber,
        phone: vendorPhone,
        createdFrom: hasDocument ? documentType(formData.get("document_type")) : "manual",
      });
      vendorId = vendor.vendor_id;
    }

    if (hasDocument && file instanceof File && bytes && digest) {
      const supabase = await createClient();
      uploadedPath = `${access.companyId}/${access.userId}/${randomUUID()}.${extFor(file)}`;
      const { error } = await supabase.storage.from("expense-documents").upload(uploadedPath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (error) throw new Error("증빙 파일 업로드에 실패했습니다.");
    }

    const result = await registerExpenseRequest({
      projectId,
      category,
      vendorId,
      vendorName: vendorName || null,
      description,
      supplyAmount,
      vatAmount,
      totalAmount,
      expenseDate,
      paymentDueDate,
      paymentMethod,
      memo: String(formData.get("memo") ?? "").trim() || null,
    });

    if (hasDocument && file instanceof File && uploadedPath && digest) {
      let aiExtracted: Record<string, unknown> = {};
      try {
        aiExtracted = JSON.parse(String(formData.get("ai_extracted") ?? "{}")) as Record<string, unknown>;
      } catch { aiExtracted = {}; }
      await attachExpenseDocument({
        expenseId: result.expense_id,
        documentType: documentType(formData.get("document_type")),
        storagePath: uploadedPath,
        originalFileName: file.name || "증빙",
        mimeType: file.type || "",
        fileSize: file.size,
        sha256: digest,
        aiExtracted,
        aiConfidence: Number(formData.get("ai_confidence") ?? 0) || null,
      });
      uploadedPath = null;
    }

    if (result.status === "pending") await pushExpenseEvent("expense_requested", result.expense_id);
    else await pushExpenseEvent("expense_approved", result.expense_id);
    revalidatePath("/finance/payments");
    revalidatePath("/dashboard");
    return {
      success: true,
      expenseId: result.expense_id,
      message: result.status === "pending" ? "지출요청을 등록하고 관리자에게 PUSH했습니다." : "관리자 지출을 승인 상태로 등록했습니다.",
    };
  } catch (error) {
    if (uploadedPath) {
      try { const supabase = await createClient(); await supabase.storage.from("expense-documents").remove([uploadedPath]); } catch { /* orphan cleanup best effort */ }
    }
    return { success: false, error: error instanceof Error ? error.message : "지출요청 등록에 실패했습니다." };
  }
}

export async function approveExpenseRequestAction(expenseId: string): Promise<ExpenseActionResult> {
  try { await approveExpenseRequest(expenseId); await pushExpenseEvent("expense_approved", expenseId); revalidatePath("/finance/payments"); return { success: true, message: "지출요청을 승인하고 신청자에게 PUSH했습니다." }; }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : "승인에 실패했습니다." }; }
}

export async function rejectExpenseRequestAction(expenseId: string, reason: string): Promise<ExpenseActionResult> {
  try { await rejectExpenseRequest(expenseId, reason); revalidatePath("/finance/payments"); return { success: true, message: "지출요청을 반려했습니다." }; }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : "반려에 실패했습니다." }; }
}

export async function markExpensePaidAction(expenseId: string, paymentMethod: string): Promise<ExpenseActionResult> {
  try { await markExpensePaid(expenseId, new Date().toISOString(), paymentMethod || null); await pushExpenseEvent("expense_paid", expenseId); revalidatePath("/finance/payments"); return { success: true, message: "지급완료 처리하고 신청자에게 PUSH했습니다." }; }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : "지급완료 처리에 실패했습니다." }; }
}

export async function cancelExpenseRequestAction(expenseId: string, reason: string): Promise<ExpenseActionResult> {
  try { await cancelExpenseRequest(expenseId, reason); revalidatePath("/finance/payments"); return { success: true, message: "지출요청을 취소했습니다." }; }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : "취소에 실패했습니다." }; }
}

export async function approveVendorAction(vendorId: string): Promise<ExpenseActionResult> {
  try { await approveVendor(vendorId); revalidatePath("/finance/payments"); return { success: true, message: "신규 거래처를 승인했습니다." }; }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : "거래처 승인에 실패했습니다." }; }
}

export async function getMyExpenseNotificationsAction(): Promise<ExpenseNotificationItem[]> {
  try { return await listMyExpenseNotifications(10); } catch { return []; }
}