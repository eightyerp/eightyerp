import Link from "next/link";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CustomerForm from "@/components/customers/CustomerForm";
import { getCurrentUserAccess } from "@/lib/crm/access";
import { getEmployees, getLeadSources } from "@/lib/crm/customers";
import { canShowDevDiagnostics } from "@/lib/crm/dev-diagnostics";
import { toCrmErrorMessage } from "@/lib/crm/errors";
import type { Employee, LeadSource } from "@/types/database";

export default async function NewCustomerPage() {
  const access = await getCurrentUserAccess();
  const showDiagnostics = canShowDevDiagnostics(access.isAdmin);

  let employees: Employee[] = [];
  let leadSources: LeadSource[] = [];
  let loadError: string | null = null;

  try {
    [employees, leadSources] = await Promise.all([
      getEmployees(),
      getLeadSources(),
    ]);
  } catch (error) {
    loadError = toCrmErrorMessage(error);
  }

  const tablesMissing = loadError === "CRM_TABLES_MISSING";

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 lg:text-2xl">
              신규 고객 등록
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              고객 정보를 입력하고 CRM에 등록합니다.
            </p>
          </div>
          <Link
            href="/customers"
            className="hidden min-h-11 items-center justify-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 sm:inline-flex"
          >
            목록으로
          </Link>
        </div>

        {tablesMissing && showDiagnostics && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold">CRM 테이블이 아직 생성되지 않았습니다.</p>
            <p className="mt-2">
              Supabase SQL Editor에서
              <code className="mx-1 rounded bg-white/80 px-1.5 py-0.5 text-xs">
                supabase/migrations/20260716000000_crm_customers.sql
              </code>
              를 실행한 뒤 다시 시도해 주세요.
            </p>
          </div>
        )}

        {tablesMissing && !showDiagnostics && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            지금은 고객을 등록할 수 없습니다. 관리자에게 문의해 주세요.
          </div>
        )}

        {loadError && !tablesMissing && showDiagnostics && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {loadError && !tablesMissing && !showDiagnostics && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            고객 등록 화면을 불러오지 못했습니다. 잠시 후 다시 시도하거나
            관리자에게 문의해 주세요.
          </div>
        )}

        {/* 상담유형 migration 안내: 페이지 로드 시 사전 노출하지 않음.
            실제 등록 오류 시에만 CustomerForm이 개발+admin에게 diagnosticHint 표시 */}

        {!loadError && leadSources.length === 0 && showDiagnostics && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            [개발] 유입경로 데이터가 없습니다.
            <code className="mx-1 rounded bg-white/80 px-1.5 py-0.5 text-xs">
              supabase/migrations/20260716000006_customer_registration_options.sql
            </code>
          </div>
        )}

        {!loadError && (
          <CustomerForm
            employees={employees}
            leadSources={leadSources}
            defaultAssignedEmployeeId={access.profile?.employee_id ?? null}
            isAdmin={access.isAdmin}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
