import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import QuotesList from "@/components/quotes/QuotesList";
import { getCurrentUserAccess } from "@/lib/crm/access";
import {
  schemaMissingDevHint,
  schemaMissingStaffMessage,
} from "@/lib/crm/dev-diagnostics";
import { isMissingRelationError } from "@/lib/crm/errors";
import { listQuotesPage } from "@/lib/crm/quote-mgmt";
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

type QuotesPageProps = {
  searchParams: Promise<{
    q?: string;
    quoteType?: string;
    status?: string;
    employeeId?: string;
    lxOnly?: string;
    contractOnly?: string;
    createdFrom?: string;
    createdTo?: string;
    page?: string;
  }>;
};

export default async function QuotesPage({ searchParams }: QuotesPageProps) {
  const params = await searchParams;
  const userAccess = await getCurrentUserAccess();
  if (!userAccess.isAuthenticated || !userAccess.userId) redirect("/login");
  if (!userAccess.canAccessErp) redirect("/pending-approval");

  const access = await getScheduleAccess();
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const isAdmin = access.isAdmin;
  const lockEmployeeId =
    !access.canViewAll && !access.canViewTeam ? access.employeeId : null;
  const filters = {
    q: params.q,
    quoteType: params.quoteType,
    status: params.status,
    employeeId: lockEmployeeId ?? params.employeeId,
    lxOnly: params.lxOnly === "true",
    contractOnly: params.contractOnly === "true",
    createdFrom: params.createdFrom,
    createdTo: params.createdTo,
  };

  let quotes: ErpQuote[] = [];
  let total = 0;
  let totalPages = 1;
  let employees: Employee[] = [];
  let importCustomers: InteriorImportCustomerOption[] = [];
  let loadError: string | null = null;
  let lookupWarning = false;
  let tablesMissing = false;

  // 관리자/대표는 견적 범위 계산에 직원 목록이 필요하지 않으므로 견적 본문,
  // 담당자 옵션, Excel 업로드용 고객 옵션을 동시에 시작한다.
  const employeePromise = listEmployeesInScope(access);
  const customerPromise = listInteriorImportCustomers();
  const quotePromise = access.canViewAll
    ? listQuotesPage(filters, page, access, [])
    : employeePromise.then((scopedEmployees) =>
        listQuotesPage(filters, page, access, scopedEmployees),
      );

  const [employeeResult, customerResult, quoteResult] = await Promise.allSettled([
    employeePromise,
    customerPromise,
    quotePromise,
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

  if (quoteResult.status === "fulfilled") {
    quotes = quoteResult.value.quotes;
    total = quoteResult.value.total;
    totalPages = quoteResult.value.totalPages;
  } else {
    tablesMissing = await isQuotesSchemaMissing();
    loadError = tablesMissing
      ? null
      : "견적 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  const devHint = schemaMissingDevHint(MIGRATION_PATH, isAdmin);

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
            initialFilters={params}
            page={page}
            total={total}
            totalPages={totalPages}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
