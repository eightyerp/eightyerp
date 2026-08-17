import DashboardLayout from "@/components/dashboard/DashboardLayout";
import QuotesList from "@/components/quotes/QuotesList";
import {
  schemaMissingDevHint,
  schemaMissingStaffMessage,
} from "@/lib/crm/dev-diagnostics";
import { isMissingRelationError } from "@/lib/crm/errors";
import { listQuotesPageWithDateRange } from "@/lib/crm/quote-list-date-range";
import {
  listInteriorImportCustomers,
  type InteriorImportCustomerOption,
} from "@/lib/crm/interior-quote-import";
import {
  getScheduleAccess,
  listEmployeesInScope,
} from "@/lib/crm/schedule-access";
import { normalizeDateRange } from "@/lib/date-range";
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

type QuotesPageProps = {
  searchParams: Promise<{
    q?: string;
    quoteType?: string;
    status?: string;
    employeeId?: string;
    lxOnly?: string;
    contractOnly?: string;
    from?: string;
    to?: string;
    /** legacy DateRange aliases */
    createdFrom?: string;
    createdTo?: string;
    page?: string;
  }>;
};

export default async function QuotesPage({ searchParams }: QuotesPageProps) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const dateRange = normalizeDateRange(
    params.from ?? params.createdFrom,
    params.to ?? params.createdTo,
  );
  const normalizedFrom = dateRange.error ? undefined : dateRange.from || undefined;
  const normalizedTo = dateRange.error ? undefined : dateRange.to || undefined;

  let quotes: ErpQuote[] = [];
  let total = 0;
  let totalPages = 1;
  let employees: Employee[] = [];
  let importCustomers: InteriorImportCustomerOption[] = [];
  let lockEmployeeId: string | null = null;
  let loadError: string | null = dateRange.error;
  let lookupWarning = false;
  let tablesMissing = false;
  let isAdmin = false;

  if (!dateRange.error) {
    try {
      const access = await getScheduleAccess();
      isAdmin = access.isAdmin;
      lockEmployeeId =
        !access.canViewAll && !access.canViewTeam ? access.employeeId : null;

      const [employeeResult, customerResult] = await Promise.allSettled([
        listEmployeesInScope(access),
        listInteriorImportCustomers(),
      ]);

      if (employeeResult.status === "fulfilled") {
        employees = employeeResult.value;
      } else {
        lookupWarning = true;
      }

      if (customerResult.status === "fulfilled") {
        importCustomers = customerResult.value;
      } else {
        lookupWarning = true;
      }

      const result = await listQuotesPageWithDateRange(
        {
          q: params.q,
          quoteType: params.quoteType,
          status: params.status,
          employeeId: lockEmployeeId ?? params.employeeId,
          lxOnly: params.lxOnly === "true",
          contractOnly: params.contractOnly === "true",
          createdFrom: normalizedFrom,
          createdTo: normalizedTo,
        },
        page,
        access,
        employees,
      );
      quotes = result.quotes;
      total = result.total;
      totalPages = result.totalPages;
    } catch {
      tablesMissing = await isQuotesSchemaMissing();
      loadError = tablesMissing
        ? null
        : "견적 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    }
  }

  const devHint = schemaMissingDevHint(MIGRATION_PATH, isAdmin);
  const normalizedFilters = {
    ...params,
    from: normalizedFrom,
    to: normalizedTo,
    createdFrom: undefined,
    createdTo: undefined,
  };

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
            {dateRange.error
              ? dateRange.error
              : "견적 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}
          </div>
        )}

        {lookupWarning && !loadError && !tablesMissing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            일부 담당자 또는 인테리어 업로드용 고객 목록을 불러오지 못했습니다. 기존 견적 목록은 계속 이용할 수 있습니다.
          </div>
        )}

        {!loadError && (
          <QuotesList
            quotes={quotes}
            employees={employees}
            importCustomers={importCustomers}
            lockEmployeeId={lockEmployeeId}
            initialFilters={normalizedFilters}
            page={page}
            total={total}
            totalPages={totalPages}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
