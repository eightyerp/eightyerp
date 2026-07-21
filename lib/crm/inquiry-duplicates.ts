import { createClient } from "@/lib/supabase-server";
import {
  CUSTOMER_DUPLICATE_BLOCKED_MESSAGE,
  getCustomerAccess,
} from "@/lib/crm/customer-access";
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
  /** false면 상세·열기 링크 없음 (권한 밖) */
  accessible: boolean;
  reason: DuplicateMatchReason;
  id: string | null;
  name: string | null;
  phone: string | null;
  address: string | null;
  source_order_no: string | null;
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
  assigned_employee_id?: string | null;
  employees?:
    | Pick<Employee, "id" | "name" | "title">
    | Pick<Employee, "id" | "name" | "title">[]
    | null;
};

const DUP_SELECT =
  "id, name, phone, address, source_order_no, status, assigned_employee_id, employees ( id, name, title )";

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

function toAccessibleCandidate(
  row: CustomerDupRow,
  reason: DuplicateMatchReason,
): DuplicateCandidate {
  const assignee = resolveAssignee(row.employees);
  return {
    accessible: true,
    reason,
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    source_order_no: row.source_order_no ?? null,
    status: row.status ?? null,
    assignee_name: assignee
      ? formatEmployeeLabel(assignee.name, assignee.title)
      : null,
  };
}

function toBlockedCandidate(reason: DuplicateMatchReason): DuplicateCandidate {
  return {
    accessible: false,
    reason,
    id: null,
    name: null,
    phone: null,
    address: null,
    source_order_no: null,
    status: null,
    assignee_name: null,
  };
}

function parseRpcPhoneDuplicates(data: unknown): DuplicateCandidate[] | null {
  if (!Array.isArray(data)) return null;
  const out: DuplicateCandidate[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const accessible = row.accessible === true;
    if (!accessible) {
      out.push(toBlockedCandidate("phone"));
      continue;
    }
    out.push({
      accessible: true,
      reason: "phone",
      id: typeof row.id === "string" ? row.id : null,
      name: typeof row.name === "string" ? row.name : null,
      phone: typeof row.phone === "string" ? row.phone : null,
      address: typeof row.address === "string" ? row.address : null,
      source_order_no:
        typeof row.source_order_no === "string" ? row.source_order_no : null,
      status: typeof row.status === "string" ? row.status : null,
      assignee_name:
        typeof row.assignee_name === "string" ? row.assignee_name : null,
    });
  }
  return out;
}

async function getCurrentCompanyId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_company_id");
  if (error || data == null || data === "") return null;
  return String(data);
}

function isMissingRpcError(message: string | undefined): boolean {
  const text = (message ?? "").toLowerCase();
  return (
    text.includes("lookup_company_customer_phone_duplicates") ||
    text.includes("could not find the function") ||
    text.includes("schema cache")
  );
}

/**
 * 회사 범위 + 숫자만 비교 전화 중복 조회 (soft 경고용).
 * Bundle E: 권한 밖 고객은 accessible=false (개인정보 없음).
 */
export async function findPhoneDuplicates(input: {
  phone?: string | null;
  excludeId?: string;
}): Promise<DuplicateCandidate[]> {
  if (!isComparablePhone(input.phone ?? "")) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "lookup_company_customer_phone_duplicates",
    {
      p_phone: input.phone,
      p_exclude_id: input.excludeId ?? null,
    },
  );

  if (!error) {
    const parsed = parseRpcPhoneDuplicates(data);
    if (parsed) return parsed;
  } else if (!isMissingRpcError(error.message)) {
    return [];
  }

  // migration 미적용 환경: RLS 범위 내만 조회 (권한 밖 중복은 미탐지)
  return findPhoneDuplicatesLegacy(input);
}

async function findPhoneDuplicatesLegacy(input: {
  phone?: string | null;
  excludeId?: string;
}): Promise<DuplicateCandidate[]> {
  const companyId = await getCurrentCompanyId();
  if (!companyId) return [];

  const digits = phoneDigits(input.phone ?? "");
  const normalized = normalizePhone(input.phone ?? "");
  const supabase = await createClient();
  const access = await getCustomerAccess();

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
    const allowed =
      access.canViewAllCompanyCustomers ||
      (access.employeeId != null &&
        row.assigned_employee_id === access.employeeId);
    results.push(
      allowed
        ? toAccessibleCandidate(row, "phone")
        : toBlockedCandidate("phone"),
    );
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

  const access = await getCustomerAccess();
  const supabase = await createClient();
  const results: DuplicateCandidate[] = [];
  const seenAccessible = new Set<string>();
  let blockedPhoneAdded = false;

  const pushAccessible = (
    rows: CustomerDupRow[],
    reason: DuplicateMatchReason,
  ) => {
    for (const row of rows) {
      if (input.excludeId && row.id === input.excludeId) continue;
      const allowed =
        access.canViewAllCompanyCustomers ||
        (access.employeeId != null &&
          row.assigned_employee_id === access.employeeId);
      if (!allowed) {
        if (reason === "phone" && !blockedPhoneAdded) {
          results.push(toBlockedCandidate(reason));
          blockedPhoneAdded = true;
        } else if (reason !== "phone") {
          results.push(toBlockedCandidate(reason));
        }
        continue;
      }
      if (seenAccessible.has(row.id)) continue;
      seenAccessible.add(row.id);
      results.push(toAccessibleCandidate(row, reason));
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
      pushAccessible(data as unknown as CustomerDupRow[], "source_order_no");
    }
  }

  const phoneMatches = await findPhoneDuplicates({
    phone: input.phone,
    excludeId: input.excludeId,
  });
  for (const match of phoneMatches) {
    if (!match.accessible) {
      if (!blockedPhoneAdded) {
        results.push(match);
        blockedPhoneAdded = true;
      }
      continue;
    }
    if (!match.id || seenAccessible.has(match.id)) continue;
    seenAccessible.add(match.id);
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
      pushAccessible(matched, "name_address");
    }
  }

  return results;
}

export function hasBlockingDuplicate(duplicates: DuplicateCandidate[]): boolean {
  return duplicates.length > 0;
}

export function duplicateUserMessage(
  duplicates: DuplicateCandidate[],
): string {
  if (duplicates.some((d) => !d.accessible)) {
    return CUSTOMER_DUPLICATE_BLOCKED_MESSAGE;
  }
  return "같은 연락처의 고객이 이미 있습니다. 기존 고객을 확인하거나 열어 주세요.";
}
