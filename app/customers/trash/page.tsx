import Link from "next/link";
import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import {
  permanentlyDeleteCustomerAction,
  restoreCustomerAction,
} from "@/app/actions/customers";
import { getCurrentUserAccess } from "@/lib/crm/access";
import {
  STATUS_BADGE_CLASS,
  formatEmployeeLabel,
} from "@/lib/crm/constants";
import { getCustomers } from "@/lib/crm/customers";
import { toCrmErrorMessage } from "@/lib/crm/errors";

import type { CustomerWithRelations } from "@/types/database";

type TrashPageProps = {
  searchParams: Promise<{ restored?: string; purged?: string }>;
};

export default async function CustomersTrashPage({
  searchParams,
}: TrashPageProps) {
  const access = await getCurrentUserAccess();
  if (!access.isAdmin) {
    redirect("/customers");
  }

  const params = await searchParams;
  let customers: CustomerWithRelations[] = [];
  let loadError: string | null = null;

  try {
    const result = await getCustomers({
      deletedOnly: true,
      page: 1,
      pageSize: 200,
    });
    customers = result.customers;
  } catch (error) {
    loadError = toCrmErrorMessage(error);
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 lg:text-2xl">
              삭제 고객함
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              관리자 전용 · 복구 또는 영구삭제
            </p>
          </div>
          <Link
            href="/customers"
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            고객 목록
          </Link>
        </div>

        {params.restored && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            고객이 복구되었습니다.
          </div>
        )}
        {params.purged && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            고객이 영구삭제되었습니다.
          </div>
        )}

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {!loadError && (
          <div className="dashboard-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                    <th className="px-4 py-3 font-medium">고객명</th>
                    <th className="px-4 py-3 font-medium">연락처</th>
                    <th className="px-4 py-3 font-medium">상태</th>
                    <th className="px-4 py-3 font-medium">담당자</th>
                    <th className="px-4 py-3 font-medium">삭제일</th>
                    <th className="px-4 py-3 font-medium">삭제 사유</th>
                    <th className="px-4 py-3 font-medium text-right">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-10 text-center text-gray-500"
                      >
                        삭제된 고객이 없습니다.
                      </td>
                    </tr>
                  )}
                  {customers.map((customer) => (
                    <tr
                      key={customer.id}
                      className="border-b border-gray-50 hover:bg-gray-50/80"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {customer.name}
                      </td>
                      <td className="px-4 py-3">{customer.phone}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            STATUS_BADGE_CLASS[customer.status] ?? ""
                          }`}
                        >
                          {customer.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {customer.employees
                          ? formatEmployeeLabel(
                              customer.employees.name,
                              customer.employees.title,
                            )
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {customer.deleted_at
                          ? new Date(customer.deleted_at).toLocaleString("ko-KR")
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {customer.delete_reason ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <form action={restoreCustomerAction}>
                            <input type="hidden" name="id" value={customer.id} />
                            <button
                              type="submit"
                              className="rounded-md px-2 py-1 text-xs font-medium text-navy-800 hover:bg-navy-800/5"
                            >
                              복구
                            </button>
                          </form>
                          <form action={permanentlyDeleteCustomerAction}>
                            <input type="hidden" name="id" value={customer.id} />
                            <button
                              type="submit"
                              className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              영구삭제
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
