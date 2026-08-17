import { getCurrentCompanyAccess } from "@/lib/crm/access";
import type { ExpenseRequestRecord } from "@/lib/crm/expense-shared";
import {
  buildKstDateTimeBounds,
  normalizeDateRange,
  shiftDate,
} from "@/lib/date-range";

export const EXPENSE_LEDGER_PAGE_SIZE = 50;
export const EXPENSE_ACTION_QUEUE_LIMIT = 150;
export const EXPENSE_EVIDENCE_QUEUE_LIMIT = 100;

export type ExpenseLedgerDateField =
  | "expense_date"
  | "payment_due_date"
  | "paid_at"
  | "created_at";

export const EXPENSE_LEDGER_DATE_FIELDS: ReadonlyArray<{
  value: ExpenseLedgerDateField;
  label: string;
}> = [
  { value: "expense_date", label: "지출일" },
  { value: "payment_due_date", label: "지급예정일" },
  { value: "paid_at", label: "실제 지급일" },
  { value: "created_at", label: "신청일" },
];

const DATE_FIELD_SET = new Set<ExpenseLedgerDateField>(
  EXPENSE_LEDGER_DATE_FIELDS.map((item) => item.value),
);
const DATE_ONLY_FIELDS = new Set<ExpenseLedgerDateField>([
  "expense_date",
  "payment_due_date",
]);

const EXPENSE_REQUEST_SELECT = `
  id, company_id, expense_scope, project_id, customer_id, contract_id, work_trade, category,
  vendor_id, vendor_name_snapshot, description, supply_amount, vat_amount, total_amount,
  tax_evidence_type, cost_basis_amount, vat_credit_amount, tax_evidence_updated_at,
  expense_date, payment_due_date, payment_method, status, requested_by_employee_id,
  approved_at, paid_at, rejection_reason, cancel_reason, memo, created_at,
  is_post_settlement, post_settlement_reason, post_settlement_treatment,
  adjustment_employee_id, settlement_adjustment_amount, recovery_expected_amount, post_settlement_note,
  projects:projects!expense_requests_project_id_fkey ( id, name, address ),
  customers:customers!expense_requests_customer_id_fkey ( id, name, phone ),
  vendors:vendors!expense_requests_vendor_id_fkey ( id, name, review_status, business_number, default_work_trade, default_expense_category ),
  requested_employee:employees!expense_requests_requested_by_employee_id_fkey ( id, name, title ),
  adjustment_employee:employees!expense_requests_adjustment_employee_id_fkey ( id, name, title ),
  expense_documents ( id, expense_request_id, document_type, storage_path, original_file_name, mime_type, file_size, sha256, ai_extracted, ai_confidence, created_at )
`;

export function normalizeExpenseLedgerDateField(
  value: string | null | undefined,
): ExpenseLedgerDateField {
  return DATE_FIELD_SET.has(value as ExpenseLedgerDateField)
    ? (value as ExpenseLedgerDateField)
    : "expense_date";
}

export type ExpenseLedgerPageResult = {
  requests: ExpenseRequestRecord[];
  total: number;
  page: number;
  totalPages: number;
};

