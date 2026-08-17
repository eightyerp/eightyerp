import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(`Finance DateRange guard failed: ${message}`);
}

const collectionLedger = read("lib/crm/collection-ledger.ts");
const expenseLedger = read("lib/crm/expense-ledger.ts");
const collectionsPage = read("app/finance/collections/page.tsx");
const paymentsPage = read("app/finance/payments/page.tsx");
const toolbar = read("components/finance/FinanceDateRangeToolbar.tsx");
const collectionTable = read("components/finance/CollectionLedgerTable.tsx");
const expenseTable = read("components/finance/ExpenseLedgerTable.tsx");

assert(
  collectionLedger.includes("COLLECTION_LEDGER_PAGE_SIZE = 50"),
  "collection ledger must be paginated at 50 rows",
);
assert(
  expenseLedger.includes("EXPENSE_LEDGER_PAGE_SIZE = 50"),
  "expense ledger must be paginated at 50 rows",
);
assert(
  collectionLedger.includes('.select(COLLECTION_RECEIPT_SELECT, { count: "exact" })') &&
    collectionLedger.includes(".range(fromRow, toRow)"),
  "collection ledger must count + paginate in DB",
);
assert(
  expenseLedger.includes('.select(EXPENSE_REQUEST_SELECT, { count: "exact" })') &&
    expenseLedger.includes(".range(fromRow, toRow)"),
  "expense ledger must count + paginate in DB",
);

for (const field of ["received_at", "confirmed_at", "created_at"]) {
  assert(collectionLedger.includes(`\"${field}\"`), `collection date field ${field} missing`);
}
for (const field of ["expense_date", "payment_due_date", "paid_at", "created_at"]) {
  assert(expenseLedger.includes(`\"${field}\"`), `expense date field ${field} missing`);
}

assert(
  collectionLedger.includes("buildKstDateTimeBounds"),
  "collection timestamptz filters must use KST bounds",
);
assert(
  expenseLedger.includes("DATE_ONLY_FIELDS") &&
    expenseLedger.includes("buildKstDateTimeBounds"),
  "expense date/date-time fields must use type-aware ranges",
);
assert(
  expenseLedger.includes("shiftDate(normalized.to, 1)"),
  "expense date-only end date must be next-day exclusive",
);

assert(
  collectionLedger.includes('.eq("status", "pending")') &&
    !collectionLedger
      .slice(collectionLedger.indexOf("listCollectionPendingQueue"))
      .includes("buildKstDateTimeBounds"),
  "collection pending queue must not depend on selected date range",
);
assert(
  expenseLedger.includes('.in("status", ["pending", "approved"])'),
  "expense action queue must query unresolved statuses before limiting",
);
assert(
  expenseLedger.includes("truncated: total > EXPENSE_ACTION_QUEUE_LIMIT"),
  "expense action queue must disclose truncation",
);
assert(
  expenseLedger.includes('.is("expense_documents", null)') &&
    expenseLedger.includes("listExpenseMissingEvidenceQueue"),
  "missing-evidence queue must use a server-side anti-join instead of recent-N preload",
);
assert(
  expenseLedger.includes('.eq("tax_evidence_type", "unverified")') &&
    expenseLedger.includes("listExpenseTaxEvidenceQueue"),
  "tax-evidence queue must filter server-side",
);
assert(
  expenseLedger.includes("truncated: total > EXPENSE_EVIDENCE_QUEUE_LIMIT"),
  "evidence queues must disclose truncation",
);

assert(
  !collectionsPage.includes("listCollectionReceipts"),
  "collections page must not use legacy recent-N ledger loader",
);
assert(
  collectionsPage.includes("listCollectionLedgerPage") &&
    collectionsPage.includes("listCollectionPendingQueue"),
  "collections page must separate ledger and pending queue",
);
assert(
  collectionsPage.includes("receipts={pendingQueue.receipts}"),
  "staff/admin pending totals must remain date-independent",
);
assert(
  paymentsPage.includes("listExpenseLedgerPage") &&
    paymentsPage.includes("listExpenseActionQueue"),
  "payments page must separate ledger and action queue",
);
assert(
  paymentsPage.includes("listExpenseMissingEvidenceQueue") &&
    paymentsPage.includes("listExpenseTaxEvidenceQueue"),
  "payments page must use specialized evidence queues",
);
assert(
  !paymentsPage.includes("listExpenseRequests(access.isFinanceAdmin ? 500") &&
    !paymentsPage.includes("listExpenseRequests(500)"),
  "admin finance page must not preload 500 full expense rows",
);
assert(
  paymentsPage.includes("requests={ledger.requests}") &&
    paymentsPage.includes("requests={actionQueue.requests}"),
  "payments page must not feed filtered ledger rows into unresolved-work UI",
);

assert(
  toolbar.includes('params.delete("page")') && toolbar.includes("DateRangeFilter"),
  "finance toolbar must preserve URL state and reset pagination when filters change",
);
assert(
  collectionTable.includes("현재 페이지 취소 제외 합계"),
  "collection amount must be explicitly labeled as current-page summary",
);
assert(
  expenseTable.includes("현재 페이지 지급완료") &&
    expenseTable.includes("현재 페이지 손익원가"),
  "expense money summaries must be explicitly labeled as current-page values",
);

console.log("ERP finance DateRange contract PASS");
