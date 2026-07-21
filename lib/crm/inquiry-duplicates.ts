import { createClient } from "@/lib/supabase-server";
import {
  isComparablePhone,
  normalizePhone,
  phoneDigits,
} from "@/lib/crm/parse-inquiry";
import { formatEmployeeLabel } from "@/lib/crm/constants";
import type { Employee } from "@/types/database";

export type DuplicateMatchReason =
  | "source_order_no"
  | "phone"
  | "name_address";

export type DuplicateCandidate = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  source_order_no: string | null;
  reason: DuplicateMatchReason;
  status: string | null;
  assignee_name: string | null;
};

type CustomerDupRow = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  source_order_no: string | null;
  status: string | null;
  employees?:
    | Pick<Employee, "id" | "name" | "title">
    | Pick<Employee, "id" | "name" | "title">[]
    | null;
};

const DUP_SELECT =
  "id, name, phone, address, source_order_no, status, employees ( id, name, title )";

function normalizeAddress(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toLowerCase();
}

function resolveAssignee(
  employees:
    | Pick<Employee, "id" | "name" | "title">
    | Pick<Employee, "id" | "name" | "title">[]
    | null
    | undefined,
): Pick<Employee, "id" | "name" | "title"> | null {
  if (!employees) return null;
  return Array.isArray(employees) ? (employees[0] ?? null) : employees;
}

function toCandidate(
  row: CustomerDupRow,
  reason: DuplicateMatchReason,
): DuplicateCandidate {
  const assignee = resolveAssignee(row.employees);
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    source_order_no: row.source_order_no ?? null,
    reason,
    status: row.status ?? null,
    assignee_name: assignee
      ? formatEmployeeLabel(assignee.name, assignee.title)
      : null,
  };
}

async function getCurrentCompanyId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_company_id");
  if (error || data == null || data === "") return null;
  return String(data);
}

/**
 * 회사 범위 + 숫자만 비교 전화 중복 조회 (soft 경고용).
 * 불완전/빈 번호는 조회하지 않음.
 */
export async function findPhoneDuplicates(input: {
  phone?: string | null;
  excludeId?: string;
}): Promise<DuplicateCandidate[]> {
  if (!isComparablePhone(input.phone ?? "")) return [];

  const companyId = await getCurrentCompanyId();
  if (!companyId) return [];

  const digits = phoneDigits(input.phone ?? "");
  const normalized = normalizePhone(input.phone ?? "");
  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select(DUP_SELECT)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .or(`phone.eq.${normalized},phone.eq.${digits}`)
    .limit(10);

  if (input.excludeId) {
    query = query.neq("id", input.excludeId);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const results: DuplicateCandidate[] = [];
  const seen = new Set<string>();
  for (const row of data as unknown as CustomerDupRow[]) {
    if (phoneDigits(row.phone) !== digits) continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    results.push(toCandidate(row, "phone"));
  }
  return results;
}

export async function findInquiryDuplicates(input: {
  source_order_no?: string | null;
  phone?: string | null;
  name?: string | null;
  address?: string | null;
  excludeId?: string;
}): Promise<DuplicateCandidate[]> {
  const companyId = await getCurrentCompanyId();
  if (!companyId) return [];

  const supabase = await createClient();
  const results: DuplicateCandidate[] = [];
  const seen = new Set<string>();

  const pushRows = (rows: CustomerDupRow[], reason: DuplicateMatchReason) => {
    for (const row of rows) {
      if (input.excludeId && row.id === input.excludeId) continue;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      results.push(toCandidate(row, reason));
    }
  };

  const orderNo = (input.source_order_no ?? "").trim();
  if (orderNo) {
    const { data, error } = await supabase
      .from("customers")
      .select(DUP_SELECT)
      .eq("company_id", companyId)
      .eq("source_order_no", orderNo)
      .is("deleted_at", null)
      .limit(5);
    if (!error && data) {
      pushRows(data as unknown as CustomerDupRow[], "source_order_no");
    }
  }

  const phoneMatches = await findPhoneDuplicates({
    phone: input.phone,
    excludeId: input.excludeId,
  });
  for (const match of phoneMatches) {
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    results.push(match);
  }

  const name = (input.name ?? "").trim();
  const addrKey = normalizeAddress(input.address);
  if (name && addrKey) {
    const { data, error } = await supabase
      .from("customers")
      .select(DUP_SELECT)
      .eq("company_id", companyId)
      .eq("name", name)
      .is("deleted_at", null)
      .limit(20);
    if (!error && data) {
      const matched = (data as unknown as CustomerDupRow[]).filter(
        (row) => normalizeAddress(row.address) === addrKey,
      );
      pushRows(matched, "name_address");
    }
  }

  return results;
}
