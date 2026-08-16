"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelCollectionReceiptAction,
  confirmCollectionReceiptAction,
  registerCollectionReceiptAction,
  type CollectionActionResult,
} from "@/app/actions/collections";
import {
  COLLECTION_PAYMENT_LABELS,
  COLLECTION_STATUS_LABELS,
  COLLECTION_TYPE_LABELS,
  type CollectionContract,
  type CollectionReceipt,
} from "@/lib/crm/collection-shared";

const initialState: CollectionActionResult = { success: false };

function money(value: number | null | undefined): string {
  return `${Number(value ?? 0).toLocaleString("ko-KR")}원`;
}

function basisAmount(contract: CollectionContract): number {
  return Number(contract.cumulative_contract_amount ?? contract.contract_amount ?? 0);
}

function outstandingAmount(contract: CollectionContract): number {
  return Math.max(0, basisAmount(contract) - Number(contract.received_amount ?? 0));
}

function todayKorea(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function CollectionsWorkspace({
  contracts,
  receipts,
  isFinanceAdmin,
  initialContractId,
}: {
  contracts: CollectionContract[];
  receipts: CollectionReceipt[];
  isFinanceAdmin: boolean;
  initialContractId?: string;
}) {
  const router = useRouter();
  const [state, action, registerPending] = useActionState(
    registerCollectionReceiptAction,
    initialState,
  );
  const [pending, startTransition] = useTransition();
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState(() =>
    initialContractId && contracts.some((contract) => contract.id === initialContractId)
      ? initialContractId
      : contracts[0]?.id ?? "",
  );

  const selectedContract = contracts.find((row) => row.id === selectedContractId) ?? null;
  const pendingReceipts = receipts.filter((row) => row.status === "pending");

  const totals = useMemo(() => {
    const contractAmount = contracts.reduce((sum, row) => sum + basisAmount(row), 0);
    const received = contracts.reduce(
      (sum, row) => sum + Number(row.received_amount ?? 0),
      0,
    );
    const outstanding = contracts.reduce(
      (sum, row) => sum + outstandingAmount(row),
      0,
    );
    const waiting = pendingReceipts.reduce(
      (sum, row) => sum + Number(row.amount ?? 0),
      0,
    );
    return { contractAmount, received, outstanding, waiting };
  }, [contracts, pendingReceipts]);

  const feedback = localMessage || state.message || state.error || null;

  function confirmReceipt(receipt: CollectionReceipt) {
    if (!window.confirm(`${receipt.customers?.name ?? "고객"} ${money(receipt.amount)} 수금을 확정하시겠습니까?`)) {
      return;
    }
    startTransition(async () => {
      const result = await confirmCollectionReceiptAction(receipt.id);
      setLocalMessage(result.message ?? result.error ?? null);
      if (result.success) router.refresh();
    });
  }

  function cancelReceipt(receipt: CollectionReceipt) {
    const reason = window.prompt("수금 취소 사유를 입력해 주세요.");
    if (!reason?.trim()) return;
    startTransition(async () => {
      const result = await cancelCollectionReceiptAction(receipt.id, reason);
      setLocalMessage(result.message ?? result.error ?? null);
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {feedback ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            state.error || feedback.includes("실패")
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {feedback}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="계약 기준금액" value={money(totals.contractAmount)} />
        <SummaryCard label="확정 수금" value={money(totals.received)} tone="good" />
        <SummaryCard label="미수금" value={money(totals.outstanding)} tone="warn" />
        <SummaryCard label="확인대기" value={money(totals.waiting)} tone="pending" />
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-950">수금 등록</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {isFinanceAdmin
                ? "관리자 등록은 즉시 확정되고 담당직원에게 PUSH됩니다."
                : "직원은 카드·현금 수금만 등록할 수 있으며 관리자 확인대기로 저장됩니다. 등록 즉시 관리자들에게 PUSH됩니다."}
            </p>
          </div>
          {!isFinanceAdmin ? (
            <span className="w-fit rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
              직원 등록 → 관리자 확인
            </span>
          ) : null}
        </div>

        {contracts.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
            수금을 등록할 확정 계약이 없습니다. 먼저 견적을 계약으로 전환해 주세요.
          </div>
        ) : (
          <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <label className="sm:col-span-2 xl:col-span-3">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">계약 / 고객</span>
              <select
                name="contract_id"
                value={selectedContractId}
                onChange={(event) => setSelectedContractId(event.target.value)}
                required
                className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-slate-900"
              >
                {contracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.customers?.name ?? "고객"} · {contract.contract_number} · 미수 {money(outstandingAmount(contract))}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">수금 구분</span>
              <select name="collection_type" defaultValue="deposit" className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm">
                <option value="deposit">계약금</option>
                <option value="interim">중도금</option>
                <option value="final">잔금</option>
                <option value="other">기타</option>
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">결제수단</span>
              <select name="payment_method" defaultValue={isFinanceAdmin ? "bank_transfer" : "card"} className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm">
                {isFinanceAdmin ? <option value="bank_transfer">계좌입금</option> : null}
                <option value="card">카드</option>
                <option value="cash">현금</option>
                {isFinanceAdmin ? <option value="other">기타</option> : null}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">수금일</span>
              <input name="received_date" type="date" defaultValue={todayKorea()} required className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm" />
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">수금액</span>
              <input name="amount" type="number" min="1" step="1" required placeholder="예: 5000000" className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm" />
            </label>

            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">메모</span>
              <input name="memo" placeholder={isFinanceAdmin ? "입금자명, 카드 승인 메모 등" : "카드 승인/현금 수령 상황을 간단히 적어주세요"} className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm" />
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={registerPending || !selectedContract}
                className="min-h-11 w-full rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {registerPending
                  ? "등록 중..."
                  : isFinanceAdmin
                    ? "수금 확정 등록"
                    : "수금 확인 요청"}
              </button>
            </div>
          </form>
        )}
      </section>

      {isFinanceAdmin ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-amber-950">직원 수금 확인대기</h2>
              <p className="mt-1 text-xs text-amber-800">직원이 카드·현금 수금으로 등록한 건입니다. 실제 결제를 확인한 뒤 확정하세요.</p>
            </div>
            <span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-bold text-amber-950">{pendingReceipts.length}건</span>
          </div>
          {pendingReceipts.length === 0 ? (
            <p className="mt-4 rounded-lg bg-white/70 px-4 py-5 text-center text-sm text-amber-900">확인대기 수금이 없습니다.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {pendingReceipts.map((receipt) => (
                <div key={receipt.id} className="rounded-xl border border-amber-200 bg-white p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="font-bold text-slate-950">
                        {receipt.customers?.name ?? "고객"} · {money(receipt.amount)}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {COLLECTION_TYPE_LABELS[receipt.collection_type]} · {COLLECTION_PAYMENT_LABELS[receipt.payment_method]}
                        {receipt.reported_employee ? ` · 등록 ${receipt.reported_employee.name} ${receipt.reported_employee.title}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        수금일 {new Date(receipt.received_at).toLocaleDateString("ko-KR")} {receipt.memo ? `· ${receipt.memo}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => confirmReceipt(receipt)} disabled={pending} className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">확정</button>
                      <button onClick={() => cancelReceipt(receipt)} disabled={pending} className="min-h-11 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">취소</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-4 sm:px-5">
          <h2 className="font-bold text-slate-950">수금 내역</h2>
          <p className="mt-1 text-xs text-slate-600">확정·확인대기·취소 이력을 모두 보존합니다.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">고객 / 계약</th>
                <th className="px-4 py-3">구분</th>
                <th className="px-4 py-3">결제</th>
                <th className="px-4 py-3 text-right">금액</th>
                <th className="px-4 py-3">수금일</th>
                <th className="px-4 py-3">등록자</th>
                {isFinanceAdmin ? <th className="px-4 py-3">관리</th> : null}
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt.id} className="border-t border-gray-100">
                  <td className="px-4 py-3"><StatusBadge status={receipt.status} /></td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{receipt.customers?.name ?? "-"}</p>
                    <p className="text-xs text-slate-500">{receipt.contracts?.contract_number ?? "-"}</p>
                  </td>
                  <td className="px-4 py-3">{COLLECTION_TYPE_LABELS[receipt.collection_type]}</td>
                  <td className="px-4 py-3">{COLLECTION_PAYMENT_LABELS[receipt.payment_method]}</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-950">{money(receipt.amount)}</td>
                  <td className="px-4 py-3 text-slate-600">{new Date(receipt.received_at).toLocaleDateString("ko-KR")}</td>
                  <td className="px-4 py-3 text-slate-600">{receipt.reported_employee ? `${receipt.reported_employee.name} ${receipt.reported_employee.title}` : "관리자"}</td>
                  {isFinanceAdmin ? (
                    <td className="px-4 py-3">
                      {receipt.status !== "cancelled" ? (
                        <button onClick={() => cancelReceipt(receipt)} disabled={pending} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">취소</button>
                      ) : (
                        <span className="text-xs text-slate-400">{receipt.cancel_reason ?? "취소"}</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={isFinanceAdmin ? 8 : 7} className="px-4 py-12 text-center text-sm text-slate-500">등록된 수금내역이 없습니다.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn" | "pending";
}) {
  const toneClass = {
    default: "border-slate-200 bg-white text-slate-950",
    good: "border-emerald-200 bg-emerald-50 text-emerald-950",
    warn: "border-red-200 bg-red-50 text-red-950",
    pending: "border-amber-200 bg-amber-50 text-amber-950",
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-xs font-semibold opacity-70">{label}</p>
      <p className="mt-1 text-lg font-black sm:text-xl">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: CollectionReceipt["status"] }) {
  const cls =
    status === "confirmed"
      ? "bg-emerald-100 text-emerald-800"
      : status === "pending"
        ? "bg-amber-100 text-amber-900"
        : "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>
      {COLLECTION_STATUS_LABELS[status]}
    </span>
  );
}
