import Link from "next/link";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import InquiryImportForm from "@/components/customers/InquiryImportForm";
import { getCurrentUserAccess } from "@/lib/crm/access";
import { getEmployees, getLeadSources } from "@/lib/crm/customers";
import {
  schemaMissingDevHint,
  schemaMissingStaffMessage,
} from "@/lib/crm/dev-diagnostics";
import { toCrmErrorMessage } from "@/lib/crm/errors";
import type { Employee, LeadSource } from "@/types/database";

export default async function CustomerImportPage() {
  const access = await getCurrentUserAccess();
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
  const crmDevHint = schemaMissingDevHint(
    "supabase/migrations/20260716000000_crm_customers.sql",
    access.isAdmin,
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 lg:text-2xl">
              문의 자동등록
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              온라인·문자·카카오톡·LX하우시스 본사 문의를 분석해 고객으로
              등록합니다.
            </p>
          </div>
          <Link
            href="/customers"
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            목록으로
          </Link>
        </div>

        {tablesMissing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold">
              {schemaMissingStaffMessage("고객관리")}
            </p>
            {crmDevHint && <p className="mt-2 text-xs">{crmDevHint}</p>}
          </div>
        )}

        {loadError && !tablesMissing && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            문의 등록 화면을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </div>
        )}

        {!loadError && (
          <InquiryImportForm
            employees={employees}
            leadSources={leadSources}
            defaultAssignedEmployeeId={access.profile?.employee_id ?? null}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
