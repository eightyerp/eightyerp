import Link from "next/link";
import SoftDeleteCustomerButton from "@/components/customers/SoftDeleteCustomerButton";
import { STATUS_BADGE_CLASS, formatEmployeeLabel } from "@/lib/crm/constants";
import {
  contactBucketClass,
  contactBucketLabel,
} from "@/lib/crm/contact";
import type { CustomerWithRelations } from "@/types/database";

type CustomerTableProps = {
  customers: CustomerWithRelations[];
  canDelete: boolean;
  trashMode?: boolean;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ko-KR");
}

export default function CustomerTable({
  customers,
  canDelete,
  trashMode = false,
}: CustomerTableProps) {
  if (customers.length === 0) {
    return (
      <div className="dashboard-card px-5 py-12 text-center text-sm text-slate-600">
        {trashMode
          ? "삭제된 고객이 없습니다."
          : "등록된 고객이 없거나 검색 조건에 맞는 고객이 없습니다."}
      </div>
    );
  }

  return (
    <div className="dashboard-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs text-slate-600">
              <th className="px-4 py-3 font-medium">고객명</th>
              <th className="px-4 py-3 font-medium">연락처</th>
              <th className="px-4 py-3 font-medium">상담유형</th>
              <th className="px-4 py-3 font-medium">유입경로</th>
              <th className="px-4 py-3 font-medium">담당자</th>
              <th className="px-4 py-3 font-medium">상담상태</th>
              <th className="px-4 py-3 font-medium">체크리스트</th>
              <th className="px-4 py-3 font-medium">마지막 상담일</th>
              <th className="px-4 py-3 font-medium">다음 연락일</th>
              <th className="px-4 py-3 font-medium">관리 필요</th>
              <th className="px-4 py-3 font-medium text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr
                key={customer.id}
                className={`border-b border-gray-50 hover:bg-slate-100/80 ${
                  customer.needs_attention ? "bg-red-50/40" : ""
                }`}
              >
                <td className="px-4 py-3 font-medium text-slate-900">
                  <Link
                    href={`/customers/${customer.id}`}
                    className="hover:text-navy-800 hover:underline"
                  >
                    {customer.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-900">{customer.phone}</td>
                <td className="px-4 py-3 text-slate-900">
                  {customer.consultation_type}
                </td>
                <td className="px-4 py-3 text-slate-900">
                  {customer.lead_sources?.name ?? "-"}
                </td>
                <td className="px-4 py-3 text-slate-900">
                  {customer.employees
                    ? formatEmployeeLabel(
                        customer.employees.name,
                        customer.employees.title,
                      )
                    : "-"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      STATUS_BADGE_CLASS[customer.status] ??
                      "bg-slate-100 text-slate-900"
                    }`}
                  >
                    {customer.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-900">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-gold-500"
                        style={{ width: `${customer.checklist_rate ?? 0}%` }}
                      />
                    </div>
                    <span className="text-xs">
                      {customer.checklist_completed ?? 0}/
                      {customer.checklist_total ?? 0}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formatDate(customer.last_activity_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-900">
                      {formatDate(customer.next_contact_at)}
                    </span>
                    <span
                      className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium ${contactBucketClass(
                        customer.contact_bucket ?? "none",
                      )}`}
                    >
                      {contactBucketLabel(customer.contact_bucket ?? "none")}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {customer.needs_attention ? (
                    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                      관리 필요
                    </span>
                  ) : (
                    <span className="text-xs text-slate-600">정상</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {!trashMode && (
                      <>
                        <Link
                          href={`/customers/${customer.id}`}
                          className="rounded-md px-2 py-1 text-xs font-medium text-navy-800 hover:bg-navy-800/5"
                        >
                          상세
                        </Link>
                        <Link
                          href={`/customers/${customer.id}/edit`}
                          className="rounded-md px-2 py-1 text-xs font-medium text-navy-800 hover:bg-navy-800/5"
                        >
                          수정
                        </Link>
                        {canDelete && (
                          <SoftDeleteCustomerButton
                            customerId={customer.id}
                            customerName={customer.name}
                            customerPhone={customer.phone}
                          />
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
