export type ExpenseScope = "project" | "operating";
export type ExpenseCategory =
  | "materials"
  | "subcontract"
  | "labor"
  | "demolition"
  | "lifting"
  | "freight"
  | "site"
  | "advertising"
  | "sga"
  | "misc";
export type ExpensePaymentMethod =
  | "bank_transfer"
  | "company_card"
  | "personal_card"
  | "cash"
  | "other";
export type ExpenseStatus =
  | "pending"
  | "approved"
  | "paid"
  | "rejected"
  | "cancelled";
export type ExpenseDocumentType =
  | "receipt"
  | "transaction_statement"
  | "invoice"
  | "other";

export const EXPENSE_SCOPE_LABELS: Record<ExpenseScope, string> = {
  project: "현장비",
  operating: "운영비",
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  materials: "자재비",
  subcontract: "외주/협력업체",
  labor: "인건비",
  demolition: "철거비",
  lifting: "양중비",
  freight: "운반/배송비",
  site: "현장경비",
  advertising: "광고비",
  sga: "판관비",
  misc: "기타",
};

export const EXPENSE_PAYMENT_LABELS: Record<ExpensePaymentMethod, string> = {
  bank_transfer: "계좌이체",
  company_card: "법인카드",
  personal_card: "개인카드",
  cash: "현금",
  other: "기타",
};

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  pending: "승인대기",
  approved: "승인",
  paid: "지급완료",
  rejected: "반려",
  cancelled: "취소",
};

export const EXPENSE_DOCUMENT_LABELS: Record<ExpenseDocumentType, string> = {
  receipt: "영수증",
  transaction_statement: "거래명세서",
  invoice: "세금계산서/청구서",
  other: "기타 증빙",
};

export type ExpenseDocumentAnalysis = {
  documentType: ExpenseDocumentType;
  vendorName: string;
  businessNumber: string;
  phone: string;
  expenseDate: string;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  paymentMethod: ExpensePaymentMethod | "";
  description: string;
  confidence: number;
  warnings: string[];
};

export type VendorRecord = {
  id: string;
  company_id: string;
  name: string;
  normalized_name: string;
  business_number: string | null;
  phone: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  review_status: "pending_review" | "approved" | "inactive";
  created_from: ExpenseDocumentType | "manual";
  created_at: string;
};

export type ExpenseProjectOption = {
  id: string;
  name: string;
  address: string | null;
  customer_id: string;
  customers: { id: string; name: string; phone: string } | null;
};

export type ExpenseDocumentRecord = {
  id: string;
  expense_request_id: string;
  document_type: ExpenseDocumentType;
  storage_path: string;
  original_file_name: string;
  mime_type: string | null;
  file_size: number | null;
  sha256: string | null;
  ai_extracted: Record<string, unknown>;
  ai_confidence: number | null;
  created_at: string;
};

export type ExpenseRequestRecord = {
  id: string;
  company_id: string;
  expense_scope: ExpenseScope;
  project_id: string | null;
  customer_id: string | null;
  contract_id: string | null;
  category: ExpenseCategory;
  vendor_id: string | null;
  vendor_name_snapshot: string | null;
  description: string;
  supply_amount: number;
  vat_amount: number;
  total_amount: number;
  expense_date: string;
  payment_due_date: string | null;
  payment_method: ExpensePaymentMethod;
  status: ExpenseStatus;
  requested_by_employee_id: string | null;
  approved_at: string | null;
  paid_at: string | null;
  rejection_reason: string | null;
  cancel_reason: string | null;
  memo: string | null;
  created_at: string;
  projects: { id: string; name: string; address: string | null } | null;
  customers: { id: string; name: string; phone: string } | null;
  vendors: Pick<VendorRecord, "id" | "name" | "review_status" | "business_number"> | null;
  requested_employee: { id: string; name: string; title: string } | null;
  expense_documents?: ExpenseDocumentRecord[];
};

export type ExpenseNotificationItem = {
  id: string;
  eventType: "expense_requested" | "expense_approved" | "expense_paid";
  expenseId: string;
  requesterEmployeeId: string | null;
  requesterName: string | null;
  vendorName: string | null;
  description: string;
  amount: number;
  status: string;
  createdAt: string;
};