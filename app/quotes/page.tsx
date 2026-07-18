import DashboardLayout from "@/components/dashboard/DashboardLayout";
import QuotesList from "@/components/quotes/QuotesList";
import { isMissingRelationError } from "@/lib/crm/errors";
import { listQuotes } from "@/lib/crm/quote-mgmt";
import {
  getScheduleAccess,
  listEmployeesInScope,
} from "@/lib/crm/schedule-access";
import { createClient } from "@/lib/supabase-server";
import type { Employee, ErpQuote } from "@/types/database";

const MIGRATION_HINT =
  "supabase/migrations/20260724000001_quotes_and_simple_materials.sql 과 20260726000001_quotes_management_v1.sql 을 Supabase SQL Editor에서 실행해 주세요.";

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
  let quotes: ErpQuote[] = [];
  let employees: Employee[] = [];
  let lockEmployeeId: string | null = null;
  let loadError: string | null = null;
  let tablesMissing = false;

  try {
    const access = await getScheduleAccess();
    lockEmployeeId =
      !access.canViewAll && !access.canViewTeam ? access.employeeId : null;
    const [quoteList, employeeList] = await Promise.all([
      listQuotes(),
      listEmployeesInScope(access),
    ]);
    quotes = quoteList;
    employees = employeeList;
  } catch (error) {
    tablesMissing = await isQuotesSchemaMissing();
    loadError =
      error instanceof Error ? error.message : "견적 목록을 불러오지 못했습니다.";
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 lg:text-2xl">
            견적관리
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            창호 · 인테리어 견적 등록 · 버전관리 · 발송 · 계약견적 지정
          </p>
        </div>

        {tablesMissing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold">견적관리 테이블을 찾을 수 없습니다.</p>
            <p className="mt-2">{MIGRATION_HINT}</p>
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
            lockEmployeeId={lockEmployeeId}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
