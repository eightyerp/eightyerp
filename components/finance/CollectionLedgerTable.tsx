"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelCollectionReceiptAction,
  confirmCollectionReceiptAction,
} from "@/app/actions/collections";
import {
  COLLECTION_PAYMENT_LABELS,
  COLLECTION_STATUS_LABELS,
  COLLECTION_TYPE_LABELS,
  type CollectionReceipt,
} from "@/lib/crm/collection-shared";
import { formatDateRangeLabel, type DateRangeValue } from "@/lib/date-range";

function money(value: number | null | undefined): string {
  return `${Number(value ?? 0).toLocaleString("ko-KR")}원`;
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

export default function CollectionLedgerTable({
  receipts,
  total,
  isFinanceAdmin,
  dateFieldLabel,
  range,
}: {
  receipts: CollectionReceipt[];
  total: number;
  isFinanceAdmin: boolean;
  dateFieldLabel: string;
  range: DateRangeValue;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const pageAmount = receipts
    .filter((row) => row.status !== "cancelled")
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  function confirmReceipt(receipt: CollectionReceipt) {
    if (
      !window.confirm(
        `${receipt.customers?.name ?? "고객"} ${money(receipt.amount)} 수금을 확정하시겠습니까?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await confirmCollectionReceiptAction(receipt.id);
      setMessage(result.message ?? result.error ?? null);
      if (result.success) router.refresh();
    });
  }

  function cancelReceipt(receipt: CollectionReceipt) {
    const reason = window.prompt("수금 취소 사유를 입력해 주세요.");
    if (!reason?.trim()) return;
    startTransition(async () => {
      const result = await cancelCollectionReceiptAction(receipt.id, reason);
      setMessage(result.message ?? result.error ?? null);
      if (result.success) router.refresh();
    });
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="font-black text-slate-950">수금 원장</h2>
          <p className="mt-1 text-xs font-medium text-slate-600">
            {dateFieldLabel} · {formatDateRangeLabel(range)} · 총 {total.toLocaleString("ko-KR")}건
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[11px] font-bold text-slate-500">현재 페이지 취소 제외 합계</p>
          <p className="mt-0.5 text-base font-black text-navy-900">{money(pageAmount)}</p>
        </div>
      </div>

      {message ? (
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 sm:px-5">
          {message}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold text-slate-600">
            <tr>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">고객 / 계약</th>
              <th className="px-4 py-3">구분</th>
              <th className="px-4 py-3">결제</th>
              <th className="px-4 py-3 text-right">금액</th>
              <th className="px-4 py-3">수금일</th>
              <th className="px-4 py-3">확정일</th>
              <th className="px-4 py-3">등록일</th>
              <th className="px-4 py-3">등록자</th>
              {isFinanceAdmin ? <th className="px-4 py-3">관리</th> : null}
            </tr>
          </thead>
          <tbody>
            {receipts.map((receipt) => (
              <tr key={receipt.id} className="border-t border-slate-100 text-slate-800">
                <td className="px-4 py-3">
                  <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                    {COLLECTION_STATUS_LABELS[receipt.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <p className="font-bold text-slate-950">{receipt.customers?.name ?? "-"}</p>
                  <p className="text-xs text-slate-500">{receipt.contracts?.contract_number ?? "-"}</p>
                </td>
                <td className="px-4 py-3 font-semibold">{COLLECTION_TYPE_LABELS[receipt.collection_type]}</td>
                <td className="px-4 py-3">{COLLECTION_PAYMENT_LABELS[receipt.payment_method]}</td>
                <td className="px-4 py-3 text-right font-black text-slate-950">{money(receipt.amount)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{dateTime(receipt.received_at)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{dateTime(receipt.confirmed_at)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{dateTime(receipt.created_at)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {receipt.reported_employee
                    ? `${receipt.reported_employee.name} ${receipt.reported_employee.title}`
                    : "관리자"}
                </td>
                {isFinanceAdmin ? (
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {receipt.status === "pending" ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => confirmReceipt(receipt)}
                          className="text-xs font-black text-emerald-700 hover:underline disabled:opacity-50"
                        >
                          확정
                        </button>
                      ) : null}
                      {receipt.status !== "cancelled" ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => cancelReceipt(receipt)}
                          className="text-xs font-black text-red-600 hover:underline disabled:opacity-50"
                        >
                          취소
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {receipts.length === 0 ? (
              <tr>
                <td
                  colSpan={isFinanceAdmin ? 10 : 9}
                  className="px-4 py-12 text-center text-sm font-semibold text-slate-500"
                >
                  선택한 조회기간에 수금 내역이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
