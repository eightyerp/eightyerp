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
export type ExpenseWorkTrade =
  | "windows"
  | "demolition"
  | "carpentry"
  | "electrical_lighting"
  | "plumbing"
  | "tile"
  | "bathroom"
  | "film"
  | "wallpaper"
  | "flooring"
  | "painting"
  | "furniture"
  | "kitchen"
  | "aircon"
  | "doors"
  | "glass_metal"
  | "lifting_freight"
  | "cleaning"
  | "site_common"
  | "other";
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
export type ExpenseTaxEvidenceType =
  | "unverified"
  | "tax_invoice"
  | "cash_receipt"
  | "card_receipt"
  | "none"
  | "other";

export type PostSettlementReason =
  | "as_repair"
  | "omitted_invoice"
  | "additional_material"
  | "additional_labor"
  | "late_vendor_invoice"
  | "other";

export type PostSettlementTreatment =
  | "company_absorb"
  | "next_settlement_deduction"
  | "vendor_recovery"
  | "customer_rebill"
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

export const SIMPLE_EXPENSE_CATEGORY_LABELS: Record<
  Extract<ExpenseCategory, "materials" | "subcontract" | "labor" | "site" | "misc">,
  string
> = {
  materials: "자재",
  subcontract: "외주/협력",
  labor: "인건비",
  site: "현장경비",
  misc: "기타",
};

export const EXPENSE_WORK_TRADE_LABELS: Record<ExpenseWorkTrade, string> = {
  windows: "창호",
  demolition: "철거",
  carpentry: "목공",
  electrical_lighting: "전기·조명",
  plumbing: "설비",
  tile: "타일",
  bathroom: "욕실",
  film: "필름",
  wallpaper: "도배",
  flooring: "바닥",
  painting: "도장",
  furniture: "가구",
  kitchen: "주방",
  aircon: "시스템에어컨",
  doors: "중문·도어",
  glass_metal: "유리·금속",
  lifting_freight: "양중·운반",
  cleaning: "청소",
  site_common: "현장공통",
  other: "기타",
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

export const EXPENSE_TAX_EVIDENCE_LABELS: Record<ExpenseTaxEvidenceType, string> = {
  unverified: "미확인",
  tax_invoice: "세금계산서",
  cash_receipt: "지출증빙용 현금영수증",
  card_receipt: "카드전표",
  none: "증빙 없음",
  other: "기타",
};

export const POST_SETTLEMENT_REASON_LABELS: Record<PostSettlementReason, string> = {
  as_repair: "AS/하자 보수",
  omitted_invoice: "정산 누락 비용",
  additional_material: "추가 자재",
  additional_labor: "추가 인건비",
  late_vendor_invoice: "협력업체 후청구",
  other: "기타",
};

export const POST_SETTLEMENT_TREATMENT_LABELS: Record<PostSettlementTreatment, string> = {
  company_absorb: "회사 부담",
  next_settlement_deduction: "다음 정산 차감",
  vendor_recovery: "협력업체 회수",
  customer_rebill: "고객 추가청구",
  other: "기타 처리",
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
  default_work_trade: ExpenseWorkTrade | null;
  default_expense_category: ExpenseCategory | null;
  review_status: "pending_review" | "approved" | "inactive";
  created_from: ExpenseDocumentType | "manual";
  created_at: string;
};

export type ExpenseProjectFinanceState = {
  settlement_status: "open" | "settled";
  settled_at: string | null;
};

export type ExpenseProjectOption = {
  id: string;
  name: string;
  address: string | null;
  customer_id: string;
  customers: { id: string; name: string; phone: string } | null;
  finance_state?: ExpenseProjectFinanceState | ExpenseProjectFinanceState[] | null;
};

export type ExpenseEmployeeOption = {
  id: string;
  name: string;
  title: string;
  team_id: string | null;
  teams?: { name: string } | { name: string }[] | null;
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
  work_trade: ExpenseWorkTrade;
  category: ExpenseCategory;
  vendor_id: string | null;
  vendor_name_snapshot: string | null;
  description: string;
  supply_amount: number;
  vat_amount: number;
  total_amount: number;
  tax_evidence_type: ExpenseTaxEvidenceType;
  cost_basis_amount: number;
  vat_credit_amount: number;
  tax_evidence_updated_at: string | null;
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
  is_post_settlement: boolean;
  post_settlement_reason: PostSettlementReason | null;
  post_settlement_treatment: PostSettlementTreatment | null;
  adjustment_employee_id: string | null;
  settlement_adjustment_amount: number;
  recovery_expected_amount: number;
  post_settlement_note: string | null;
  projects: { id: string; name: string; address: string | null } | null;
  customers: { id: string; name: string; phone: string } | null;
  vendors: Pick<
    VendorRecord,
    "id" | "name" | "review_status" | "business_number" | "default_work_trade" | "default_expense_category"
  > | null;
  requested_employee: { id: string; name: string; title: string } | null;
  adjustment_employee?: { id: string; name: string; title: string } | null;
  expense_documents?: ExpenseDocumentRecord[];
};

export type SettlementAdjustmentRecord = {
  id: string;
  company_id: string;
  source_project_id: string;
  source_expense_request_id: string;
  employee_id: string;
  adjustment_amount: number;
  applied_amount: number;
  remaining_amount: number;
  status: "pending" | "partially_applied" | "applied" | "cancelled";
  reason: string | null;
  created_at: string;
  source_project: { id: string; name: string } | null;
  employee: { id: string; name: string; title: string } | null;
  source_expense: { id: string; description: string; total_amount: number } | null;
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
