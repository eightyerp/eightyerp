import Link from "next/link";
import { notFound } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import QuoteDetailView from "@/components/quotes/QuoteDetailView";
import { getCurrentUserAccess } from "@/lib/crm/access";
import { getEmployees } from "@/lib/crm/customers";
import {
  schemaMissingDevHint,
  schemaMissingStaffMessage,
} from "@/lib/crm/dev-diagnostics";
import { isMissingRelationError } from "@/lib/crm/errors";
import { getCurrentCompanyQuoteBrand } from "@/lib/crm/quote-brand";
import type { QuoteBrandProfile } from "@/lib/crm/quote-brand-shared";
import {
  createSignedUrlsForQuoteFiles,
  getQuoteById,
  listQuoteSendLogs,
  listQuoteVersions,
} from "@/lib/crm/quote-mgmt";
import { resolveQuoteAssigneeContact } from "@/lib/crm/quote-assignee-contact";
import { createSignedEmployeeCardUrl } from "@/lib/crm/employee-contacts";
import { createClient } from "@/lib/supabase-server";
import type { Employee, ErpQuote, ErpQuoteSendLog } from "@/types/database";

const MIGRATION_PATH =
  "supabase/migrations/20260724000001_quotes_and_simple_materials.sql";

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

type QuoteDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function QuoteDetailPage({
  params,
}: QuoteDetailPageProps) {
  const { id } = await params;
  const userAccess = await getCurrentUserAccess();
  const devHint = schemaMissingDevHint(MIGRATION_PATH, userAccess.isAdmin);

  let quote: ErpQuote | null = null;
  let versions: ErpQuote[] = [];
  let sendLogs: ErpQuoteSendLog[] = [];
  let signedUrls: Record<string, string> = {};
  let employees: Employee[] = [];
  let brand: QuoteBrandProfile | null = null;
  let assigneeCardImageUrl: string | null = null;
  let loadError: string | null = null;
  let tablesMissing = false;

  try {
    quote = await getQuoteById(id);
    if (quote) {
      const [versionList, logList, urls, employeeList, companyBrand] =
        await Promise.all([
          listQuoteVersions(quote.quote_group_id),
          listQuoteSendLogs(quote.id),
          createSignedUrlsForQuoteFiles(quote.quote_files ?? []),
          getEmployees().catch(() => [] as Employee[]),
          getCurrentCompanyQuoteBrand(),
        ]);
      versions = versionList;
      sendLogs = logList;
      signedUrls = urls;
      employees = employeeList;
      brand = companyBrand;

      const contact = resolveQuoteAssigneeContact(quote);
      if (contact.showBusinessCard && contact.cardPath) {
        try {
          assigneeCardImageUrl = await createSignedEmployeeCardUrl(
            contact.cardPath,
            60 * 60,
          );
        } catch {
          assigneeCardImageUrl = null;
        }
      }
    }
  } catch (error) {
    tablesMissing = await isQuotesSchemaMissing();
    if (tablesMissing) {
      loadError = null;
    } else {
      const message =
        error instanceof Error ? error.message : "견적을 불러오지 못했습니다.";
      loadError = message.includes("브랜드") || message.includes("회사")
        ? message
        : "견적을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    }
  }

  if (!loadError && !tablesMissing && !quote) {
    notFound();
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-slate-600">견적 상세</p>
            <h1 className="text-xl font-bold text-slate-900 lg:text-2xl">
              {quote?.title ?? "견적 상세"}
            </h1>
          </div>
          <Link
            href="/quotes"
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-slate-100"
          >
            목록으로
          </Link>
        </div>

        {tablesMissing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold">
              {schemaMissingStaffMessage("견적관리")}
            </p>
            {devHint && <p className="mt-2 text-xs">{devHint}</p>}
          </div>
        )}

        {loadError && !tablesMissing && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {quote && (
          <QuoteDetailView
            quote={quote}
            versions={versions}
            sendLogs={sendLogs}
            signedUrls={signedUrls}
            employees={employees}
            brand={brand}
            assigneeCardImageUrl={assigneeCardImageUrl}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
