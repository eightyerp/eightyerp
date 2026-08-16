import { getCurrentCompanyAccess } from "@/lib/crm/access";
import {
  type CollectionContract,
  type CollectionNotificationItem,
  type CollectionPaymentMethod,
  type CollectionReceipt,
  type CollectionReceiptStatus,
  type CollectionType,
  type CustomerCollectionReceiptSummary,
} from "@/lib/crm/collection-shared";
import { createClient } from "@/lib/supabase-server";

export type CollectionAccess = {
  isFinanceAdmin: boolean;
  companyRole: string | null;
  currentEmployeeId: string | null;
};

export type CollectionMutation = {
  receipt_id: string;
  status?: CollectionReceiptStatus;
  contract_id: string;
  customer_id?: string;
  project_id?: string | null;
  assigned_employee_id?: string | null;
  reported_by_employee_id?: string | null;
  amount?: number;
  payment_method?: CollectionPaymentMethod;
  collection_type?: CollectionType;
};

const ADMIN_ROLES = new Set(["owner", "director", "admin"]);

const COLLECTION_RECEIPT_SELECT = `
  id, company_id, contract_id, customer_id, project_id, assigned_employee_id,
  collection_type, payment_method, amount, received_at, status, memo,
  reported_by_employee_id, confirmed_at, cancelled_at, cancel_reason, created_at,
  contracts:contracts!collection_receipts_contract_id_fkey ( contract_number, title ),
  customers:customers!collection_receipts_customer_id_fkey ( id, name, phone ),
  projects:projects!collection_receipts_project_id_fkey ( id, name ),
  assigned_employee:employees!collection_receipts_assigned_employee_id_fkey ( id, name, title, phone, email ),
  reported_employee:employees!collection_receipts_reported_by_employee_id_fkey ( id, name, title )
`;

export async function getCollectionAccess(): Promise<CollectionAccess> {
  const { access, companyRole } = await getCurrentCompanyAccess();
  return {
    isFinanceAdmin: Boolean(companyRole && ADMIN_ROLES.has(companyRole)),
    companyRole,
    currentEmployeeId: access.profile?.employee_id ?? null,
  };
}

export async function listCollectionContracts(): Promise<CollectionContract[]> {
  await getCurrentCompanyAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contracts")
    .select(
      `
      id, contract_number, title, status, contract_kind,
      contract_amount, cumulative_contract_amount, received_amount, outstanding_amount,
      assigned_employee_id,
      customers:customers!contracts_customer_id_fkey ( id, name, phone, address ),
      projects:projects!contracts_project_id_fkey ( id, name, address ),
      employees:employees!contracts_assigned_employee_id_fkey ( id, name, title, phone, email )
    `,
    )
    .eq("contract_kind", "original")
    .order("contract_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as CollectionContract[]).filter(
    (row) => !["draft", "cancelled", "terminated"].includes(row.status),
  );
}

export async function listCollectionReceipts(limit = 200): Promise<CollectionReceipt[]> {
  await getCurrentCompanyAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collection_receipts")
    .select(COLLECTION_RECEIPT_SELECT)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 500)));
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CollectionReceipt[];
}

export async function listCustomerCollectionReceipts(
  customerId: string,
  limit = 100,
): Promise<CustomerCollectionReceiptSummary[]> {
  await getCurrentCompanyAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collection_receipts")
    .select(
      `
      id, contract_id, collection_type, payment_method, amount, received_at,
      status, memo, cancel_reason, created_at,
      contracts:contracts!collection_receipts_contract_id_fkey ( contract_number, title ),
      reported_employee:employees!collection_receipts_reported_by_employee_id_fkey ( id, name, title )
    `,
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 200)));
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CustomerCollectionReceiptSummary[];
}

async function callCollectionRpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as CollectionMutation;
}

export async function registerCollectionReceipt(input: {
  contractId: string;
  collectionType: CollectionType;
  paymentMethod: CollectionPaymentMethod;
  amount: number;
  receivedAt?: string | null;
  memo?: string | null;
}): Promise<CollectionMutation> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("수금액은 0원보다 큰 원 단위 정수여야 합니다.");
  }
  return callCollectionRpc("register_collection_receipt", {
    p_contract_id: input.contractId,
    p_collection_type: input.collectionType,
    p_payment_method: input.paymentMethod,
    p_amount: input.amount,
    p_received_at: input.receivedAt || new Date().toISOString(),
    p_memo: input.memo?.trim() || null,
  });
}

export async function confirmCollectionReceipt(receiptId: string) {
  return callCollectionRpc("confirm_collection_receipt", {
    p_receipt_id: receiptId,
  });
}

export async function cancelCollectionReceipt(receiptId: string, reason: string) {
  const normalized = reason.trim();
  if (!normalized) throw new Error("취소 사유를 입력해 주세요.");
  return callCollectionRpc("cancel_collection_receipt", {
    p_receipt_id: receiptId,
    p_reason: normalized,
  });
}

export async function getCollectionReceiptContext(
  receiptId: string,
): Promise<CollectionReceipt | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collection_receipts")
    .select(COLLECTION_RECEIPT_SELECT)
    .eq("id", receiptId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as CollectionReceipt | null;
}

export async function listMyCollectionNotifications(
  limit = 10,
): Promise<CollectionNotificationItem[]> {
  const access = await getCollectionAccess();
  const supabase = await createClient();
  let query = supabase
    .from("notification_events")
    .select("id, event_type, customer_id, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 30)));

  if (access.isFinanceAdmin) {
    query = query.eq("event_type", "collection_reported");
  } else {
    if (!access.currentEmployeeId) return [];
    query = query
      .eq("event_type", "collection_confirmed")
      .contains("payload", { assigned_employee_id: access.currentEmployeeId });
  }

  const { data, error } = await query;
  if (error) return [];

  return (data ?? []).map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    return {
      id: row.id as string,
      eventType: row.event_type as "collection_reported" | "collection_confirmed",
      receiptId: payload.receipt_id ? String(payload.receipt_id) : null,
      customerId: row.customer_id as string | null,
      customerName: String(payload.customer_name ?? "고객"),
      amount: Number(payload.amount ?? 0),
      paymentMethod: String(payload.payment_method ?? ""),
      collectionType: String(payload.collection_type ?? ""),
      reporterName: payload.reporter_name ? String(payload.reporter_name) : null,
      assigneeName: payload.assignee_name ? String(payload.assignee_name) : null,
      createdAt: row.created_at as string,
    };
  });
}
