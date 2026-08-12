export type CollectionType = "deposit" | "interim" | "final" | "other";
export type CollectionPaymentMethod =
  | "bank_transfer"
  | "card"
  | "cash"
  | "other";
export type CollectionReceiptStatus = "pending" | "confirmed" | "cancelled";

export type CollectionContract = {
  id: string;
  contract_number: string;
  title: string | null;
  status: string;
  contract_kind: string;
  contract_amount: number;
  cumulative_contract_amount: number | null;
  received_amount: number;
  outstanding_amount: number;
  assigned_employee_id: string | null;
  customers: { id: string; name: string; phone: string; address: string | null } | null;
  projects: { id: string; name: string; address: string | null } | null;
  employees: { id: string; name: string; title: string; phone: string | null; email: string | null } | null;
};

export type CollectionReceipt = {
  id: string;
  company_id: string;
  contract_id: string;
  customer_id: string;
  project_id: string | null;
  assigned_employee_id: string | null;
  collection_type: CollectionType;
  payment_method: CollectionPaymentMethod;
  amount: number;
  received_at: string;
  status: CollectionReceiptStatus;
  memo: string | null;
  reported_by_employee_id: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  contracts: { contract_number: string; title: string | null } | null;
  customers: { id: string; name: string; phone: string } | null;
  projects: { id: string; name: string } | null;
  assigned_employee: { id: string; name: string; title: string; phone: string | null; email: string | null } | null;
  reported_employee: { id: string; name: string; title: string } | null;
};

export type CollectionNotificationItem = {
  id: string;
  eventType: "collection_reported" | "collection_confirmed";
  receiptId: string | null;
  customerId: string | null;
  customerName: string;
  amount: number;
  paymentMethod: string;
  collectionType: string;
  reporterName: string | null;
  assigneeName: string | null;
  createdAt: string;
};

export const COLLECTION_TYPE_LABELS: Record<CollectionType, string> = {
  deposit: "계약금",
  interim: "중도금",
  final: "잔금",
  other: "기타",
};

export const COLLECTION_PAYMENT_LABELS: Record<CollectionPaymentMethod, string> = {
  bank_transfer: "계좌입금",
  card: "카드",
  cash: "현금",
  other: "기타",
};

export const COLLECTION_STATUS_LABELS: Record<CollectionReceiptStatus, string> = {
  pending: "확인대기",
  confirmed: "확정",
  cancelled: "취소",
};
