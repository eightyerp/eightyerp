import Link from "next/link";
import CustomerPipelineBoard from "@/components/customers/CustomerPipelineBoard";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import {
  listCustomerPipeline,
  type CustomerPipelineItem,
} from "@/lib/crm/customer-pipeline";

const CLOSED_STATUSES = new Set(["완료", "보류", "연락두절", "취소"]);

export default async function CustomerPipelinePage() {
  let customers: CustomerPipelineItem[] = [];
  let scopeLabel = "내 담당 고객";
  let loadError: string | null = null;

  try {
    const result = await listCustomerPipeline();
    customers = result.customers;
    scopeLabel = result.scopeLabel;
  } catch {
    loadError = "영업 파이프라인을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  const activeCount = customers.filter(
    (customer) => !CLOSED_STATUSES.has(customer.status),
  ).length;
  const overdueCount = customers.filter(
    (customer) => customer.contact_bucket === "overdue",
  ).length;
  const unassignedCount = customers.filter(
    (customer) => !customer.assigned_employee_id,
  ).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">고객·영업</p>
            <h1 className="mt-0.5 text-2xl font-bold text-slate-950">
              CRM 영업 파이프라인
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              고객 상태를 신규 문의부터 계약·시공까지 한 화면에서 추적합니다.
            </p>
            <p className="mt-1 text-xs font-semibold text-navy-800">
              조회 범위: {scopeLabel}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/customers"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              고객 목록
            </Link>
            <Link
              href="/customers/new"
              className="rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-navy-800"
            >
              신규 고객 등록
            </Link>
          </div>
        </div>

        {loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {loadError}
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <PipelineSummary label="전체 고객" value={customers.length} />
              <PipelineSummary label="진행 중" value={activeCount} tone="active" />
              <PipelineSummary label="연락 지연" value={overdueCount} tone="danger" />
              <PipelineSummary label="미배정" value={unassignedCount} tone="warning" />
            </section>
            <CustomerPipelineBoard customers={customers} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function PipelineSummary({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "active" | "danger" | "warning";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-800"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : tone === "active"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-slate-200 bg-white text-slate-900";

  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${toneClass}`}>
      <p className="text-xs font-medium opacity-75">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value.toLocaleString("ko-KR")}</p>
    </div>
  );
}
