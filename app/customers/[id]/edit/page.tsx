import Link from "next/link";
import { notFound } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CustomerForm from "@/components/customers/CustomerForm";
import { getCurrentUserAccess } from "@/lib/crm/access";
import {
  getCustomerById,
  getEmployees,
  getLeadSources,
} from "@/lib/crm/customers";
import {
  schemaMissingDevHint,
  schemaMissingStaffMessage,
} from "@/lib/crm/dev-diagnostics";
import { toCrmErrorMessage } from "@/lib/crm/errors";
import type { Employee, LeadSource } from "@/types/database";

type EditCustomerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCustomerPage({
  params,
}: EditCustomerPageProps) {
  const { id } = await params;
  const access = await getCurrentUserAccess();

  let employees: Employee[] = [];
  let leadSources: LeadSource[] = [];
  let loadError: string | null = null;
  let customer = null;

  try {
    [customer, employees, leadSources] = await Promise.all([
      getCustomerById(id),
      getEmployees(),
      getLeadSources(),
    ]);
  } catch (error) {
    loadError = toCrmErrorMessage(error);
  }

  if (!loadError && !customer) {
    notFound();
  }

  const tablesMissing = loadError === "CRM_TABLES_MISSING";
  const crmDevHint = schemaMissingDevHint(
    "supabase/migrations/20260716000001_reload_crm_schema.sql",
    access.isAdmin,
  );

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 lg:text-2xl">
              고객 수정
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {customer
                ? `${customer.name} 고객 정보를 수정합니다.`
                : "고객 정보를 수정합니다."}
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
            고객 수정 화면을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </div>
        )}

        {!loadError && customer && (
          <CustomerForm
            customer={customer}
            employees={employees}
            leadSources={leadSources}
            isAdmin={access.isAdmin}
            canChangeAssignee={access.isAdmin}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
