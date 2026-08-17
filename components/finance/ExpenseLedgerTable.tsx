import {
  EXPENSE_PAYMENT_LABELS,
  EXPENSE_STATUS_LABELS,
  EXPENSE_WORK_TRADE_LABELS,
  type ExpenseRequestRecord,
} from "@/lib/crm/expense-shared";
import { formatDateRangeLabel, type DateRangeValue } from "@/lib/date-range";

function money(value: number | null | undefined): string {
  return `${Number(value ?? 0).toLocaleString("ko-KR")}원`;
}

function dateOnly(value: string | null | undefined): string {
  if (!value) return "-";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function dateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ExpenseLedgerTable({
  requests,
  total,
  dateFieldLabel,
  range,
}: {
  requests: ExpenseRequestRecord[];
  total: number;
  dateFieldLabel: string;
  range: DateRangeValue;
}) {
  const pagePaidAmount = requests
    .filter((row) => row.status === "paid")
    .reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
  const pageCostBasis = requests
    .filter((row) => !["cancelled", "rejected"].includes(row.status))
    .reduce((sum, row) => sum + Number(row.cost_basis_amount ?? 0), 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 lg:flex-row lg:items-center lg:justify-between sm:px-5">
        <div>
          <h2 className="text-lg font-black text-slate-950">지출 원장</h2>
          <p className="mt-1 text-xs font-medium text-slate-600">
            {dateFieldLabel} · {formatDateRangeLabel(range)} · 총 {total.toLocaleString("ko-KR")}건
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-left lg:text-right">
          <div>
            <p className="text-[11px] font-bold text-slate-500">현재 페이지 지급완료</p>
            <p className="mt-0.5 font-black text-emerald-800">{money(pagePaidAmount)}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500">현재 페이지 손익원가</p>
            <p className="mt-0.5 font-black text-navy-900">{money(pageCostBasis)}</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1500px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black text-slate-700">
            <tr>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">현장</th>
              <th className="px-4 py-3">공종</th>
              <th className="px-4 py-3">거래처 / 내용</th>
              <th className="px-4 py-3">결제</th>
              <th className="px-4 py-3 text-right">지급액</th>
              <th className="px-4 py-3 text-right">손익원가</th>
              <th className="px-4 py-3">지출일</th>
              <th className="px-4 py-3">지급예정일</th>
              <th className="px-4 py-3">실제 지급일</th>
              <th className="px-4 py-3">신청일</th>
              <th className="px-4 py-3">증빙</th>
              <th className="px-4 py-3">신청자</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 text-slate-800">
                <td className="px-4 py-3">
                  <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
                    {EXPENSE_STATUS_LABELS[row.status]}
                  </span>
                  {row.is_post_settlement ? (
                    <span className="ml-1 inline-flex rounded-full bg-orange-100 px-2 py-1 text-[10px] font-bold text-orange-800">
                      사후
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 font-bold text-slate-950">{row.projects?.name ?? "-"}</td>
                <td className="px-4 py-3 font-bold">{EXPENSE_WORK_TRADE_LABELS[row.work_trade] ?? "기타"}</td>
                <td className="px-4 py-3">
                  <p className="font-bold text-slate-950">{row.vendor_name_snapshot ?? row.vendors?.name ?? "-"}</p>
                  <p className="max-w-xs truncate text-xs font-medium text-slate-600" title={row.description}>
                    {row.description}
                  </p>
                </td>
                <td className="px-4 py-3 font-semibold">{EXPENSE_PAYMENT_LABELS[row.payment_method]}</td>
                <td className="px-4 py-3 text-right font-black text-slate-950">{money(row.total_amount)}</td>
                <td className="px-4 py-3 text-right font-black text-slate-950">{money(row.cost_basis_amount)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{dateOnly(row.expense_date)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{dateOnly(row.payment_due_date)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{dateTime(row.paid_at)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{dateTime(row.created_at)}</td>
                <td className="px-4 py-3 font-semibold">
                  {(row.expense_documents?.length ?? 0) > 0
                    ? `${row.expense_documents?.length ?? 0}건`
                    : "미첨부"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                  {row.requested_employee
                    ? `${row.requested_employee.name} ${row.requested_employee.title}`
                    : "관리자"}
                </td>
              </tr>
            ))}
            {requests.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-12 text-center text-sm font-semibold text-slate-500">
                  선택한 조회기간에 지출 내역이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
