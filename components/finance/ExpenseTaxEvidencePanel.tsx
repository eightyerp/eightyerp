"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setExpenseTaxEvidenceAction } from "@/app/actions/expense-tax-evidence";
import {
  EXPENSE_PAYMENT_LABELS,
  EXPENSE_TAX_EVIDENCE_LABELS,
  type ExpenseRequestRecord,
} from "@/lib/crm/expense-shared";

function money(value: number | null | undefined) {
  return `${Number(value ?? 0).toLocaleString("ko-KR")}원`;
}

export default function ExpenseTaxEvidencePanel({
  requests,
}: {
  requests: ExpenseRequestRecord[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const unverified = requests.filter(
    (row) =>
      row.tax_evidence_type === "unverified" &&
      row.category !== "labor" &&
      row.status !== "cancelled" &&
      row.status !== "rejected",
  );

  if (unverified.length === 0) return null;

  return (
    <section className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-bold text-teal-950">세무증빙 정리</h2>
          <p className="mt-1 text-xs leading-relaxed text-teal-800">
            세금계산서·지출증빙용 현금영수증은 공급가만 현장손익 비용으로 반영하고 부가세는 별도 관리합니다.
            인건비는 별도 정리 없이 입력 공급가가 그대로 현장비용입니다.
          </p>
        </div>
        <span className="w-fit rounded-full bg-teal-100 px-2.5 py-1 text-xs font-bold text-teal-900">
          미확인 {unverified.length}건
        </span>
      </div>

      {message ? (
        <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-medium text-teal-900">
          {message}
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {unverified.slice(0, 30).map((row) => (
          <form
            key={row.id}
            className="rounded-xl border border-teal-200 bg-white p-4"
            action={(formData) => {
              startTransition(async () => {
                const result = await setExpenseTaxEvidenceAction(row.id, formData);
                setMessage(result.message ?? result.error ?? null);
                if (result.success) router.refresh();
              });
            }}
          >
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-950">
                  {row.projects?.name ?? "현장"} · {row.vendor_name_snapshot ?? "거래처"}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {row.description} · {EXPENSE_PAYMENT_LABELS[row.payment_method]} · 지급총액 {money(row.total_amount)}
                </p>
              </div>

              <label className="xl:w-52">
                <span className="mb-1 block text-xs font-semibold text-slate-700">세무증빙</span>
                <select
                  name="tax_evidence_type"
                  defaultValue="tax_invoice"
                  className="min-h-10 w-full rounded-lg border border-teal-200 bg-white px-2 text-sm"
                >
                  {Object.entries(EXPENSE_TAX_EVIDENCE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="xl:w-36">
                <span className="mb-1 block text-xs font-semibold text-slate-700">공급가</span>
                <input
                  name="supply_amount"
                  type="number"
                  min="0"
                  step="1"
                  required
                  defaultValue={row.supply_amount}
                  className="min-h-10 w-full rounded-lg border border-teal-200 px-2 text-sm"
                />
              </label>

              <label className="xl:w-32">
                <span className="mb-1 block text-xs font-semibold text-slate-700">부가세</span>
                <input
                  name="vat_amount"
                  type="number"
                  min="0"
                  step="1"
                  required
                  defaultValue={row.vat_amount}
                  className="min-h-10 w-full rounded-lg border border-teal-200 px-2 text-sm"
                />
              </label>

              <label className="xl:w-36">
                <span className="mb-1 block text-xs font-semibold text-slate-700">합계</span>
                <input
                  name="total_amount"
                  type="number"
                  min="1"
                  step="1"
                  required
                  defaultValue={row.total_amount}
                  className="min-h-10 w-full rounded-lg border border-teal-200 px-2 text-sm font-bold"
                />
              </label>

              <button
                type="submit"
                disabled={pending}
                className="min-h-10 rounded-lg bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {pending ? "반영 중..." : "손익기준 반영"}
              </button>
            </div>
          </form>
        ))}
      </div>
    </section>
  );
}