export async function listExpenseLedgerPage(input: {
  dateField?: string | null;
  from?: string | null;
  to?: string | null;
  page?: number;
}): Promise<ExpenseLedgerPageResult> {
  const { supabase } = await getCurrentCompanyAccess();
  const dateField = normalizeExpenseLedgerDateField(input.dateField);
  const normalized = normalizeDateRange(input.from, input.to);
  if (normalized.error) throw new Error(normalized.error);

  const page = Math.max(1, input.page ?? 1);
  const fromRow = (page - 1) * EXPENSE_LEDGER_PAGE_SIZE;
  const toRow = fromRow + EXPENSE_LEDGER_PAGE_SIZE - 1;

  let query = supabase
    .from("expense_requests")
    .select(EXPENSE_REQUEST_SELECT, { count: "exact" })
    .order(dateField, { ascending: false, nullsFirst: false });

  if (dateField !== "created_at") {
    query = query.order("created_at", { ascending: false });
  }

  if (DATE_ONLY_FIELDS.has(dateField)) {
    if (normalized.from) query = query.gte(dateField, normalized.from);
    if (normalized.to) query = query.lt(dateField, shiftDate(normalized.to, 1));
  } else {
    const bounds = buildKstDateTimeBounds(normalized.from, normalized.to);
    if (bounds.fromInclusiveUtc) {
      query = query.gte(dateField, bounds.fromInclusiveUtc);
    }
    if (bounds.toExclusiveUtc) {
      query = query.lt(dateField, bounds.toExclusiveUtc);
    }
  }

  const { data, error, count } = await query.range(fromRow, toRow);
  if (error) throw new Error(error.message);

  const total = count ?? 0;
  return {
    requests: (data ?? []) as unknown as ExpenseRequestRecord[],
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / EXPENSE_LEDGER_PAGE_SIZE)),
  };
}

export type ExpenseWorkQueueResult = {
  requests: ExpenseRequestRecord[];
  total: number;
  truncated: boolean;
};

/**
 * 승인대기/지급대기는 조회기간과 별개인 업무함이다.
 * 기간을 바꿔도 오래된 미처리 건이 숨지 않도록 status로 직접 조회한다.
 */
export async function listExpenseActionQueue(): Promise<ExpenseWorkQueueResult> {
  const { supabase } = await getCurrentCompanyAccess();
  const { data, error, count } = await supabase
    .from("expense_requests")
    .select(EXPENSE_REQUEST_SELECT, { count: "exact" })
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: false })
    .range(0, EXPENSE_ACTION_QUEUE_LIMIT - 1);

  if (error) throw new Error(error.message);
  const total = count ?? 0;
  return {
    requests: (data ?? []) as unknown as ExpenseRequestRecord[],
    total,
    truncated: total > EXPENSE_ACTION_QUEUE_LIMIT,
  };
}

/**
 * 증빙 미첨부 업무함. PostgREST embedded relation `is.null`을 이용한 left anti-join으로
 * 최근 전체 지출을 먼저 다운로드하지 않고, 문서가 없는 건만 서버에서 직접 조회한다.
 */
export async function listExpenseMissingEvidenceQueue(): Promise<ExpenseWorkQueueResult> {
  const { supabase } = await getCurrentCompanyAccess();
  const { data, error, count } = await supabase
    .from("expense_requests")
    .select(EXPENSE_REQUEST_SELECT, { count: "exact" })
    .in("status", ["pending", "approved", "paid"])
    .is("expense_documents", null)
    .order("created_at", { ascending: false })
    .range(0, EXPENSE_EVIDENCE_QUEUE_LIMIT - 1);

  if (error) throw new Error(error.message);
  const total = count ?? 0;
  return {
    requests: (data ?? []) as unknown as ExpenseRequestRecord[],
    total,
    truncated: total > EXPENSE_EVIDENCE_QUEUE_LIMIT,
  };
}

/** 세무증빙 미확인만 서버에서 직접 조회해 관리자 페이지의 500-row 선로딩을 제거한다. */
export async function listExpenseTaxEvidenceQueue(): Promise<ExpenseWorkQueueResult> {
  const { supabase } = await getCurrentCompanyAccess();
  const { data, error, count } = await supabase
    .from("expense_requests")
    .select(EXPENSE_REQUEST_SELECT, { count: "exact" })
    .eq("tax_evidence_type", "unverified")
    .in("status", ["pending", "approved", "paid"])
    .neq("category", "labor")
    .order("created_at", { ascending: false })
    .range(0, EXPENSE_EVIDENCE_QUEUE_LIMIT - 1);

  if (error) throw new Error(error.message);
  const total = count ?? 0;
  return {
    requests: (data ?? []) as unknown as ExpenseRequestRecord[],
    total,
    truncated: total > EXPENSE_EVIDENCE_QUEUE_LIMIT,
  };
}
