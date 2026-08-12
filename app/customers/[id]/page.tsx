import Link from "next/link";
import { notFound } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CustomerDetailPanels from "@/components/customers/CustomerDetailPanels";
import CustomerInfoPushButton from "@/components/customers/CustomerInfoPushButton";
import { getCurrentUserAccess } from "@/lib/crm/access";
import { listCustomerSchedules } from "@/lib/crm/customer-schedules";
import {
  getCustomerActivities,
  getCustomerById,
  getCustomerConsultLogs,
  getEmployees,
} from "@/lib/crm/customers";
import { listCustomerProjects } from "@/lib/crm/projects";
import { listQuotes } from "@/lib/crm/quote-mgmt";
import {
  canShowDevDiagnostics,
  panelLoadFailedStaffMessage,
  panelPermissionStaffMessage,
  schemaMissingDevHint,
  schemaMissingStaffMessage,
} from "@/lib/crm/dev-diagnostics";
import {
  classifyCrmPanelLoadError,
  toCrmErrorMessage,
} from "@/lib/crm/errors";
import type {
  CustomerActivity,
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

function panelWarning(
  featureLabel: string,
  error: unknown,
  migrationPath: string,
  isAdmin: boolean,
): { message: string; devHint: string | null } {
  const kind = classifyCrmPanelLoadError(error);
  if (kind === "missing_relation") {
    return {
      message: schemaMissingStaffMessage(featureLabel),
      devHint: schemaMissingDevHint(migrationPath, isAdmin),
    };
  }
  if (kind === "permission") {
    return {
      message: panelPermissionStaffMessage(featureLabel),
      devHint: null,
    };
  }
  return {
    message: panelLoadFailedStaffMessage(featureLabel),
    devHint:
      canShowDevDiagnostics(isAdmin) && error instanceof Error
        ? `[개발] ${error.message}`
        : null,
  };
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: CustomerDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const access = await getCurrentUserAccess();

  let loadError: string | null = null;
  let consultWarning: string | null = null;
  let consultDevHint: string | null = null;
  let quoteWarning: string | null = null;
  let quoteDevHint: string | null = null;
  let customer: CustomerWithRelations | null = null;
  let consultLogs: CustomerConsultLog[] = [];
  let quotes: CustomerQuote[] = [];
  let quoteSendsByQuoteId: Record<string, CustomerQuoteSend[]> = {};
  let erpQuotes: ErpQuote[] = [];
  let schedules: CustomerSchedule[] = [];
  let employees: Employee[] = [];
  let projects: Project[] = [];
  let projectsWarning: string | null = null;
  let projectsDevHint: string | null = null;
  let assigneeChangeHistory: CustomerActivity[] = [];

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
      const w = panelWarning(
        "현장",
        error,
        "supabase/migrations/20260722000001_customer_projects.sql",
        access.isAdmin,
      );
      projectsWarning = w.message;
      projectsDevHint = w.devHint;
    }

    if (customer && !customer.deleted_at) {
      try {
        consultLogs = await getCustomerConsultLogs(id);
      } catch (error) {
        const w = panelWarning(
          "상담이력",
          error,
          "supabase/migrations/20260716000007_customer_consult_logs.sql",
          access.isAdmin,
        );
        consultWarning = w.message;
        consultDevHint = w.devHint;
      }

      try {
        const activities = await getCustomerActivities(id);
        assigneeChangeHistory = activities.filter(
          (row) => row.activity_type === "담당자변경",
        );
      } catch {
        assigneeChangeHistory = [];
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
      } catch {
        // 레거시 customer_quotes — 없어도 고객 상세는 유지
        quotes = [];
      }

      try {
        erpQuotes = await listQuotes({ customerId: id });
      } catch (error) {
        const w = panelWarning(
          "견적",
          error,
          "supabase/migrations/20260724000001_quotes_and_simple_materials.sql (+ 20260726000001_quotes_management_v1.sql)",
          access.isAdmin,
        );
        quoteWarning = w.message;
        quoteDevHint = w.devHint;
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

  const assignedEmployee = customer.assigned_employee_id
    ? employees.find((employee) => employee.id === customer!.assigned_employee_id) ?? null
    : null;
  const assigneeName = assignedEmployee
    ? [assignedEmployee.name, assignedEmployee.title].filter(Boolean).join(" ")
    : null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-slate-600">고객 상세</p>
            <h1 className="text-xl font-bold text-slate-900 lg:text-2xl">
              {customer.name}
            </h1>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-2">
            {access.isAdmin ? (
              <CustomerInfoPushButton
                customerId={customer.id}
                assigneeName={assigneeName}
              />
            ) : null}
            <Link
              href="/customers"
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-slate-100"
            >
              목록으로
            </Link>
          </div>
        </div>

        {query.updated && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            고객 정보가 수정되었습니다.
          </div>
        )}

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError === "CRM_TABLES_MISSING"
              ? schemaMissingStaffMessage("고객")
              : "고객 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}
          </div>
        )}

        {consultWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>{consultWarning}</p>
            {consultDevHint && (
              <p className="mt-1 text-xs">{consultDevHint}</p>
            )}
          </div>
        )}

        {quoteWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>{quoteWarning}</p>
            {quoteDevHint && <p className="mt-1 text-xs">{quoteDevHint}</p>}
          </div>
        )}

        {projectsWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>{projectsWarning}</p>
            {projectsDevHint && (
              <p className="mt-1 text-xs">{projectsDevHint}</p>
            )}
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
            assigneeChangeHistory={assigneeChangeHistory}
            canDelete={access.isAdmin}
            isAdmin={access.isAdmin}
            currentEmployeeId={access.profile?.employee_id ?? null}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
