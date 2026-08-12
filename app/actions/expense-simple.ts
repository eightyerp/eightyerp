"use server";

import { createHash, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import {
  EXPENSE_WORK_TRADE_LABELS,
  SIMPLE_EXPENSE_CATEGORY_LABELS,
  type ExpenseDocumentType,
  type ExpensePaymentMethod,
  type ExpenseWorkTrade,
} from "@/lib/crm/expense-shared";
import {
  attachExpenseDocument,
  cancelExpenseRequest,
  checkExpenseDocumentDuplicate,
  findOrCreateVendorCandidate,
  getExpenseAccess,
  registerExpenseRequest,
} from "@/lib/crm/expenses";
import { enqueueNotificationEvent } from "@/lib/crm/notifications";

export type SimpleExpenseActionResult = {
  success: boolean;
  message?: string;
  error?: string;
  expenseId?: string;
};

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const PAYMENT_METHODS = new Set([
  "bank_transfer",
  "company_card",
  "personal_card",
  "cash",
  "other",
]);

function moneyValue(value: FormDataEntryValue | null, label: string) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`${label}을 원 단위로 입력해 주세요.`);
  }
  return n;
}

function assertDocument(file: File) {
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
    throw new Error("증빙 파일은 15MB 이하만 등록할 수 있습니다.");
  }
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    throw new Error("증빙은 JPG, PNG, WEBP, PDF만 등록할 수 있습니다.");
  }
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function extFor(file: File) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "pdf"].includes(ext)) {
    return ext === "jpeg" ? "jpg" : ext;
  }
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function evidenceType(value: FormDataEntryValue | null): ExpenseDocumentType {
  const raw = String(value ?? "receipt");
  return ["receipt", "transaction_statement", "invoice", "other"].includes(raw)
    ? (raw as ExpenseDocumentType)
    : "receipt";
}

