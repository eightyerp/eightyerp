import DashboardLayout from "@/components/dashboard/DashboardLayout";
import QuotesList from "@/components/quotes/QuotesList";
import { getCurrentUserAccess } from "@/lib/crm/access";
import {
  schemaMissingDevHint,
  schemaMissingStaffMessage,
} from "@/lib/crm/dev-diagnostics";
import { isMissingRelationError } from "@/lib/crm/errors";
import { listQuotes } from "@/lib/crm/quote-mgmt";
import {
  listInteriorImportCustomers,
  type InteriorImportCustomerOption,
} from "@/lib/crm/interior-quote-import";
import {
  getScheduleAccess,
  listEmployeesInScope,
} from "@/lib/crm/schedule-access";
import { createClient } from "@/lib/supabase-server";
import type { Employee, ErpQuote } from "@/types/database";

const MIGRATION_PATH =
  "supabase/migrations/20260724000001_quotes_and_simple_materials.sql (+ 20260726000001_quotes_management_v1.sql)";

async function isQuotesSchemaMissing(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("quotes").select("id").limit(1);
    if (!error) return false;
    return isMissingRelationError(new Error(error.message));
  } catch {
    return false;
  }
}

export default async function QuotesPage() {
  const userAccess = await getCurrentUserAccess();
  const devHint = schemaMissingDevHint(MIGRATION_PATH, userAccess.isAdmin);
  let quotes: ErpQuote[] = [];
  let employees: Employee[] = [];
  let importCustomers: InteriorImportCustomerOption[] = [];
  let lockEmployeeId: string | null = null;
  let loadError: string | null = null;
  let tablesMissing = false;

  try {
    const access = await getScheduleAccess();
    lockEmployeeId =
      !access.canViewAll && !access.canViewTeam ? access.employeeId : null;
    const [quoteList, employeeList, customerList] = await Promise.all([
      listQuotes(),
      listEmployeesInScope(access),
      listInteriorImportCustomers(),
    ]);
    quotes = quoteList;
    employees = employeeList;
    importCustomers = customerList;
  } catch {
    tablesMissing = await isQuotesSchemaMissing();
    loadError = tablesMissing
      ? null
      : "견적 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 lg:text-2xl">
            견적관리
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            창호 · 인테리어 견적 등록 · 버전관리 · 발송 · 계약견적 지정
          </p>
        </div>

        {tablesMissing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold">
              {schemaMissingStaffMessage("견적관리")}
            </p>
            {devHint && <p className="mt-2 text-xs">{devHint}</p>}
          </div>
        )}

        {loadError && !tablesMissing && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {!loadError && (
          <QuotesList
            quotes={quotes}
            employees={employees}
            importCustomers={importCustomers}
            lockEmployeeId={lockEmployeeId}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
