import Link from "next/link";
import { Suspense } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CustomerFilters from "@/components/customers/CustomerFilters";
import CustomerPagination from "@/components/customers/CustomerPagination";
import CustomerTable from "@/components/customers/CustomerTable";
import ExternalInquiryPasteModal from "@/components/customers/ExternalInquiryPasteModal";
import { getCurrentUserAccess } from "@/lib/crm/access";
import { CUSTOMER_PAGE_SIZE } from "@/lib/crm/constants";
import {
  getCustomers,
  getEmployees,
  getLeadSources,
} from "@/lib/crm/customers";
import {
  schemaMissingDevHint,
  schemaMissingStaffMessage,
} from "@/lib/crm/dev-diagnostics";
import { toCrmErrorMessage } from "@/lib/crm/errors";
import type {
  CustomerStatus,
  CustomerWithRelations,
  Employee,
  LeadSource,
} from "@/types/database";

type CustomersPageProps = {
  searchParams: Promise<{
    q?: string;
    employeeId?: string;
    leadSourceId?: string;
    status?: string;
    interestItem?: string;
    dateFrom?: string;
    dateTo?: string;
    contact?: string;
    page?: string;
    created?: string;
    updated?: string;
    deleted?: string;
  }>;
};

export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  const params = await searchParams;
  const access = await getCurrentUserAccess();
  const page = Math.max(1, Number(params.page || "1") || 1);

  let customers: CustomerWithRelations[] = [];
  let total = 0;
  let totalPages = 1;
  let employees: Employee[] = [];
  let leadSources: LeadSource[] = [];
  let loadError: string | null = null;

  try {
    const [listResult, empList, sourceList] = await Promise.all([
      getCustomers({
        q: params.q,
        employeeId: params.employeeId,
        leadSourceId: params.leadSourceId,
        status: (params.status as CustomerStatus | undefined) || "",
        interestItem: params.interestItem,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        contact:
          params.contact === "today" ||
          params.contact === "overdue" ||
          params.contact === "this_week" ||
          params.contact === "soon"
            ? params.contact
            : "",
        page,
        pageSize: CUSTOMER_PAGE_SIZE,
      }),
      getEmployees(),
      getLeadSources(),
    ]);
    customers = listResult.customers;
    total = listResult.total;
    totalPages = listResult.totalPages;
    employees = empList;
    leadSources = sourceList;
  } catch (error) {
    loadError = toCrmErrorMessage(error);
  }

  const tablesMissing = loadError === "CRM_TABLES_MISSING";
  const attentionCount = customers.filter((c) => c.needs_attention).length;
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
              고객관리 (CRM)
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              검색 · 필터 · 상담이력 기반 고객 관리
            </p>
            <p className="mt-1 text-xs font-medium text-navy-800">
              조회 범위:{" "}
              {access.isAdmin ? "회사 전체 고객" : "내 담당 고객"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {access.isAdmin && (
              <Link
                href="/customers/trash"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                삭제 고객함
              </Link>
            )}
            <ExternalInquiryPasteModal
              employees={employees}
              leadSources={leadSources}
              defaultAssignedEmployeeId={access.profile?.employee_id ?? null}
              canChangeAssignee={access.isAdmin}
            />
            <Link
              href="/customers/import"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              문의 자동등록(전체화면)
            </Link>
            <Link
              href="/customers/new"
              className="rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-700"
            >
              신규 고객 등록
            </Link>
          </div>
        </div>

        {params.created && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            고객이 등록되었습니다.
          </div>
        )}

        {params.updated && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            고객 정보가 저장되었습니다.
          </div>
        )}

        {params.deleted && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            고객이 삭제 고객함으로 이동되었습니다.
          </div>
        )}

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
            고객 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </div>
        )}

        {!tablesMissing && !loadError && (
          <>
            <Suspense
              fallback={
                <div className="dashboard-card p-4 text-sm text-gray-500">
                  필터 로딩 중...
                </div>
              }
            >
              <CustomerFilters
                employees={employees}
                leadSources={leadSources}
                canFilterByAssignee={access.isAdmin}
              />
            </Suspense>

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
              <p>
                총 {total}건
                {params.contact && (
                  <span className="ml-2 font-medium text-navy-800">
                    · 연락필터:{" "}
                    {params.contact === "today"
                      ? "오늘 연락"
                      : params.contact === "overdue"
                        ? "기한 경과"
                        : params.contact === "this_week"
                          ? "이번 주"
                          : params.contact === "soon"
                            ? "3일 이내"
                            : params.contact}
                  </span>
                )}
                {attentionCount > 0 && (
                  <span className="ml-2 font-medium text-red-600">
                    · 관리 필요 {attentionCount}건
                  </span>
                )}
              </p>
              {access.role && (
                <p className="text-xs">
                  현재 권한: {access.role}
                  {access.isAdmin ? " (삭제 가능)" : " (삭제 불가)"}
                </p>
              )}
            </div>

            <CustomerTable
              customers={customers}
              canDelete={access.isAdmin}
            />

            <CustomerPagination
              page={page}
              totalPages={totalPages}
              total={total}
              searchParams={{
                q: params.q,
                employeeId: params.employeeId,
                leadSourceId: params.leadSourceId,
                status: params.status,
                interestItem: params.interestItem,
                dateFrom: params.dateFrom,
                dateTo: params.dateTo,
                contact: params.contact,
              }}
            />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
