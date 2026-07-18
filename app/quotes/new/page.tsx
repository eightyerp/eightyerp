import DashboardLayout from "@/components/dashboard/DashboardLayout";
import QuoteWizardForm from "@/components/quotes/QuoteWizardForm";
import { isMissingRelationError } from "@/lib/crm/errors";
import { getCustomerById, getCustomers, getEmployees } from "@/lib/crm/customers";
import { createClient } from "@/lib/supabase-server";
import type { Employee } from "@/types/database";

const MIGRATION_HINT =
  "supabase/migrations/20260724000001_quotes_and_simple_materials.sql 을 Supabase SQL Editor에서 실행해 주세요.";

type WizardCustomer = { id: string; name: string; phone: string; address: string | null };

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

type NewQuotePageProps = {
  searchParams: Promise<{ customerId?: string }>;
};

export default async function NewQuotePage({
  searchParams,
}: NewQuotePageProps) {
  const params = await searchParams;
  const customerId = params.customerId?.trim() || null;

  let customers: WizardCustomer[] = [];
  let employees: Employee[] = [];
  let loadError: string | null = null;
  const tablesMissing = await isQuotesSchemaMissing();

  try {
    const [customerList, employeeList] = await Promise.all([
      getCustomers({ pageSize: 100 }),
      getEmployees(),
    ]);
    customers = customerList.customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      address: c.address,
    }));
    employees = employeeList;

    if (customerId && !customers.some((c) => c.id === customerId)) {
      const found = await getCustomerById(customerId);
      if (found && !found.deleted_at) {
        customers = [
          { id: found.id, name: found.name, phone: found.phone, address: found.address },
          ...customers,
        ];
      }
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : "고객 목록을 불러오지 못했습니다.";
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-xs font-medium text-gray-400">견적관리</p>
          <h1 className="text-xl font-bold text-gray-900 lg:text-2xl">
            새 견적 등록
          </h1>
        </div>

        {tablesMissing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold">견적관리 테이블을 찾을 수 없습니다.</p>
            <p className="mt-2">{MIGRATION_HINT}</p>
          </div>
        )}

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {!loadError && !tablesMissing && (
          <QuoteWizardForm
            mode="create"
            employees={employees}
            customers={customers}
            initialCustomerId={customerId}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
