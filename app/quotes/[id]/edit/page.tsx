import Link from "next/link";
import { notFound } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import QuoteWizardForm from "@/components/quotes/QuoteWizardForm";
import { getCustomerById, getCustomers, getEmployees } from "@/lib/crm/customers";
import { getCurrentCompanyQuoteBrand } from "@/lib/crm/quote-brand";
import type { QuoteBrandProfile } from "@/lib/crm/quote-brand-shared";
import { getQuoteById } from "@/lib/crm/quote-mgmt";
import type { Employee, ErpQuote } from "@/types/database";

type WizardCustomer = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  assigned_employee_id: string | null;
};

type EditQuotePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditQuotePage({ params }: EditQuotePageProps) {
  const { id } = await params;

  let quote: ErpQuote | null = null;
  let customers: WizardCustomer[] = [];
  let employees: Employee[] = [];
  let brand: QuoteBrandProfile | null = null;
  let loadError: string | null = null;

  try {
    quote = await getQuoteById(id);
    if (quote) {
      const [customerList, employeeList, companyBrand] = await Promise.all([
        getCustomers({ pageSize: 100 }),
        getEmployees(),
        getCurrentCompanyQuoteBrand(),
      ]);
      customers = customerList.customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        address: c.address,
        assigned_employee_id: c.assigned_employee_id ?? null,
      }));
      employees = employeeList;
      brand = companyBrand;

      if (!customers.some((c) => c.id === quote!.customer_id)) {
        const found = await getCustomerById(quote.customer_id);
        if (found) {
          customers = [
            {
              id: found.id,
              name: found.name,
              phone: found.phone,
              address: found.address,
              assigned_employee_id: found.assigned_employee_id ?? null,
            },
            ...customers,
          ];
        }
      }
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : "견적을 불러오지 못했습니다.";
  }

  if (!loadError && !quote) {
    notFound();
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400">견적관리</p>
            <h1 className="text-xl font-bold text-gray-900 lg:text-2xl">
              견적 수정
            </h1>
          </div>
          {quote && (
            <Link
              href={`/quotes/${quote.id}`}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              상세로 돌아가기
            </Link>
          )}
        </div>

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {quote && (
          <QuoteWizardForm
            mode="edit"
            employees={employees}
            customers={customers}
            initialQuote={quote}
            brand={brand}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
