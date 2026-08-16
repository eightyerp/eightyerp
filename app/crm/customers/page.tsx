import Link from "next/link";
import CrmCustomerCard from "@/components/crm/CrmCustomerCard";
import { getCustomers } from "@/lib/crm/customers";
import {
  CUSTOMER_PIPELINE_STAGES,
  getMobileCustomerPipelineView,
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

function parseDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

type CustomerHrefParams = {
  q?: string;
  status?: string;
  contact?: string;
  dateFrom?: string;
  dateTo?: string;
  view?: string;
  stage?: string;
  page?: number;
};

function customerHref(params: CustomerHrefParams) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  if (params.contact) search.set("contact", params.contact);
  if (params.dateFrom) search.set("dateFrom", params.dateFrom);
  if (params.dateTo) search.set("dateTo", params.dateTo);
  if (params.view) search.set("view", params.view);
  if (params.stage) search.set("stage", params.stage);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/crm/customers?${query}` : "/crm/customers";
}

type Props = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    contact?: string;
    view?: string;
    stage?: string;
    page?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
};

export default async function CrmCustomersPage({ searchParams }: Props) {
  const params = await searchParams;
  const pipelineMode = params.view === "pipeline";
  const dateFrom = parseDate(params.dateFrom);
  const dateTo = parseDate(params.dateTo);

  if (pipelineMode) {
    const stageKey = parseStage(params.stage);
    const result = await getMobileCustomerPipelineView({
      stageKey,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
    const currentStage = CUSTOMER_PIPELINE_STAGES.find((stage) => stage.key === stageKey)!;
    const rows = result.rows;

    return (
      <div className="space-y-4">
        <section className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-500">{result.scopeLabel}</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">영업 파이프라인</h1>
            <p className="mt-1 text-sm text-slate-500">단계와 접수기간을 함께 좁혀서 봅니다.</p>
          </div>
          <Link
            href={customerHref({ dateFrom, dateTo })}
            className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
          >
            고객목록
          </Link>
        </section>

        <form action="/crm/customers" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <input type="hidden" name="view" value="pipeline" />
          <input type="hidden" name="stage" value={stageKey} />
          <p className="text-xs font-bold text-slate-600">고객 접수기간</p>
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <input
              type="date"
              name="dateFrom"
              defaultValue={dateFrom}
              aria-label="접수 시작일"
              className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2.5 text-sm text-slate-800 outline-none focus:border-navy-900"
            />
            <span className="text-xs font-semibold text-slate-400">~</span>
            <input
              type="date"
              name="dateTo"
              defaultValue={dateTo}
              aria-label="접수 종료일"
              className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2.5 text-sm text-slate-800 outline-none focus:border-navy-900"
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link
              href={customerHref({ view: "pipeline", stage: stageKey })}
              className="rounded-xl border border-slate-200 py-2.5 text-center text-xs font-bold text-slate-600"
            >
              기간 초기화
            </Link>
            <button type="submit" className="rounded-xl bg-navy-900 py-2.5 text-xs font-black text-white">
              기간 조회
            </button>
          </div>
        </form>

        <div className="-mx-4 overflow-x-auto px-4 pb-1">
          <div className="flex w-max gap-2">
            {CUSTOMER_PIPELINE_STAGES.map((stage) => {
              const active = stage.key === stageKey;
              return (
                <Link
                  key={stage.key}
                  href={customerHref({
                    view: "pipeline",
                    stage: stage.key,
                    dateFrom,
                    dateTo,
                  })}
                  className={`rounded-full px-3 py-2 text-xs font-bold whitespace-nowrap ${
                    active
                      ? "bg-navy-900 text-white"
                      : "border border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {stage.label} {result.counts[stage.key]}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-900">{currentStage.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">{currentStage.description}</p>
            </div>
            {(dateFrom || dateTo) && (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                {dateFrom || "처음"} ~ {dateTo || "오늘"}
              </span>
            )}
          </div>
        </div>

        <section className="space-y-3">
          {rows.map((customer) => (
            <CrmCustomerCard key={customer.id} customer={customer} />
          ))}
          {rows.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
              이 단계와 기간에 해당하는 고객이 없습니다.
            </div>
          )}
          {result.counts[stageKey] > rows.length && (
            <div className="rounded-2xl bg-slate-100 px-4 py-3 text-center text-xs font-semibold text-slate-500">
              빠른 조회를 위해 최근 {rows.length}명만 표시합니다. 접수기간을 좁히면 필요한 고객을 더 빠르게 찾을 수 있습니다.
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
  const q = params.q?.trim() || "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const result = await getCustomers({
    q: q || undefined,
    status,
    contact,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    pageSize: 30,
  });

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500">고객·영업</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">고객</h1>
          <p className="mt-1 text-sm text-slate-500">검색·접수기간·진행상태로 빠르게 찾습니다.</p>
        </div>
        <Link
          href={customerHref({ view: "pipeline", dateFrom, dateTo })}
          className="shrink-0 rounded-xl bg-navy-900 px-3 py-2 text-xs font-bold text-white"
        >
          파이프라인
        </Link>
      </section>

      <form action="/crm/customers" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        {status && <input type="hidden" name="status" value={status} />}
        {contact && <input type="hidden" name="contact" value={contact} />}
        <div className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="고객명, 연락처, 주소 검색"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-navy-900"
          />
          <button type="submit" className="rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-bold text-white">
            조회
          </button>
        </div>

        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-slate-600">고객 접수기간</p>
            {(dateFrom || dateTo) && (
              <Link
                href={customerHref({ q, status, contact })}
                className="text-[11px] font-bold text-slate-400"
              >
                기간 초기화
              </Link>
            )}
          </div>
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <input
              type="date"
              name="dateFrom"
              defaultValue={dateFrom}
              aria-label="접수 시작일"
              className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2.5 text-sm text-slate-800 outline-none focus:border-navy-900"
            />
            <span className="text-xs font-semibold text-slate-400">~</span>
            <input
              type="date"
              name="dateTo"
              defaultValue={dateTo}
              aria-label="접수 종료일"
              className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2.5 text-sm text-slate-800 outline-none focus:border-navy-900"
            />
          </div>
        </div>
      </form>

      <div className="-mx-4 overflow-x-auto px-4 pb-1">
        <div className="flex w-max gap-2">
          <Link
            href={customerHref({ q, dateFrom, dateTo })}
            className={`rounded-full px-3 py-2 text-xs font-bold whitespace-nowrap ${
              !status && !contact ? "bg-navy-900 text-white" : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            전체 {result.total}
          </Link>
          <Link
            href={customerHref({ q, status: "신규", dateFrom, dateTo })}
            className={`rounded-full px-3 py-2 text-xs font-bold whitespace-nowrap ${
              status === "신규" ? "bg-navy-900 text-white" : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            신규
          </Link>
          <Link
            href={customerHref({ q, contact: "today", dateFrom, dateTo })}
            className={`rounded-full px-3 py-2 text-xs font-bold whitespace-nowrap ${
              contact === "today" ? "bg-navy-900 text-white" : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            오늘 연락
          </Link>
          <Link
            href={customerHref({ q, contact: "overdue", dateFrom, dateTo })}
            className={`rounded-full px-3 py-2 text-xs font-bold whitespace-nowrap ${
              contact === "overdue" ? "bg-red-600 text-white" : "border border-slate-200 bg-white text-red-600"
            }`}
          >
            연락 지연
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-500">검색 결과 {result.total}명</p>
        {(dateFrom || dateTo) && (
          <p className="text-[11px] font-semibold text-slate-400">
            접수 {dateFrom || "처음"} ~ {dateTo || "오늘"}
          </p>
        )}
      </div>

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
              href={customerHref({
                q,
                status,
                contact,
                dateFrom,
                dateTo,
                page: page - 1,
              })}
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
              href={customerHref({
                q,
                status,
                contact,
                dateFrom,
                dateTo,
                page: page + 1,
              })}
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
