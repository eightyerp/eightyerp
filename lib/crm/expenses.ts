import { getCurrentCompanyAccess } from "@/lib/crm/access";
import { createClient } from "@/lib/supabase-server";
import type {
  ExpenseDocumentRecord,
  ExpenseEmployeeOption,
  ExpenseNotificationItem,
  ExpenseProjectOption,
  ExpenseRequestRecord,
  PostSettlementReason,
  PostSettlementTreatment,
  SettlementAdjustmentRecord,
  VendorRecord,
} from "@/lib/crm/expense-shared";

const FINANCE_ADMIN_ROLES = new Set(["owner", "director", "admin"]);

export async function getExpenseAccess() {
  const { access, companyRole } = await getCurrentCompanyAccess();
  if (!access.userId || !access.profile?.active_company_id) throw new Error("현재 회사 정보를 확인할 수 없습니다.");
  return {
    isFinanceAdmin: Boolean(companyRole && FINANCE_ADMIN_ROLES.has(companyRole)),
    companyRole,
    currentEmployeeId: access.profile.employee_id ?? null,
    userId: access.userId,
    companyId: access.profile.active_company_id,
  };
}

export async function listExpenseProjects(): Promise<ExpenseProjectOption[]> {
  await getExpenseAccess();
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects")
    .select(`
      id, name, address, customer_id,
      customers ( id, name, phone ),
      finance_state:project_finance_states!project_finance_states_project_id_fkey ( settlement_status, settled_at )
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ExpenseProjectOption[];
}

export async function listExpenseAdjustmentEmployees(): Promise<ExpenseEmployeeOption[]> {
  const access = await getExpenseAccess();
  if (!access.isFinanceAdmin) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("employees")
    .select("id, name, title, team_id, teams ( name )")
    .eq("is_active", true)
    .is("merged_into_employee_id", null)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ExpenseEmployeeOption[];
}

export async function listVendors(): Promise<VendorRecord[]> {
  await getExpenseAccess();
  const supabase = await createClient();
  const { data, error } = await supabase.from("vendors")
    .select("id, company_id, name, normalized_name, business_number, phone, bank_name, account_number, account_holder, review_status, created_from, created_at")
    .neq("review_status", "inactive").order("name").limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as VendorRecord[];
}

export async function listExpenseRequests(limit = 300): Promise<ExpenseRequestRecord[]> {
  await getExpenseAccess();
  const supabase = await createClient();
  const { data, error } = await supabase.from("expense_requests").select(`
    id, company_id, expense_scope, project_id, customer_id, contract_id, category,
    vendor_id, vendor_name_snapshot, description, supply_amount, vat_amount, total_amount,
    expense_date, payment_due_date, payment_method, status, requested_by_employee_id,
    approved_at, paid_at, rejection_reason, cancel_reason, memo, created_at,
    is_post_settlement, post_settlement_reason, post_settlement_treatment,
    adjustment_employee_id, settlement_adjustment_amount, recovery_expected_amount, post_settlement_note,
    projects:projects!expense_requests_project_id_fkey ( id, name, address ),
    customers:customers!expense_requests_customer_id_fkey ( id, name, phone ),
    vendors:vendors!expense_requests_vendor_id_fkey ( id, name, review_status, business_number ),
    requested_employee:employees!expense_requests_requested_by_employee_id_fkey ( id, name, title ),
    adjustment_employee:employees!expense_requests_adjustment_employee_id_fkey ( id, name, title ),
    expense_documents ( id, expense_request_id, document_type, storage_path, original_file_name, mime_type, file_size, sha256, ai_extracted, ai_confidence, created_at )
  `).order("created_at", { ascending: false }).limit(Math.max(1, Math.min(limit, 500)));
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ExpenseRequestRecord[];
}

export async function listSettlementAdjustments(limit = 200): Promise<SettlementAdjustmentRecord[]> {
  await getExpenseAccess();
  const supabase = await createClient();
  const { data, error } = await supabase.from("settlement_adjustments").select(`
    id, company_id, source_project_id, source_expense_request_id, employee_id,
    adjustment_amount, applied_amount, remaining_amount, status, reason, created_at,
    source_project:projects!settlement_adjustments_source_project_id_fkey ( id, name ),
    employee:employees!settlement_adjustments_employee_id_fkey ( id, name, title ),
    source_expense:expense_requests!settlement_adjustments_source_expense_request_id_fkey ( id, description, total_amount )
  `).order("created_at", { ascending: false }).limit(Math.max(1, Math.min(limit, 500)));
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SettlementAdjustmentRecord[];
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const findOrCreateVendorCandidate = (input: { name: string; businessNumber?: string | null; phone?: string | null; createdFrom?: string }) =>
  rpc<{ vendor_id: string; created: boolean; review_status: string; name: string }>("find_or_create_vendor_candidate", {
    p_name: input.name,
    p_business_number: input.businessNumber ?? null,
    p_phone: input.phone ?? null,
    p_created_from: input.createdFrom ?? "manual",
  });

export const approveVendor = (vendorId: string) => rpc("approve_vendor", { p_vendor_id: vendorId });

export const registerExpenseRequest = (input: Record<string, unknown>) => rpc<{
  expense_id: string;
  status: string;
  project_id: string;
  customer_id: string | null;
  requester_employee_id: string | null;
  amount: number;
}>("register_expense_request", {
  p_expense_scope: "project",
  p_project_id: input.projectId,
  p_category: input.category,
  p_vendor_id: input.vendorId,
  p_vendor_name: input.vendorName,
  p_description: input.description,
  p_supply_amount: input.supplyAmount,
  p_vat_amount: input.vatAmount,
  p_total_amount: input.totalAmount,
  p_expense_date: input.expenseDate,
  p_payment_due_date: input.paymentDueDate,
  p_payment_method: input.paymentMethod,
  p_memo: input.memo,
});

export const approveExpenseRequest = (expenseId: string) => rpc<Record<string, unknown>>("approve_expense_request", { p_expense_id: expenseId });
export const rejectExpenseRequest = (expenseId: string, reason: string) => rpc<Record<string, unknown>>("reject_expense_request", { p_expense_id: expenseId, p_reason: reason });
export const markExpensePaid = (expenseId: string, paidAt: string | null, paymentMethod: string | null) => rpc<Record<string, unknown>>("mark_expense_paid", { p_expense_id: expenseId, p_paid_at: paidAt, p_payment_method: paymentMethod });
export const cancelExpenseRequest = (expenseId: string, reason: string) => rpc<Record<string, unknown>>("cancel_expense_request", { p_expense_id: expenseId, p_reason: reason });
export const checkExpenseDocumentDuplicate = (sha256: string) => rpc<boolean>("check_expense_document_duplicate", { p_sha256: sha256 });

export const setExpensePostSettlementResolution = (input: {
  expenseId: string;
  reason: PostSettlementReason;
  treatment: PostSettlementTreatment;
  adjustmentEmployeeId?: string | null;
  adjustmentAmount?: number;
  recoveryExpectedAmount?: number;
  note?: string | null;
}) => rpc<Record<string, unknown>>("set_expense_post_settlement_resolution", {
  p_expense_id: input.expenseId,
  p_reason: input.reason,
  p_treatment: input.treatment,
  p_adjustment_employee_id: input.adjustmentEmployeeId ?? null,
  p_adjustment_amount: input.adjustmentAmount ?? 0,
  p_recovery_expected_amount: input.recoveryExpectedAmount ?? 0,
  p_note: input.note?.trim() || null,
});

export const attachExpenseDocument = (input: Record<string, unknown>) => rpc("attach_expense_document", {
  p_expense_id: input.expenseId,
  p_document_type: input.documentType,
  p_storage_path: input.storagePath,
  p_original_file_name: input.originalFileName,
  p_mime_type: input.mimeType,
  p_file_size: input.fileSize,
  p_sha256: input.sha256,
  p_ai_extracted: input.aiExtracted,
  p_ai_confidence: input.aiConfidence,
});

export async function createExpenseDocumentSignedUrl(document: Pick<ExpenseDocumentRecord, "storage_path">) {
  await getExpenseAccess();
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("expense-documents").createSignedUrl(document.storage_path, 60 * 10);
  return error ? null : data?.signedUrl ?? null;
}

export async function listMyExpenseNotifications(limit = 10): Promise<ExpenseNotificationItem[]> {
  const access = await getExpenseAccess();
  const supabase = await createClient();
  let query = supabase.from("notification_events").select("id, event_type, payload, created_at").order("created_at", { ascending: false }).limit(Math.max(1, Math.min(limit, 30)));
  if (access.isFinanceAdmin) query = query.eq("event_type", "expense_requested");
  else {
    if (!access.currentEmployeeId) return [];
    query = query.in("event_type", ["expense_approved", "expense_paid"]).contains("payload", { requester_employee_id: access.currentEmployeeId });
  }
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).map((row) => {
    const p = (row.payload ?? {}) as Record<string, unknown>;
    return {
      id: row.id as string,
      eventType: row.event_type as ExpenseNotificationItem["eventType"],
      expenseId: String(p.expense_id ?? ""),
      requesterEmployeeId: p.requester_employee_id ? String(p.requester_employee_id) : null,
      requesterName: p.requester_name ? String(p.requester_name) : null,
      vendorName: p.vendor_name ? String(p.vendor_name) : null,
      description: String(p.description ?? "지출요청"),
      amount: Number(p.amount ?? 0),
      status: String(p.status ?? ""),
      createdAt: row.created_at as string,
    };
  });
}