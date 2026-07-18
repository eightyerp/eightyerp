import Link from "next/link";
import { notFound } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CustomerDetailPanels from "@/components/customers/CustomerDetailPanels";
import { getCurrentUserAccess } from "@/lib/crm/access";
import { listCustomerSchedules } from "@/lib/crm/customer-schedules";
import {
  getCustomerById,
  getCustomerConsultLogs,
  getEmployees,
} from "@/lib/crm/customers";
import { listCustomerProjects } from "@/lib/crm/projects";
import { listQuotes } from "@/lib/crm/quote-mgmt";
import { schemaMissingStaffMessage } from "@/lib/crm/dev-diagnostics";
import { toCrmErrorMessage } from "@/lib/crm/errors";
import type {
  CustomerConsultLog,
  CustomerQuote,
  CustomerQuoteSend,
  CustomerSchedule,
  CustomerWithRelations,
  Employee,
  ErpQuote,
  Project,
} from "@/types/database";

type CustomerDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ updated?: string }>;
};

export default async function CustomerDetailPage({
  params,
  searchParams,
}: CustomerDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const access = await getCurrentUserAccess();

  let loadError: string | null = null;
  let consultWarning: string | null = null;
  let quoteWarning: string | null = null;
  let customer: CustomerWithRelations | null = null;
  let consultLogs: CustomerConsultLog[] = [];
  let quotes: CustomerQuote[] = [];
  let quoteSendsByQuoteId: Record<string, CustomerQuoteSend[]> = {};
  let erpQuotes: ErpQuote[] = [];
  let schedules: CustomerSchedule[] = [];
  let employees: Employee[] = [];
  let projects: Project[] = [];
  let projectsWarning: string | null = null;

  try {
    const [found, empList] = await Promise.all([
      getCustomerById(id),
      getEmployees(),
    ]);
    customer = found;
    employees = empList;

    try {
      projects = await listCustomerProjects(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/projects|schema cache|Could not find/i.test(message)) {
        projectsWarning = schemaMissingStaffMessage("현장");
      } else {
        throw error;
      }
    }

    if (customer && !customer.deleted_at) {
      try {
        consultLogs = await getCustomerConsultLogs(id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/customer_consult_logs|schema cache|Could not find/i.test(message)) {
          consultWarning = schemaMissingStaffMessage("상담이력");
        } else {
          throw error;
        }
      }

      try {
        const { getCustomerQuotes, getQuoteSends } = await import(
          "@/lib/crm/quotes"
        );
        quotes = await getCustomerQuotes(id);
        const sendEntries = await Promise.all(
          quotes.map(async (quote) => {
            try {
              const sends = await getQuoteSends(quote.id);
              return [quote.id, sends] as const;
            } catch {
              return [quote.id, [] as CustomerQuoteSend[]] as const;
            }
          }),
        );
        quoteSendsByQuoteId = Object.fromEntries(sendEntries);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/customer_quotes|schema cache|Could not find/i.test(message)) {
          // legacy optional
        } else {
          throw error;
        }
      }

      try {
        erpQuotes = await listQuotes({ customerId: id });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/quotes|schema cache|Could not find/i.test(message)) {
          quoteWarning = schemaMissingStaffMessage("견적");
        } else {
          throw error;
        }
      }

      try {
        schedules = await listCustomerSchedules({ customerId: id });
      } catch {
        schedules = [];
      }
    }
  } catch (error) {
    loadError = toCrmErrorMessage(error);
  }

  if (!customer || customer.deleted_at) {
    notFound();
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400">고객 상세</p>
            <h1 className="text-xl font-bold text-gray-900 lg:text-2xl">
              {customer.name}
            </h1>
          </div>
          <Link
            href="/customers"
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            목록으로
          </Link>
        </div>

        {query.updated && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            고객 정보가 수정되었습니다.
          </div>
        )}

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {consultWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {consultWarning}
          </div>
        )}

        {quoteWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {quoteWarning}
          </div>
        )}

        {projectsWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {projectsWarning}
          </div>
        )}

        {!loadError && (
          <CustomerDetailPanels
            customer={customer}
            consultLogs={consultLogs}
            quotes={quotes}
            quoteSendsByQuoteId={quoteSendsByQuoteId}
            erpQuotes={erpQuotes}
            schedules={schedules}
            employees={employees}
            projects={projects}
            canDelete={access.isAdmin}
            isAdmin={access.isAdmin}
            currentEmployeeId={access.profile?.employee_id ?? null}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
