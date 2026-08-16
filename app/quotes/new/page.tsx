import DashboardLayout from "@/components/dashboard/DashboardLayout";
import QuoteWizardForm from "@/components/quotes/QuoteWizardForm";
import { getCurrentUserAccess } from "@/lib/crm/access";
import {
  schemaMissingDevHint,
  schemaMissingStaffMessage,
} from "@/lib/crm/dev-diagnostics";
import { isMissingRelationError } from "@/lib/crm/errors";
import { getCustomerById, getCustomers, getEmployees } from "@/lib/crm/customers";
import { getCurrentCompanyQuoteBrand } from "@/lib/crm/quote-brand";
import type { QuoteBrandProfile } from "@/lib/crm/quote-brand-shared";
import { getCurrentCompanyQuoteVatSettings } from "@/lib/crm/company-quote-vat";
import type { QuoteVatMode } from "@/lib/crm/quote-constants";
import { createClient } from "@/lib/supabase-server";
import type { Employee } from "@/types/database";

const MIGRATION_PATH =
  "supabase/migrations/20260724000001_quotes_and_simple_materials.sql";

type WizardCustomer = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  assigned_employee_id: string | null;
};

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
  searchParams: Promise<{ customerId?: string; projectId?: string; consultationId?: string; inspectionId?: string }>;
};

export default async function NewQuotePage({
  searchParams,
}: NewQuotePageProps) {
  const params = await searchParams;
  const customerId = params.customerId?.trim() || null;
  const projectId = params.projectId?.trim() || null;
  const consultationId = params.consultationId?.trim() || null;
  const inspectionId = params.inspectionId?.trim() || null;
  const userAccess = await getCurrentUserAccess();
  const devHint = schemaMissingDevHint(MIGRATION_PATH, userAccess.isAdmin);

  let customers: WizardCustomer[] = [];
  let employees: Employee[] = [];
  let brand: QuoteBrandProfile | null = null;
  let companyVatSettings: {
    quote_vat_input_mode: QuoteVatMode;
    quote_vat_rate: number;
  } | null = null;
  let loadError: string | null = null;
  let verifiedConsultationId: string | null = null;
  let verifiedInspectionId: string | null = null;
  let verifiedProjectId: string | null = null;
  const tablesMissing = await isQuotesSchemaMissing();

  try {
    const [customerList, employeeList, companyBrand, vatSettings] =
      await Promise.all([
        getCustomers({ pageSize: 100 }),
        getEmployees(),
        getCurrentCompanyQuoteBrand(),
        getCurrentCompanyQuoteVatSettings(),
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
    companyVatSettings = {
      quote_vat_input_mode: vatSettings.quote_vat_input_mode,
      quote_vat_rate: vatSettings.quote_vat_rate,
    };

    if (customerId && !customers.some((c) => c.id === customerId)) {
      const found = await getCustomerById(customerId);
      if (found && !found.deleted_at) {
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
    if (customerId && userAccess.profile?.active_company_id) {
      const supabase = await createClient();
      if (projectId) {
        const { data } = await supabase.from("projects").select("id")
          .eq("id", projectId).eq("customer_id", customerId)
          .eq("company_id", userAccess.profile.active_company_id).is("deleted_at", null).maybeSingle();
        verifiedProjectId = data?.id ?? null;
      }
      if (inspectionId && verifiedProjectId) {
        const { data } = await supabase.from("window_inspections").select("id")
          .eq("id", inspectionId).eq("customer_id", customerId)
          .eq("company_id", userAccess.profile.active_company_id)
          .eq("project_id", verifiedProjectId).maybeSingle();
        verifiedInspectionId = data?.id ?? null;
      }
      if (consultationId && verifiedProjectId && verifiedInspectionId) {
        const { data } = await supabase.from("customer_consult_logs").select("id")
          .eq("id", consultationId).eq("customer_id", customerId)
          .eq("company_id", userAccess.profile.active_company_id)
          .eq("source_project_id", verifiedProjectId)
          .eq("source_inspection_id", verifiedInspectionId).maybeSingle();
        verifiedConsultationId = data?.id ?? null;
      }
    }
  } catch {
    loadError = "고객 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-xs font-medium text-slate-600">견적관리</p>
          <h1 className="text-xl font-bold text-slate-900 lg:text-2xl">
            새 견적 등록
          </h1>
        </div>

        {tablesMissing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold">
              {schemaMissingStaffMessage("견적관리")}
            </p>
            {devHint && <p className="mt-2 text-xs">{devHint}</p>}
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
            initialProjectId={verifiedProjectId}
            initialConsultationId={verifiedConsultationId}
            initialInspectionId={verifiedInspectionId}
            brand={brand}
            companyVatSettings={companyVatSettings}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
