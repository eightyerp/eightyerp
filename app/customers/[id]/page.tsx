import Link from "next/link";
import { notFound } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CustomerDetailPanels from "@/components/customers/CustomerDetailPanels";
import { getCurrentUserAccess } from "@/lib/crm/access";
import {
  getCustomerById,
  getCustomerConsultLogs,
  getEmployees,
} from "@/lib/crm/customers";
import { getCustomerQuotes, getQuoteSends } from "@/lib/crm/quotes";
import { toCrmErrorMessage } from "@/lib/crm/errors";
import type {
  CustomerConsultLog,
  CustomerQuote,
  CustomerQuoteSend,
  CustomerWithRelations,
  Employee,
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
  let employees: Employee[] = [];

  try {
    const [found, empList] = await Promise.all([
      getCustomerById(id),
      getEmployees(),
    ]);
    customer = found;
    employees = empList;

    if (customer && !customer.deleted_at) {
      try {
        consultLogs = await getCustomerConsultLogs(id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/customer_consult_logs|schema cache|Could not find/i.test(message)) {
          consultWarning =
            "상담이력 테이블이 없습니다. supabase/migrations/20260716000007_customer_consult_logs.sql 을 실행해 주세요.";
        } else {
          throw error;
        }
      }

      try {
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
          quoteWarning =
            "견적 테이블/Storage가 없습니다. supabase/migrations/20260716000008_customer_quotes.sql 을 실행해 주세요.";
        } else {
          throw error;
        }
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

        {!loadError && (
          <CustomerDetailPanels
            customer={customer}
            consultLogs={consultLogs}
            quotes={quotes}
            quoteSendsByQuoteId={quoteSendsByQuoteId}
            employees={employees}
            canDelete={access.isAdmin}
            isAdmin={access.isAdmin}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
