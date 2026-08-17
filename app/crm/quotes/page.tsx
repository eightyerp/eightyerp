import Link from "next/link";
import {
  listQuotesPage,
  type QuoteListFilters,
} from "@/lib/crm/quote-mgmt";
import {
  getScheduleAccess,
  listEmployeesInScope,
} from "@/lib/crm/schedule-access";
import type { ErpQuote } from "@/types/database";

function money(value: number | null | undefined) {
  return `${Math.round(value ?? 0).toLocaleString("ko-KR")}원`;
}

function quoteCustomerName(quote: ErpQuote) {
  return quote.customers?.name || "고객 미연결";
}

type Props = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

export default async function CrmQuotesPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const access = await getScheduleAccess();
  const scopedEmployees = await listEmployeesInScope(access);
  const filters: QuoteListFilters = {
    q: params.q?.trim() || undefined,
    employeeId: access.employeeId ?? undefined,
  };
  const result = await listQuotesPage(filters, page, access, scopedEmployees);

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500">내 고객 견적</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">견적</h1>
          <p className="mt-1 text-sm text-slate-500">금액과 진행상태를 빠르게 확인합니다.</p>
        </div>
        <Link href="/quotes/new" className="shrink-0 rounded-xl bg-navy-900 px-3 py-2 text-xs font-bold text-white">
          견적 작성
        </Link>
      </section>

      <form action="/crm/quotes" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="고객명, 견적번호 검색"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-navy-900"
          />
          <button type="submit" className="rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-bold text-white">검색</button>
        </div>
      </form>

      <p className="text-xs font-semibold text-slate-500">견적 {result.total}건</p>

      <section className="space-y-3">
        {result.quotes.map((quote) => (
          <Link key={quote.id} href={`/crm/quotes/${quote.id}`} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-black text-slate-950">{quoteCustomerName(quote)}</h2>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">{quote.status}</span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">{quote.title}</p>
                {quote.quote_number && <p className="mt-1 text-[11px] text-slate-400">{quote.quote_number}</p>}
              </div>
              <p className="shrink-0 text-sm font-black text-slate-950">{money(quote.customer_total_amount ?? quote.final_amount)}</p>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
              <span>{quote.quote_type}</span>
              <span className="font-semibold text-slate-700">CRM 요약 보기 ›</span>
            </div>
          </Link>
        ))}
        {result.quotes.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
            조건에 맞는 견적이 없습니다.
          </div>
        )}
      </section>

      {result.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-2">
          {page > 1 ? (
            <Link href={`/crm/quotes?page=${page - 1}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700">이전</Link>
          ) : <span />}
          <span className="text-xs font-semibold text-slate-500">{page} / {result.totalPages}</span>
          {page < result.totalPages ? (
            <Link href={`/crm/quotes?page=${page + 1}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700">다음</Link>
          ) : <span />}
        </div>
      )}
    </div>
  );
}
