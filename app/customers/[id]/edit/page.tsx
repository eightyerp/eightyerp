import Link from "next/link";
import { notFound } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CustomerForm from "@/components/customers/CustomerForm";
import {
  getCustomerById,
  getEmployees,
  getLeadSources,
} from "@/lib/crm/customers";
import { toCrmErrorMessage } from "@/lib/crm/errors";
import type { Employee, LeadSource } from "@/types/database";

type EditCustomerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCustomerPage({
  params,
}: EditCustomerPageProps) {
  const { id } = await params;

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
            <p className="font-semibold">CRM 테이블을 API에서 찾을 수 없습니다.</p>
            <p className="mt-2">
              Supabase SQL Editor에서
              <code className="mx-1 rounded bg-white/80 px-1.5 py-0.5 text-xs">
                supabase/migrations/20260716000001_reload_crm_schema.sql
              </code>
              를 실행한 뒤 새로고침해 주세요.
            </p>
          </div>
        )}

        {loadError && !tablesMissing && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {!loadError && customer && (
          <CustomerForm
            customer={customer}
            employees={employees}
            leadSources={leadSources}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
