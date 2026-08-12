"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { attachExpenseDocumentLaterAction } from "@/app/actions/expenses";
import { EXPENSE_PAYMENT_LABELS, type ExpenseRequestRecord } from "@/lib/crm/expense-shared";

function money(value: number | null | undefined) {
  return `${Number(value ?? 0).toLocaleString("ko-KR")}원`;
}

export default function MissingExpenseEvidencePanel({
  requests,
}: {
  requests: ExpenseRequestRecord[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const missing = requests.filter(
    (row) => (row.expense_documents?.length ?? 0) === 0 && row.status !== "cancelled",
  );

  if (missing.length === 0) return null;

  return (
    <section className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-bold text-sky-950">증빙 보완</h2>
          <p className="mt-1 text-xs leading-relaxed text-sky-800">
            영수증 없이 먼저 등록한 법인카드·현장 지출입니다. 카드내역이나 문자로 금액을 확인해도 되고,
            영수증이 생기면 여기서 나중에 첨부할 수 있습니다.
          </p>
        </div>
        <span className="w-fit rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-900">
          미첨부 {missing.length}건
        </span>
      </div>

      {message ? (
        <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-medium text-sky-900">
          {message}
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {missing.map((row) => (
          <div key={row.id} className="rounded-xl border border-sky-200 bg-white p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-bold text-slate-950">
                  {row.projects?.name ?? "현장"} · {money(row.total_amount)}
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {row.vendor_name_snapshot ?? "거래처 미지정"} · {row.description}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {EXPENSE_PAYMENT_LABELS[row.payment_method]} · 증빙 미첨부
                </p>
              </div>

              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                action={(formData) => {
                  startTransition(async () => {
                    const result = await attachExpenseDocumentLaterAction(row.id, formData);
                    setMessage(result.message ?? result.error ?? null);
                    if (result.success) router.refresh();
                  });
                }}
              >
                <label className="text-xs font-semibold text-slate-700">
                  증빙 종류
                  <select
                    name="document_type"
                    defaultValue="receipt"
                    className="mt-1 min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm"
                  >
                    <option value="receipt">영수증</option>
                    <option value="transaction_statement">거래명세서</option>
                    <option value="invoice">세금계산서/청구서</option>
                    <option value="other">기타 증빙</option>
                  </select>
                </label>
                <input
                  name="document"
                  type="file"
                  required
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="max-w-xs rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="min-h-10 rounded-lg bg-sky-700 px-3 text-xs font-bold text-white hover:bg-sky-800 disabled:opacity-50"
                >
                  {pending ? "첨부 중..." : "증빙 추가"}
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
