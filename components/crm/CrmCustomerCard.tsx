import Link from "next/link";

export type CrmCustomerCardData = {
  id: string;
  name: string;
  phone: string;
  address?: string | null;
  consultation_type?: string | null;
  status: string;
  next_contact_at?: string | null;
  contact_bucket?: string | null;
  employees?: { id?: string; name: string; title?: string | null } | null;
  lead_sources?: { id?: string; name: string } | null;
};

function assigneeLabel(employee: CrmCustomerCardData["employees"]) {
  if (!employee) return "미배정";
  return [employee.name, employee.title].filter(Boolean).join(" ");
}

function contactLabel(customer: CrmCustomerCardData) {
  if (!customer.next_contact_at) return null;
  if (customer.contact_bucket === "overdue") return `연락 지연 · ${customer.next_contact_at}`;
  if (customer.contact_bucket === "today") return "오늘 연락";
  return `다음 연락 ${customer.next_contact_at}`;
}

export default function CrmCustomerCard({ customer }: { customer: CrmCustomerCardData }) {
  const contact = contactLabel(customer);
  const overdue = customer.contact_bucket === "overdue";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/crm/customers/${customer.id}`} className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-black text-slate-950">{customer.name}</h2>
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 ring-1 ring-inset ring-sky-200">
              {customer.status}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-700">{customer.phone}</p>
          {customer.address && <p className="mt-1 truncate text-xs text-slate-500">{customer.address}</p>}
        </Link>
        <Link
          href={`/crm/customers/${customer.id}`}
          className="shrink-0 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
        >
          보기
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-xs">
        <p className="truncate text-slate-500">
          담당 <span className="font-semibold text-slate-700">{assigneeLabel(customer.employees)}</span>
        </p>
        <p className="truncate text-right text-slate-500">
          {customer.consultation_type || customer.lead_sources?.name || "상담정보 없음"}
        </p>
      </div>

      {contact && (
        <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ${overdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
          {contact}
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <a
          href={`tel:${customer.phone}`}
          className="rounded-xl border border-slate-200 py-2 text-center text-xs font-bold text-slate-700"
        >
          전화
        </a>
        <a
          href={`sms:${customer.phone}`}
          className="rounded-xl border border-slate-200 py-2 text-center text-xs font-bold text-slate-700"
        >
          문자
        </a>
        <Link
          href={`/crm/customers/${customer.id}#consult`}
          className="rounded-xl bg-navy-900 py-2 text-center text-xs font-bold text-white"
        >
          상담기록
        </Link>
      </div>
    </article>
  );
}
