"use server";

import { revalidatePath } from "next/cache";
import {
  confirmContract,
  confirmContractAddition,
  confirmContractAmendment,
  createContractAddition,
  createContractAmendment,
  restoreTerminatedContract,
  terminateContract,
  updateContractDraft,
  type ContractDraftPayload,
} from "@/lib/crm/contracts";

export type ContractActionResult = { success: boolean; error?: string; message?: string; contractId?: string };

function money(form: FormData, key: string): number | undefined {
  const raw = String(form.get(key) ?? "").replace(/,/g, "").trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("금액은 0 이상 정수(원)여야 합니다.");
  return value;
}

function draftPayload(form: FormData): ContractDraftPayload {
  return {
    title: String(form.get("title") ?? "").trim() || undefined,
    scope_summary: String(form.get("scope_summary") ?? "").trim() || undefined,
    work_start_date: String(form.get("work_start_date") ?? "").trim() || null,
    work_end_date: String(form.get("work_end_date") ?? "").trim() || null,
    change_reason: String(form.get("change_reason") ?? "").trim() || undefined,
    supply_amount: money(form, "supply_amount"),
    vat_amount: money(form, "vat_amount"),
    discount_amount: money(form, "discount_amount"),
    contract_amount: money(form, "contract_amount"),
  };
}

function refresh(id?: string) {
  revalidatePath("/contracts");
  if (id) revalidatePath(`/contracts/${id}`);
}

async function run(fn: () => Promise<{ contract_id?: string }>, message: string): Promise<ContractActionResult> {
  try {
    const result = await fn();
    refresh(result.contract_id);
    return { success: true, message, contractId: result.contract_id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "계약 처리에 실패했습니다." };
  }
}

export async function updateContractDraftAction(form: FormData) {
  const id = String(form.get("contract_id") ?? "").trim();
  return run(() => updateContractDraft(id, draftPayload(form)), "초안이 저장되었습니다.");
}
export async function confirmContractAction(form: FormData) {
  const id = String(form.get("contract_id") ?? "").trim();
  return run(() => confirmContract(id), "계약이 확정되었습니다.");
}
export async function createContractAmendmentAction(form: FormData) {
  const id = String(form.get("root_contract_id") ?? "").trim();
  return run(() => createContractAmendment(id, draftPayload(form)), "변경계약 초안이 생성되었습니다.");
}
export async function createContractAdditionAction(form: FormData) {
  const id = String(form.get("root_contract_id") ?? "").trim();
  return run(() => createContractAddition(id, draftPayload(form)), "추가계약 초안이 생성되었습니다.");
}
export async function confirmContractAmendmentAction(form: FormData) {
  const id = String(form.get("contract_id") ?? "").trim();
  return run(() => confirmContractAmendment(id), "변경계약이 확정되었습니다.");
}
export async function confirmContractAdditionAction(form: FormData) {
  const id = String(form.get("contract_id") ?? "").trim();
  return run(() => confirmContractAddition(id), "추가계약이 확정되었습니다.");
}
export async function terminateContractAction(form: FormData) {
  const id = String(form.get("contract_id") ?? "").trim();
  return run(() => terminateContract(id, {
    reason: String(form.get("reason") ?? "").trim(),
    fault: String(form.get("fault") ?? "").trim() || undefined,
    memo: String(form.get("memo") ?? "").trim() || undefined,
    penalty_amount: money(form, "penalty_amount"),
    received_amount: money(form, "received_amount"),
    progress_amount: money(form, "progress_amount"),
    refund_amount: money(form, "refund_amount"),
    outstanding_amount: money(form, "outstanding_amount"),
  }), "계약이 해지되었습니다.");
}
export async function restoreTerminatedContractAction(form: FormData) {
  const id = String(form.get("contract_id") ?? "").trim();
  const reason = String(form.get("reason") ?? "").trim();
  return run(() => restoreTerminatedContract(id, reason), "계약이 복구되었습니다.");
}
