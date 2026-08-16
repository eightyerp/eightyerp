import Link from "next/link";
import {
  CUSTOMER_PIPELINE_STAGES,
  groupCustomerPipeline,
  type CustomerPipelineItem,
} from "@/lib/crm/customer-pipeline";
import { STATUS_BADGE_CLASS, formatEmployeeLabel } from "@/lib/crm/constants";
import { formatFriendlyDate } from "@/lib/crm/contact";

function CustomerPipelineCard({
  customer,
}: {
  customer: CustomerPipelineItem;
}) {
  const isOverdue = customer.contact_bucket === "overdue";
  const assignee = customer.employees
    ? formatEmployeeLabel(customer.employees.name, customer.employees.title)
    : "미배정";

  return (
    <Link
      href={`/customers/${customer.id}`}
      className="block rounded-xl border border-white bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-navy-800/20 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-950">
            {customer.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-600">
            {customer.phone}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            STATUS_BADGE_CLASS[customer.status] ??
            "bg-slate-100 text-slate-800"
          }`}
        >
          {customer.status}
        </span>
      </div>

      <dl className="mt-3 space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-500">담당</dt>
          <dd className="truncate font-medium text-slate-800">{assignee}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-500">상담</dt>
          <dd className="truncate text-slate-700">
            {customer.consultation_type}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-500">다음 연락</dt>
          <dd
            className={
              isOverdue
                ? "font-bold text-red-700"
                : "font-medium text-slate-700"
            }
          >
            {formatFriendlyDate(customer.next_contact_at) ?? "미정"}
          </dd>
        </div>
      </dl>

      {isOverdue ? (
        <p className="mt-3 rounded-md bg-red-50 px-2 py-1.5 text-[11px] font-bold text-red-700">
          연락 기한 경과
        </p>
      ) : null}
    </Link>
  );
}

export default function CustomerPipelineBoard({
  customers,
}: {
  customers: CustomerPipelineItem[];
}) {
  const grouped = groupCustomerPipeline(customers);

  return (
    <div className="overflow-x-auto pb-3">
      <div className="grid min-w-[1420px] grid-cols-6 gap-3">
        {CUSTOMER_PIPELINE_STAGES.map((stage) => {
          const stageCustomers = grouped[stage.key];
          return (
            <section
              key={stage.key}
              className={`min-h-[420px] rounded-2xl border p-3 ${stage.className}`}
            >
              <div className="mb-3 flex items-start justify-between gap-2 px-1">
                <div>
                  <h2 className="text-sm font-bold text-slate-950">
                    {stage.label}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    {stage.description}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-navy-900 shadow-sm">
                  {stageCustomers.length}
                </span>
              </div>

              {stageCustomers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300/80 bg-white/55 px-3 py-8 text-center text-xs text-slate-500">
                  해당 단계 고객이 없습니다.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {stageCustomers.map((customer) => (
                    <CustomerPipelineCard
                      key={customer.id}
                      customer={customer}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
