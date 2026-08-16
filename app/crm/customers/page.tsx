import Link from "next/link";
import CrmCustomerCard from "@/components/crm/CrmCustomerCard";
import { getCustomers } from "@/lib/crm/customers";
import {
  CUSTOMER_PIPELINE_STAGES,
  groupCustomerPipeline,
  listCustomerPipeline,
  type CustomerPipelineStageKey,
} from "@/lib/crm/customer-pipeline";
import type { CustomerStatus } from "@/types/database";

const CRM_STATUS_FILTERS: CustomerStatus[] = [
  "신규",
  "미연락",
  "1차 연락완료",
  "상담중",
  "방문예약",
  "실측예약",
  "견적작성중",
  "견적제출",
  "계약협의",
  "계약완료",
  "계약",
  "시공예정",
  "시공중",
  "완료",
  "보류",
  "연락두절",
  "취소",
];

function parseStatus(value?: string): CustomerStatus | "" {
  return CRM_STATUS_FILTERS.find((status) => status === value) ?? "";
}

function parseStage(value?: string): CustomerPipelineStageKey {
  return CUSTOMER_PIPELINE_STAGES.find((stage) => stage.key === value)?.key ?? "new";
}

type Props = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    contact?: string;
    view?: string;
    stage?: string;
    page?: string;
  }>;
};

export default async function CrmCustomersPage({ searchParams }: Props) {
  const params = await searchParams;
  const pipelineMode = params.view === "pipeline";

  if (pipelineMode) {
    const result = await listCustomerPipeline();
    const grouped = groupCustomerPipeline(result.customers);
    const stageKey = parseStage(params.stage);
    const currentStage = CUSTOMER_PIPELINE_STAGES.find((stage) => stage.key === stageKey)!;
    const rows = grouped[stageKey];

    return (
      <div className="space-y-4">
        <section className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-500">{result.scopeLabel}</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">영업 파이프라인</h1>
            <p className="mt-1 text-sm text-slate-500">단계를 눌러 고객을 카드로 확인합니다.</p>
          </div>
          <Link
            href="/crm/customers"
            className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
          >
            고객목록
          </Link>
        </section>

        <div className="-mx-4 overflow-x-auto px-4 pb-1">
          <div className="flex w-max gap-2">
            {CUSTOMER_PIPELINE_STAGES.map((stage) => {
              const active = stage.key === stageKey;
              return (
                <Link
                  key={stage.key}
                  href={`/crm/customers?view=pipeline&stage=${stage.key}`}
                  className={`rounded-full px-3 py-2 text-xs font-bold whitespace-nowrap ${
                    active
                      ? "bg-navy-900 text-white"
                      : "border border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {stage.label} {grouped[stage.key].length}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-sm font-black text-slate-900">{currentStage.label}</p>
          <p className="mt-0.5 text-xs text-slate-500">{currentStage.description}</p>
        </div>

        <section className="space-y-3">
          {rows.map((customer) => (
            <CrmCustomerCard key={customer.id} customer={customer} />
          ))}
          {rows.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
              이 단계에 고객이 없습니다.
            </div>
          )}
        </section>
      </div>
    );
  }

  const status = parseStatus(params.status);
  const contact =
    params.contact === "today" || params.contact === "overdue"
      ? params.contact
      : "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const result = await getCustomers({
    q: params.q?.trim() || undefined,
    status,
    contact,
    page,
    pageSize: 30,
  });

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500">고객·영업</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">고객</h1>
          <p className="mt-1 text-sm text-slate-500">필요한 정보만 카드로 빠르게 확인합니다.</p>
        </div>
        <Link
          href="/crm/customers?view=pipeline"
          className="shrink-0 rounded-xl bg-navy-900 px-3 py-2 text-xs font-bold text-white"
        >
          파이프라인
        </Link>
      </section>

      <form action="/crm/customers" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="고객명, 연락처, 주소 검색"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-navy-900"
          />
          <button type="submit" className="rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-bold text-white">
            검색
          </button>
        </div>
      </form>

      <div className="-mx-4 overflow-x-auto px-4 pb-1">
        <div className="flex w-max gap-2">
          <Link
            href="/crm/customers"
            className={`rounded-full px-3 py-2 text-xs font-bold whitespace-nowrap ${
              !status && !contact ? "bg-navy-900 text-white" : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            전체 {result.total}
          </Link>
          <Link
            href="/crm/customers?status=신규"
            className={`rounded-full px-3 py-2 text-xs font-bold whitespace-nowrap ${
              status === "신규" ? "bg-navy-900 text-white" : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            신규
          </Link>
          <Link
            href="/crm/customers?contact=today"
            className={`rounded-full px-3 py-2 text-xs font-bold whitespace-nowrap ${
              contact === "today" ? "bg-navy-900 text-white" : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            오늘 연락
          </Link>
          <Link
            href="/crm/customers?contact=overdue"
            className={`rounded-full px-3 py-2 text-xs font-bold whitespace-nowrap ${
              contact === "overdue" ? "bg-red-600 text-white" : "border border-slate-200 bg-white text-red-600"
            }`}
          >
            연락 지연
          </Link>
        </div>
      </div>

      <p className="text-xs font-semibold text-slate-500">검색 결과 {result.total}명</p>

      <section className="space-y-3">
        {result.customers.map((customer) => (
          <CrmCustomerCard key={customer.id} customer={customer} />
        ))}
        {result.customers.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
            조건에 맞는 고객이 없습니다.
          </div>
        )}
      </section>

      {result.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-2">
          {page > 1 ? (
            <Link
              href={`/crm/customers?page=${page - 1}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}${status ? `&status=${encodeURIComponent(status)}` : ""}${contact ? `&contact=${contact}` : ""}`}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700"
            >
              이전
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs font-semibold text-slate-500">
            {page} / {result.totalPages}
          </span>
          {page < result.totalPages ? (
            <Link
              href={`/crm/customers?page=${page + 1}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}${status ? `&status=${encodeURIComponent(status)}` : ""}${contact ? `&contact=${contact}` : ""}`}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700"
            >
              다음
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
