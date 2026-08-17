import Link from "next/link";
import { notFound } from "next/navigation";
import { getCrmMobileQuoteDetail } from "@/lib/crm/crm-mobile-quotes";

function money(value: number | null | undefined) {
  return `${Math.round(value ?? 0).toLocaleString("ko-KR")}원`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function statusClass(status: string) {
  if (["승인", "계약전환"].includes(status)) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }
  if (["취소", "만료"].includes(status)) {
    return "bg-slate-100 text-slate-600 ring-slate-200";
  }
  if (status === "수정요청") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }
  return "bg-violet-50 text-violet-700 ring-violet-200";
}

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CrmQuoteDetailPage({ params }: Props) {
  const { id } = await params;
  const quote = await getCrmMobileQuoteDetail(id);
  if (!quote) notFound();

  const customer = quote.customers;
  const total = quote.customer_total_amount ?? quote.final_amount;
  const assignee = quote.employees
    ? [quote.employees.name, quote.employees.title].filter(Boolean).join(" ")
    : "미지정";

  return (
    <div className="space-y-5">
      <section>
        <Link href="/crm/quotes" className="text-xs font-bold text-slate-500">
          ← 견적
        </Link>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">{quote.quote_type} 견적</p>
            <h1 className="mt-1 truncate text-2xl font-black tracking-tight text-slate-950">
              {customer?.name || quote.title}
            </h1>
            <p className="mt-1 truncate text-sm text-slate-500">{quote.title}</p>
            {quote.quote_number && (
              <p className="mt-1 text-xs font-semibold text-slate-400">{quote.quote_number}</p>
            )}
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1.5 text-xs font-black ring-1 ring-inset ${statusClass(quote.status)}`}>
            {quote.status}
          </span>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold text-slate-400">고객 최종 견적금액</p>
        <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{money(total)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
          <div>
            <p className="text-slate-400">공급가</p>
            <p className="mt-1 font-bold text-slate-800">{money(quote.supply_amount ?? quote.final_amount)}</p>
          </div>
          <div>
            <p className="text-slate-400">부가세</p>
            <p className="mt-1 font-bold text-slate-800">{money(quote.vat_amount)}</p>
          </div>
          <div>
            <p className="text-slate-400">특별할인</p>
            <p className="mt-1 font-bold text-slate-800">{money(quote.discount_amount)}</p>
          </div>
          <div>
            <p className="text-slate-400">담당</p>
            <p className="mt-1 truncate font-bold text-slate-800">{assignee}</p>
          </div>
        </div>
      </section>

      {customer && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-black text-slate-950">{customer.name}</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">{customer.phone}</p>
              {customer.address && (
                <p className="mt-1 text-xs leading-5 text-slate-500">{customer.address}</p>
              )}
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
              {customer.status}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a
              href={`tel:${customer.phone}`}
              className="rounded-xl bg-navy-900 px-3 py-3 text-center text-sm font-black text-white"
            >
              전화하기
            </a>
            <Link
              href={`/crm/customers/${customer.id}`}
              prefetch={false}
              className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-sm font-bold text-slate-700"
            >
              고객 보기
            </Link>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-black text-slate-950">견적 진행정보</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-slate-400">발행일</p>
            <p className="mt-1 font-bold text-slate-800">{formatDate(quote.issued_at)}</p>
          </div>
          <div>
            <p className="text-slate-400">발송일</p>
            <p className="mt-1 font-bold text-slate-800">{formatDate(quote.sent_at)}</p>
          </div>
          <div>
            <p className="text-slate-400">유효기간</p>
            <p className="mt-1 font-bold text-slate-800">{formatDate(quote.valid_until)}</p>
          </div>
          <div>
            <p className="text-slate-400">계약 견적</p>
            <p className="mt-1 font-bold text-slate-800">{quote.is_contract_quote ? "예" : "아니오"}</p>
          </div>
        </div>
      </section>

      <Link
        href={`/quotes/${quote.id}`}
        prefetch={false}
        className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-black text-slate-700"
      >
        ERP에서 상세 보기·수정
      </Link>
    </div>
  );
}
