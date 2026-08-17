import { getCurrentCompanyAccess } from "@/lib/crm/access";
import type { CollectionReceipt } from "@/lib/crm/collection-shared";
import { buildKstDateTimeBounds } from "@/lib/date-range";

export const COLLECTION_LEDGER_PAGE_SIZE = 50;
export const COLLECTION_PENDING_QUEUE_LIMIT = 100;

export type CollectionLedgerDateField =
  | "received_at"
  | "confirmed_at"
  | "created_at";

export const COLLECTION_LEDGER_DATE_FIELDS: ReadonlyArray<{
  value: CollectionLedgerDateField;
  label: string;
}> = [
  { value: "received_at", label: "실제 수금일" },
  { value: "confirmed_at", label: "확정일" },
  { value: "created_at", label: "등록일" },
];

const DATE_FIELD_SET = new Set<CollectionLedgerDateField>(
  COLLECTION_LEDGER_DATE_FIELDS.map((item) => item.value),
);

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

export function normalizeCollectionLedgerDateField(
  value: string | null | undefined,
): CollectionLedgerDateField {
  return DATE_FIELD_SET.has(value as CollectionLedgerDateField)
    ? (value as CollectionLedgerDateField)
    : "received_at";
}

export type CollectionLedgerPageResult = {
  receipts: CollectionReceipt[];
  total: number;
  page: number;
  totalPages: number;
};

export async function listCollectionLedgerPage(input: {
  dateField?: string | null;
  from?: string | null;
  to?: string | null;
  page?: number;
  customerId?: string | null;
}): Promise<CollectionLedgerPageResult> {
  const { supabase } = await getCurrentCompanyAccess();
  const dateField = normalizeCollectionLedgerDateField(input.dateField);
  const bounds = buildKstDateTimeBounds(input.from, input.to);
  if (bounds.error) throw new Error(bounds.error);

  const page = Math.max(1, input.page ?? 1);
  const fromRow = (page - 1) * COLLECTION_LEDGER_PAGE_SIZE;
  const toRow = fromRow + COLLECTION_LEDGER_PAGE_SIZE - 1;

  let query = supabase
    .from("collection_receipts")
    .select(COLLECTION_RECEIPT_SELECT, { count: "exact" })
    .order(dateField, { ascending: false, nullsFirst: false });

  if (dateField !== "created_at") {
    query = query.order("created_at", { ascending: false });
  }
  if (input.customerId) query = query.eq("customer_id", input.customerId);
  if (bounds.fromInclusiveUtc) {
    query = query.gte(dateField, bounds.fromInclusiveUtc);
  }
  if (bounds.toExclusiveUtc) {
    query = query.lt(dateField, bounds.toExclusiveUtc);
  }

  const { data, error, count } = await query.range(fromRow, toRow);
  if (error) throw new Error(error.message);

  const total = count ?? 0;
  return {
    receipts: (data ?? []) as unknown as CollectionReceipt[],
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / COLLECTION_LEDGER_PAGE_SIZE)),
  };
}

export type CollectionPendingQueueResult = {
  receipts: CollectionReceipt[];
  total: number;
  truncated: boolean;
};

/**
 * 업무함은 조회기간과 분리한다. 오래된 확인대기가 기간필터 때문에 사라지면 안 된다.
 * 화면 과부하를 막기 위해 최근 100건만 상세 표시하되 total을 별도 count해 잘림을 숨기지 않는다.
 */
export async function listCollectionPendingQueue(): Promise<CollectionPendingQueueResult> {
  const { supabase } = await getCurrentCompanyAccess();
  const { data, error, count } = await supabase
    .from("collection_receipts")
    .select(COLLECTION_RECEIPT_SELECT, { count: "exact" })
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .range(0, COLLECTION_PENDING_QUEUE_LIMIT - 1);

  if (error) throw new Error(error.message);
  const total = count ?? 0;
  return {
    receipts: (data ?? []) as unknown as CollectionReceipt[],
    total,
    truncated: total > COLLECTION_PENDING_QUEUE_LIMIT,
  };
}
