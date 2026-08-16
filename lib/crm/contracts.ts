import { createClient } from "@/lib/supabase-server";
import type { Contract, ContractEvent, Project } from "@/types/database";

export type CustomerContractSummary = Pick<
  Contract,
  | "id"
  | "customer_id"
  | "quote_id"
  | "project_id"
  | "contract_number"
  | "contract_date"
  | "status"
  | "contract_kind"
  | "revision_seq"
  | "title"
  | "work_start_date"
  | "work_end_date"
  | "contract_amount"
  | "delta_amount"
  | "cumulative_contract_amount"
  | "received_amount"
  | "created_at"
> & {
  projects: Pick<Project, "id" | "name" | "address"> | null;
};

export type ContractDraftPayload = {
  title?: string;
  scope_summary?: string;
  work_start_date?: string | null;
  work_end_date?: string | null;
  change_reason?: string;
  supply_amount?: number;
  vat_amount?: number;
  discount_amount?: number;
  contract_amount?: number;
  items_snapshot?: Record<string, unknown> | null;
};

export type ContractTerminatePayload = {
  reason: string;
  fault?: string;
  memo?: string;
  penalty_amount?: number;
  received_amount?: number;
  progress_amount?: number;
  refund_amount?: number;
  outstanding_amount?: number;
};

function cleanMoneyFields<T extends Record<string, unknown>>(payload: T): T {
  for (const key of [
    "supply_amount",
    "vat_amount",
    "discount_amount",
    "contract_amount",
    "penalty_amount",
    "received_amount",
    "progress_amount",
    "refund_amount",
    "outstanding_amount",
  ] as const) {
    const value = payload[key as keyof T];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new Error("금액은 0 이상 정수(원)여야 합니다.");
    }
  }
  return payload;
}

function cleanPayload(payload: ContractDraftPayload): ContractDraftPayload {
  return cleanMoneyFields({ ...payload });
}

async function callContractRpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  // Generated Database types may not yet include lifecycle RPCs.
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw new Error(error.message);
  return data as {
    contract_id?: string;
    root_contract_id?: string;
    ok?: boolean;
  };
}

export async function listContracts(): Promise<Contract[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contracts")
    .select(
      "*, customers:customers!contracts_customer_id_fkey ( id, name, phone, address ), projects:projects!contracts_project_id_fkey ( id, name, address, status )",
    )
    .order("contract_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Contract[];
}

export async function listCustomerContractSummaries(
  customerId: string,
): Promise<CustomerContractSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contracts")
    .select(
      `
      id, customer_id, quote_id, project_id, contract_number, contract_date,
      status, contract_kind, revision_seq, title, work_start_date, work_end_date,
      contract_amount, delta_amount, cumulative_contract_amount,
      received_amount, created_at,
      projects:projects!contracts_project_id_fkey ( id, name, address )
    `,
    )
    .eq("customer_id", customerId)
    .order("contract_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CustomerContractSummary[];
}

export async function getContractById(id: string): Promise<Contract | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contracts")
    .select(
      "*, customers:customers!contracts_customer_id_fkey ( id, name, phone, address ), projects:projects!contracts_project_id_fkey ( id, name, address, status )",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const contract = data as Contract;
  const rootId = contract.root_contract_id ?? contract.id;
  const [{ data: events, error: eventsError }, { data: children, error: childrenError }] =
    await Promise.all([
      supabase
        .from("contract_events")
        .select("*")
        .eq("root_contract_id", rootId)
        .order("created_at", { ascending: false }),
      supabase
        .from("contracts")
        .select("*")
        .eq("root_contract_id", rootId)
        .order("contract_kind")
        .order("revision_seq"),
    ]);
  if (eventsError) throw new Error(eventsError.message);
  if (childrenError) throw new Error(childrenError.message);
  contract.contract_events = (events ?? []) as ContractEvent[];
  contract.children = (children ?? []) as Contract[];
  return contract;
}

export const confirmContract = (contractId: string) =>
  callContractRpc("confirm_contract", { p_contract_id: contractId });

export const updateContractDraft = (
  contractId: string,
  payload: ContractDraftPayload,
) =>
  callContractRpc("update_contract_draft", {
    p_contract_id: contractId,
    p_payload: cleanPayload(payload),
  });

export const createContractAmendment = (
  rootContractId: string,
  payload: ContractDraftPayload,
) =>
  callContractRpc("create_contract_amendment", {
    p_root_contract_id: rootContractId,
    p_payload: cleanPayload(payload),
  });

export const confirmContractAmendment = (amendmentId: string) =>
  callContractRpc("confirm_contract_amendment", {
    p_amendment_id: amendmentId,
  });

export const createContractAddition = (
  rootContractId: string,
  payload: ContractDraftPayload,
) =>
  callContractRpc("create_contract_addition", {
    p_root_contract_id: rootContractId,
    p_payload: cleanPayload(payload),
  });

export const confirmContractAddition = (additionId: string) =>
  callContractRpc("confirm_contract_addition", {
    p_addition_id: additionId,
  });

export const terminateContract = (
  contractId: string,
  payload: ContractTerminatePayload,
) =>
  callContractRpc("terminate_contract", {
    p_contract_id: contractId,
    p_payload: cleanMoneyFields({ ...payload }),
  });

export const restoreTerminatedContract = (contractId: string, reason: string) =>
  callContractRpc("restore_terminated_contract", {
    p_contract_id: contractId,
    p_reason: reason.trim(),
  });
