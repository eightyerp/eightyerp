"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  confirmContractAction,
  confirmContractAdditionAction,
  confirmContractAmendmentAction,
  createContractAdditionAction,
  createContractAmendmentAction,
  restoreTerminatedContractAction,
  terminateContractAction,
  updateContractDraftAction,
} from "@/app/actions/contracts";
import {
  CONTRACT_EVENT_LABELS,
  CONTRACT_FAULT_LABELS,
  contractRevisionLabel,
  contractStatusLabel,
  normalizeLifecycleStatus,
} from "@/lib/crm/contract-constants";
import type { Contract } from "@/types/database";

const money = (value: number | null | undefined) => `${Number(value ?? 0).toLocaleString("ko-KR")}원`;

function MoneyInput({ name, value }: { name: string; value?: number | null }) {
  return <input name={name} type="number" min="0" step="1" defaultValue={value ?? 0} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />;
}

export default function ContractDetailView({ contract }: { contract: Contract }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<"amendment" | "addition" | "terminate" | "restore" | null>(null);
  const status = normalizeLifecycleStatus(contract.status);
  const rootId = contract.root_contract_id ?? contract.id;
  const revision = contractRevisionLabel(contract.contract_kind, contract.revision_seq);

  function submit(action: (form: FormData) => Promise<{ success: boolean; error?: string; message?: string; contractId?: string }>) {
    return (form: FormData) => startTransition(async () => {
      const result = await action(form);
      setMessage(result.error ?? result.message ?? null);
      if (result.success) {
        setMode(null);
        router.refresh();
        if (result.contractId && result.contractId !== contract.id) router.push(`/contracts/${result.contractId}`);
      }
    });
  }

  const isDraft = status === "draft";
  const isTerminated = status === "terminated";
  return (
    <div className="space-y-5">
      {message && <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-700">{message}</p>}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-gray-500">{contract.contract_number} {revision && <span className="ml-2 text-amber-700">{revision}</span>}</p>
            <h2 className="mt-1 text-xl font-bold text-gray-900">{contract.title || "계약"}</h2>
            <p className="mt-1 text-sm text-gray-500">{contract.customers?.name ?? "-"} · {contract.projects?.name ?? "현장 미지정"}</p>
          </div>
          <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">{contractStatusLabel(contract.status)}</span>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {isDraft && <form action={submit(contract.contract_kind === "amendment" ? confirmContractAmendmentAction : contract.contract_kind === "addition" ? confirmContractAdditionAction : confirmContractAction)} onSubmit={(e) => { if (!window.confirm("이 계약을 확정하시겠습니까?")) e.preventDefault(); }}><input type="hidden" name="contract_id" value={contract.id}/><button disabled={pending} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white">계약 확정</button></form>}
          {!isDraft && !isTerminated && <>{["confirmed", "amending", "adding"].includes(status) && <><button onClick={() => setMode("amendment")} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">변경계약 생성</button><button onClick={() => setMode("addition")} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">추가계약 생성</button></>}<button onClick={() => setMode("terminate")} className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700">계약 해지</button></>}
          {isTerminated && <button onClick={() => setMode("restore")} className="rounded-lg border border-emerald-300 px-4 py-2 text-sm text-emerald-700">관리자 복구</button>}
        </div>
      </section>

      {isDraft && <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6"><h3 className="font-semibold">초안 내용</h3><form action={submit(updateContractDraftAction)} className="mt-4 grid gap-3 sm:grid-cols-2"><input type="hidden" name="contract_id" value={contract.id}/><input name="title" defaultValue={contract.title ?? ""} placeholder="계약 제목" className="rounded border border-gray-300 px-3 py-2"/><input name="scope_summary" defaultValue={contract.scope_summary ?? ""} placeholder="작업 범위" className="rounded border border-gray-300 px-3 py-2"/><input name="work_start_date" type="date" defaultValue={contract.work_start_date ?? ""} className="rounded border border-gray-300 px-3 py-2"/><input name="work_end_date" type="date" defaultValue={contract.work_end_date ?? ""} className="rounded border border-gray-300 px-3 py-2"/><MoneyInput name="supply_amount" value={contract.supply_amount}/><MoneyInput name="vat_amount" value={contract.vat_amount}/><MoneyInput name="discount_amount" value={contract.discount_amount}/><MoneyInput name="contract_amount" value={contract.contract_amount}/><textarea name="change_reason" defaultValue={contract.change_reason ?? ""} placeholder="변경 사유" className="sm:col-span-2 rounded border border-gray-300 px-3 py-2"/><button disabled={pending} className="w-fit rounded-lg bg-navy-900 px-4 py-2 text-sm text-white">초안 저장</button></form></section>}

      <section className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-gray-200 bg-white p-4"><h3 className="font-semibold">금액 내역</h3><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><dt>공급가</dt><dd>{money(contract.supply_amount)}</dd></div><div className="flex justify-between"><dt>부가세</dt><dd>{money(contract.vat_amount)}</dd></div><div className="flex justify-between"><dt>할인</dt><dd>-{money(contract.discount_amount)}</dd></div><div className="flex justify-between border-t pt-2 font-bold"><dt>계약금액</dt><dd>{money(contract.contract_amount)}</dd></div>{contract.previous_contract_amount != null && <><div className="flex justify-between"><dt>이전 계약금액</dt><dd>{money(contract.previous_contract_amount)}</dd></div><div className="flex justify-between"><dt>증감</dt><dd>{contract.delta_amount && contract.delta_amount > 0 ? "+" : ""}{money(contract.delta_amount)}</dd></div><div className="flex justify-between"><dt>누적 계약금액</dt><dd>{money(contract.cumulative_contract_amount)}</dd></div></>}</dl></div><div className="rounded-xl border border-gray-200 bg-white p-4"><h3 className="font-semibold">계약 정보</h3><dl className="mt-3 space-y-2 text-sm text-gray-600"><div>계약일: {contract.contract_date}</div><div>작업기간: {contract.work_start_date ?? "-"} ~ {contract.work_end_date ?? "-"}</div><div>범위: {contract.scope_summary ?? "-"}</div>{contract.termination_reason && <div>해지 사유: {contract.termination_reason}</div>}</dl></div></section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6"><h3 className="font-semibold">계약 이력</h3><ol className="mt-4 space-y-3 border-l border-gray-200 pl-4">{(contract.contract_events ?? []).map((event) => <li key={event.id} className="text-sm"><p className="font-medium">{CONTRACT_EVENT_LABELS[event.event_type] ?? event.event_type}</p><p className="text-gray-500">{event.reason || "사유 없음"} · {new Date(event.created_at).toLocaleString("ko-KR")}</p></li>)}{!contract.contract_events?.length && <li className="text-sm text-gray-500">기록이 없습니다.</li>}</ol></section>

      {(mode === "amendment" || mode === "addition") && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-semibold">{mode === "amendment" ? "변경" : "추가"}계약 초안 생성</h3><p className="mt-1 text-xs text-amber-800">{mode === "amendment" ? "변경 후 총 계약금액을 입력하세요." : "이번 추가분 금액만 입력하세요. 누적금액은 서버에서 계산합니다."}</p><form action={submit(mode === "amendment" ? createContractAmendmentAction : createContractAdditionAction)} onSubmit={(e) => { if (!window.confirm("새 계약 초안을 생성하시겠습니까?")) e.preventDefault(); }} className="mt-3 grid gap-3 sm:grid-cols-2"><input type="hidden" name="root_contract_id" value={rootId}/><input name="title" defaultValue={contract.title ?? ""} className="rounded border border-gray-300 px-3 py-2"/><input name="scope_summary" defaultValue={contract.scope_summary ?? ""} className="rounded border border-gray-300 px-3 py-2"/><MoneyInput name="supply_amount" value={mode === "addition" ? 0 : contract.supply_amount}/><MoneyInput name="vat_amount" value={mode === "addition" ? 0 : contract.vat_amount}/><MoneyInput name="discount_amount" value={mode === "addition" ? 0 : contract.discount_amount}/><MoneyInput name="contract_amount" value={mode === "addition" ? 0 : contract.contract_amount}/><textarea required name="change_reason" placeholder="변경/추가 사유" className="sm:col-span-2 rounded border border-gray-300 px-3 py-2"/><button disabled={pending} className="w-fit rounded bg-navy-900 px-4 py-2 text-sm text-white">생성</button></form></section>}
      {mode === "terminate" && <section className="rounded-xl border border-red-200 bg-red-50 p-4"><h3 className="font-semibold text-red-900">계약 해지</h3><form action={submit(terminateContractAction)} onSubmit={(e) => { if (!window.confirm("계약을 해지하면 실행예산이 중지됩니다. 계속하시겠습니까?")) e.preventDefault(); }} className="mt-3 grid gap-3 sm:grid-cols-2"><input type="hidden" name="contract_id" value={contract.id}/><textarea required name="reason" placeholder="해지 사유" className="sm:col-span-2 rounded border border-gray-300 px-3 py-2"/><select name="fault" className="rounded border border-gray-300 px-3 py-2"><option value="">귀책 선택</option>{Object.entries(CONTRACT_FAULT_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><MoneyInput name="penalty_amount"/><MoneyInput name="received_amount"/><MoneyInput name="refund_amount"/><textarea name="memo" placeholder="메모" className="sm:col-span-2 rounded border border-gray-300 px-3 py-2"/><button disabled={pending} className="w-fit rounded bg-red-700 px-4 py-2 text-sm text-white">해지 확정</button></form></section>}
      {mode === "restore" && <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><form action={submit(restoreTerminatedContractAction)} onSubmit={(e) => { if (!window.confirm("관리자 권한으로 계약을 복구하시겠습니까?")) e.preventDefault(); }} className="flex flex-col gap-3 sm:flex-row"><input type="hidden" name="contract_id" value={contract.id}/><input required name="reason" placeholder="복구 사유" className="flex-1 rounded border border-gray-300 px-3 py-2"/><button disabled={pending} className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">복구</button></form></section>}
    </div>
  );
}