export async function registerSimpleExpenseAction(
  _prev: SimpleExpenseActionResult,
  formData: FormData,
): Promise<SimpleExpenseActionResult> {
  let uploadedPath: string | null = null;
  let createdExpenseId: string | null = null;

  try {
    const access = await getExpenseAccess();
    const projectId = String(formData.get("project_id") ?? "").trim();
    if (!projectId) throw new Error("현장을 선택해 주세요.");

    const workTrade = String(formData.get("work_trade") ?? "") as ExpenseWorkTrade;
    if (!(workTrade in EXPENSE_WORK_TRADE_LABELS)) {
      throw new Error("공종을 선택해 주세요.");
    }

    const category = String(formData.get("category") ?? "materials") as keyof typeof SIMPLE_EXPENSE_CATEGORY_LABELS;
    if (!(category in SIMPLE_EXPENSE_CATEGORY_LABELS)) {
      throw new Error("비용유형을 선택해 주세요.");
    }

    const paymentMethod = String(formData.get("payment_method") ?? "") as ExpensePaymentMethod;
    if (!PAYMENT_METHODS.has(paymentMethod)) {
      throw new Error("결제수단을 선택해 주세요.");
    }

    const totalAmount = moneyValue(formData.get("total_amount"), "결제금액");
    if (totalAmount <= 0) throw new Error("결제금액을 입력해 주세요.");

    let supplyAmount = moneyValue(formData.get("supply_amount"), "공급가");
    let vatAmount = moneyValue(formData.get("vat_amount"), "부가세");
    if (supplyAmount + vatAmount !== totalAmount) {
      supplyAmount = totalAmount;
      vatAmount = 0;
    }
    if (category === "labor") {
      supplyAmount = totalAmount;
      vatAmount = 0;
    }

    const description = String(formData.get("description") ?? "").trim();
    if (!description) throw new Error("지출내용을 간단히 입력해 주세요.");

    const expenseDate = String(formData.get("expense_date") ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      throw new Error("결제일을 선택해 주세요.");
    }

    const rawVendorId = String(formData.get("vendor_id") ?? "").trim();
    let vendorId = rawVendorId && rawVendorId !== "__new__" ? rawVendorId : null;
    const newVendorName = String(formData.get("new_vendor_name") ?? "").trim();
    if (rawVendorId === "__new__" && !newVendorName) {
      throw new Error("신규 거래처명을 입력해 주세요.");
    }
    if (!vendorId && newVendorName) {
      const vendor = await findOrCreateVendorCandidate({
        name: newVendorName,
        createdFrom: "manual",
      });
      vendorId = vendor.vendor_id;
    }

    const file = formData.get("document");
    const hasDocument = file instanceof File && file.size > 0;
    let bytes: Uint8Array | null = null;
    let digest: string | null = null;

    if (hasDocument && file instanceof File) {
      assertDocument(file);
      bytes = new Uint8Array(await file.arrayBuffer());
      digest = sha256(bytes);
      if (await checkExpenseDocumentDuplicate(digest)) {
        throw new Error("같은 증빙 파일이 이미 등록되어 있습니다.");
      }
      const supabase = await createClient();
      uploadedPath = `${access.companyId}/${access.userId}/${randomUUID()}.${extFor(file)}`;
      const { error } = await supabase.storage
        .from("expense-documents")
        .upload(uploadedPath, bytes, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (error) throw new Error("증빙 파일 업로드에 실패했습니다.");
    }

    const result = await registerExpenseRequest({
      projectId,
      workTrade,
      category,
      vendorId,
      vendorName: newVendorName || null,
      description,
      supplyAmount,
      vatAmount,
      totalAmount,
      expenseDate,
      paymentDueDate: null,
      paymentMethod,
      memo: String(formData.get("memo") ?? "").trim() || null,
    });
    createdExpenseId = result.expense_id;

    if (hasDocument && file instanceof File && uploadedPath && digest) {
      let aiExtracted: Record<string, unknown> = {};
      try {
        aiExtracted = JSON.parse(String(formData.get("ai_extracted") ?? "{}"));
      } catch {
        aiExtracted = {};
      }
      await attachExpenseDocument({
        expenseId: result.expense_id,
        documentType: evidenceType(formData.get("document_type")),
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

    if (result.status === "pending") {
      const supabase = await createClient();
      const { data: employee } = access.currentEmployeeId
        ? await supabase
            .from("employees")
            .select("name, title")
            .eq("id", access.currentEmployeeId)
            .maybeSingle()
        : { data: null };
      const requesterName = employee
        ? [employee.name, employee.title].filter(Boolean).join(" ")
        : "직원";
      await enqueueNotificationEvent({
        event_type: "expense_requested",
        project_id: projectId,
        payload: {
          target: "finance_admins",
          expense_id: result.expense_id,
          requester_employee_id: access.currentEmployeeId,
          requester_name: requesterName,
          amount: totalAmount,
          work_trade: workTrade,
          description,
          status: result.status,
        },
        body: `[에잇티 지출] ${requesterName} / ${EXPENSE_WORK_TRADE_LABELS[workTrade]} / ${totalAmount.toLocaleString("ko-KR")}원`,
      });
    }

    revalidatePath("/finance/payments");
    revalidatePath("/dashboard");
    return {
      success: true,
      expenseId: result.expense_id,
      message:
        result.status === "pending"
          ? "지출요청을 등록했습니다. 관리자에게 확인 알림을 보냈습니다."
          : "지출결의서를 등록했습니다.",
    };
  } catch (error) {
    if (createdExpenseId) {
      try {
        await cancelExpenseRequest(createdExpenseId, "증빙 저장 실패로 자동취소");
      } catch {
        // best effort
      }
    }
    if (uploadedPath) {
      try {
        const supabase = await createClient();
        await supabase.storage.from("expense-documents").remove([uploadedPath]);
      } catch {
        // best effort
      }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "지출 등록에 실패했습니다.",
    };
  }
}
