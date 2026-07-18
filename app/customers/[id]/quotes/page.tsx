import Link from "next/link";
import { notFound } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import QuotesList from "@/components/quotes/QuotesList";
import { getCurrentUserAccess } from "@/lib/crm/access";
import { getCustomerById, getEmployees } from "@/lib/crm/customers";
import {
  schemaMissingDevHint,
  schemaMissingStaffMessage,
} from "@/lib/crm/dev-diagnostics";
import { isMissingRelationError } from "@/lib/crm/errors";
import { listQuotes } from "@/lib/crm/quote-mgmt";
import { createClient } from "@/lib/supabase-server";
import type { CustomerWithRelations, Employee, ErpQuote } from "@/types/database";

const MIGRATION_PATH =
  "supabase/migrations/20260724000001_quotes_and_simple_materials.sql";

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

type CustomerQuotesPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CustomerQuotesPage({
  params,
}: CustomerQuotesPageProps) {
  const { id: customerId } = await params;
  const userAccess = await getCurrentUserAccess();
  const devHint = schemaMissingDevHint(MIGRATION_PATH, userAccess.isAdmin);

  const customer = await getCustomerById(customerId).catch(
    () => null as CustomerWithRelations | null,
  );
  if (!customer || customer.deleted_at) notFound();

  let quotes: ErpQuote[] = [];
  let employees: Employee[] = [];
  let loadError: string | null = null;
  let tablesMissing = false;

  try {
    const [quoteList, employeeList] = await Promise.all([
      listQuotes({ customerId }),
      getEmployees(),
    ]);
    quotes = quoteList;
    employees = employeeList;
  } catch {
    tablesMissing = await isQuotesSchemaMissing();
    loadError = tablesMissing
      ? null
      : "견적 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400">
              {customer.name} · 견적관리
            </p>
            <h1 className="text-xl font-bold text-gray-900 lg:text-2xl">
              고객 견적 목록
            </h1>
          </div>
          <Link
            href={`/customers/${customerId}`}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            고객 상세로 돌아가기
          </Link>
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
            newHref={`/quotes/new?customerId=${customerId}`}
            hideCustomerColumn
            emptyMessage="등록된 견적이 없습니다. 새 견적을 등록해 보세요."
          />
        )}
      </div>
    </DashboardLayout>
  );
}
