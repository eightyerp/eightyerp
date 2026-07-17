import { createClient } from "@/lib/supabase-server";
import { getCurrentUserAccess, requireAdminAccess } from "@/lib/crm/access";
import { getContactBucket } from "@/lib/crm/contact";
import { normalizePhone } from "@/lib/crm/parse-inquiry";
import { CUSTOMER_PAGE_SIZE } from "@/lib/crm/constants";
import type {
  ActivityType,
  ContactScheduleItem,
  ConsultType,
  Customer,
  CustomerActivity,
  CustomerChecklist,
  CustomerConsultLog,
  CustomerInsert,
  CustomerListFilters,
  CustomerListResult,
  CustomerStatus,
  CustomerWithRelations,
  DashboardCrmStats,
  Employee,
  InquiryMessage,
  InquirySourceType,
  LeadSource,
  ParsedInquiryData,
} from "@/types/database";

const STALE_CHECKLIST_DAYS = 7;

function localDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function endOfWeekDate(base: Date): Date {
  // Monday-start week → Sunday end
  const day = base.getDay();
  const offset = day === 0 ? 0 : 7 - day;
  return addDays(base, offset);
}

/** Live customers 테이블에 존재하는 컬럼만 write payload에 포함 */
function toCustomerWritePayload(input: CustomerInsert, phone: string) {
  return {
    name: input.name.trim(),
    phone,
    address: input.address ?? null,
    consultation_type: input.consultation_type ?? "기타",
    status: input.status ?? "신규",
    lead_source_id: input.lead_source_id ?? null,
    assigned_employee_id: input.assigned_employee_id ?? null,
    consultation_notes: input.consultation_notes ?? null,
    next_contact_at: input.next_contact_at || null,
    interest_items: input.interest_items ?? [],
    desired_timing: input.desired_timing ?? null,
    special_notes: input.special_notes ?? null,
    event_memo: input.event_memo ?? null,
    inquiry_raw_text: input.inquiry_raw_text ?? null,
    happy_call_required: Boolean(input.happy_call_required),
    happy_call_result: input.happy_call_result ?? null,
  };
}

function enrichCustomer(customer: CustomerWithRelations): CustomerWithRelations {
  const checklists = customer.customer_checklists ?? [];
  const activities = customer.customer_activities ?? [];
  const checklist_total = checklists.length;
  const checklist_completed = checklists.filter((c) => c.is_completed).length;
  const checklist_rate =
    checklist_total === 0
      ? 0
      : Math.round((checklist_completed / checklist_total) * 100);

  const last_activity_at =
    customer.last_contact_at ??
    activities
      .map((a) => a.created_at)
      .sort()
      .at(-1) ??
    null;

  const contact_bucket = getContactBucket(customer.next_contact_at);

  const attention_reasons: string[] = [];
  if (customer.status === "미연락" || customer.status === "연락두절") {
    attention_reasons.push(customer.status);
  }

  if (contact_bucket === "overdue") {
    attention_reasons.push("다음 연락일 경과");
  }

  const incomplete = checklists.filter((c) => !c.is_completed);
  if (incomplete.length > 0) {
    const staleCutoff = Date.now() - STALE_CHECKLIST_DAYS * 24 * 60 * 60 * 1000;
    const created = new Date(customer.created_at).getTime();
    if (created < staleCutoff && checklist_rate < 50) {
      attention_reasons.push("체크리스트 장기 미완료");
    }
  }

  return {
    ...customer,
    checklist_completed,
    checklist_total,
    checklist_rate,
    last_activity_at,
    contact_bucket,
    needs_attention: attention_reasons.length > 0,
    attention_reasons,
  };
}

export async function writeAuditLog(input: {
  entity_type: string;
  entity_id?: string | null;
  action: string;
  payload?: Record<string, unknown>;
}) {
  try {
    const access = await getCurrentUserAccess();
    if (!access.userId) return;

    const supabase = await createClient();
    await supabase.from("audit_logs").insert({
      entity_type: input.entity_type,
      entity_id: input.entity_id ?? null,
      action: input.action,
      actor_id: access.userId,
      payload: input.payload ?? {},
    });
  } catch {
    // audit logging should not block primary CRM actions
  }
}

export async function getLeadSources(): Promise<LeadSource[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_sources")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as LeadSource[];
}

export async function getEmployees(): Promise<Employee[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Employee[];
}

export async function getCustomers(
  filters: CustomerListFilters = {},
): Promise<CustomerListResult> {
  const supabase = await createClient();
  const pageSize = Math.max(1, Math.min(filters.pageSize ?? CUSTOMER_PAGE_SIZE, 100));
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("customers")
    .select(
      `
      *,
      lead_sources ( id, name ),
      employees ( id, name, title ),
      customer_checklists ( id, is_completed ),
      customer_activities ( id, created_at )
    `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (filters.deletedOnly) {
    query = query.not("deleted_at", "is", null);
  } else {
    query = query.is("deleted_at", null);
  }

  if (filters.q?.trim()) {
    const q = filters.q.trim().replace(/[%_,]/g, "");
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,address.ilike.%${q}%`);
  }
  if (filters.employeeId) {
    query = query.eq("assigned_employee_id", filters.employeeId);
  }
  if (filters.leadSourceId) {
    query = query.eq("lead_source_id", filters.leadSourceId);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.interestItem) {
    query = query.contains("interest_items", [filters.interestItem]);
  }
  if (filters.dateFrom) {
    query = query.gte("created_at", `${filters.dateFrom}T00:00:00`);
  }
  if (filters.dateTo) {
    query = query.lte("created_at", `${filters.dateTo}T23:59:59.999`);
  }

  if (filters.contact) {
    const today = localDateString();
    const soonEnd = localDateString(addDays(new Date(), 3));
    const weekEnd = localDateString(endOfWeekDate(new Date()));

    if (filters.contact === "today") {
      query = query.eq("next_contact_at", today);
    } else if (filters.contact === "overdue") {
      query = query.lt("next_contact_at", today);
    } else if (filters.contact === "soon") {
      query = query
        .gt("next_contact_at", today)
        .lte("next_contact_at", soonEnd);
    } else if (filters.contact === "this_week") {
      query = query
        .gte("next_contact_at", today)
        .lte("next_contact_at", weekEnd);
    }
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw new Error(error.message);

  const customers = ((data ?? []) as CustomerWithRelations[]).map(enrichCustomer);
  const total = count ?? customers.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return { customers, total, page, pageSize, totalPages };
}

export async function getCustomerById(
  id: string,
): Promise<CustomerWithRelations | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select(
      `
      *,
      lead_sources ( id, name ),
      employees ( id, name, title ),
      customer_checklists ( id, is_completed )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return enrichCustomer(data as CustomerWithRelations);
}

export async function getCustomerChecklists(
  customerId: string,
): Promise<CustomerChecklist[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_checklists")
    .select("*")
    .eq("customer_id", customerId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerChecklist[];
}

export async function getCustomerActivities(
  customerId: string,
): Promise<CustomerActivity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_activities")
    .select("*, employees ( id, name, title )")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerActivity[];
}

export async function getCustomerConsultLogs(
  customerId: string,
): Promise<CustomerConsultLog[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_consult_logs")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerConsultLog[];
}

export async function createCustomerConsultLog(input: {
  customer_id: string;
  consult_type: ConsultType;
  consult_content: string;
  next_contact_date?: string | null;
}): Promise<CustomerConsultLog> {
  const access = await getCurrentUserAccess();
  const supabase = await createClient();

  const content = input.consult_content.trim();
  if (!content) throw new Error("상담내용을 입력해 주세요.");

  const { data, error } = await supabase
    .from("customer_consult_logs")
    .insert({
      customer_id: input.customer_id,
      consult_type: input.consult_type,
      consult_content: content,
      next_contact_date: input.next_contact_date || null,
      created_by: access.userId,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  if (input.next_contact_date) {
    const { error: nextError } = await supabase
      .from("customers")
      .update({ next_contact_at: input.next_contact_date })
      .eq("id", input.customer_id)
      .is("deleted_at", null);
    if (nextError) throw new Error(nextError.message);
  }

  // optional column — ignore if schema not yet migrated
  await supabase
    .from("customers")
    .update({ last_contact_at: new Date().toISOString() })
    .eq("id", input.customer_id)
    .is("deleted_at", null);

  await writeAuditLog({
    entity_type: "customer_consult_log",
    entity_id: data.id,
    action: "create",
    payload: {
      customer_id: input.customer_id,
      consult_type: input.consult_type,
    },
  });

  return data as CustomerConsultLog;
}

export async function findCustomerByPhone(
  phone: string,
  excludeId?: string,
) {
  const supabase = await createClient();
  const normalized = normalizePhone(phone);
  let query = supabase
    .from("customers")
    .select("id, name, phone")
    .eq("phone", normalized)
    .is("deleted_at", null);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createCustomer(input: CustomerInsert) {
  const supabase = await createClient();
  const phone = normalizePhone(input.phone);

  if (!phone) throw new Error("연락처를 입력해 주세요.");

  const existing = await findCustomerByPhone(phone);
  if (existing) {
    throw new Error(
      `이미 등록된 연락처입니다. (${existing.name} / ${existing.phone})`,
    );
  }

  const { data, error } = await supabase
    .from("customers")
    .insert(toCustomerWritePayload(input, phone))
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("이미 등록된 연락처입니다.");
    throw new Error(error.message);
  }

  const customer = data as Customer;
  await writeAuditLog({
    entity_type: "customer",
    entity_id: customer.id,
    action: "create",
    payload: { name: customer.name, phone: customer.phone },
  });

  return customer;
}

export async function updateCustomer(id: string, input: CustomerInsert) {
  const supabase = await createClient();
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error("연락처를 입력해 주세요.");

  const existing = await findCustomerByPhone(phone, id);
  if (existing) {
    throw new Error(
      `이미 등록된 연락처입니다. (${existing.name} / ${existing.phone})`,
    );
  }

  const previous = await getCustomerById(id);
  if (!previous || previous.deleted_at) {
    throw new Error("고객을 찾을 수 없습니다.");
  }

  const { data, error } = await supabase
    .from("customers")
    .update(toCustomerWritePayload(input, phone))
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("이미 등록된 연락처입니다.");
    throw new Error(error.message);
  }

  const customer = data as Customer;
  const access = await getCurrentUserAccess();

  if (previous.status !== customer.status) {
    await supabase.from("customer_activities").insert({
      customer_id: id,
      activity_type: "상태변경" satisfies ActivityType,
      content: `상담상태 변경: ${previous.status} → ${customer.status}`,
      previous_status: previous.status,
      new_status: customer.status,
      employee_id: access.profile?.employee_id ?? null,
      created_by: access.userId,
    });
  }

  if (previous.assigned_employee_id !== customer.assigned_employee_id) {
    await supabase.from("customer_activities").insert({
      customer_id: id,
      activity_type: "담당자변경" satisfies ActivityType,
      content: "담당자가 변경되었습니다.",
      previous_assignee_id: previous.assigned_employee_id,
      new_assignee_id: customer.assigned_employee_id,
      employee_id: access.profile?.employee_id ?? null,
      created_by: access.userId,
    });
  }

  await writeAuditLog({
    entity_type: "customer",
    entity_id: id,
    action: "update",
    payload: {
      previous_status: previous.status,
      new_status: customer.status,
    },
  });

  return customer;
}

export async function registerConsultation(input: {
  customer_id: string;
  activity_type: ActivityType | string;
  content: string;
  result?: string | null;
  next_contact_at?: string | null;
  status?: CustomerStatus | null;
  employee_id?: string | null;
}) {
  const access = await getCurrentUserAccess();
  const supabase = await createClient();
  const previous = await getCustomerById(input.customer_id);

  if (!previous || previous.deleted_at) {
    throw new Error("고객을 찾을 수 없습니다.");
  }

  const nowIso = new Date().toISOString();
  const nextStatus = input.status || previous.status;
  const nextAssignee =
    input.employee_id !== undefined && input.employee_id !== null
      ? input.employee_id
      : previous.assigned_employee_id;

  const customerPatch: Record<string, unknown> = {};

  // last_contact_at / consultation_result 는 migration 적용 시에만 존재
  if ("last_contact_at" in previous) {
    customerPatch.last_contact_at = nowIso;
  }
  if (input.next_contact_at !== undefined) {
    customerPatch.next_contact_at = input.next_contact_at || null;
  }
  if (input.status && input.status !== previous.status) {
    customerPatch.status = input.status;
  }
  if (
    input.employee_id !== undefined &&
    input.employee_id !== previous.assigned_employee_id
  ) {
    customerPatch.assigned_employee_id = input.employee_id || null;
  }
  if (input.result && "consultation_result" in previous) {
    customerPatch.consultation_result = input.result;
  }

  if (Object.keys(customerPatch).length > 0) {
    const { error: updateError } = await supabase
      .from("customers")
      .update(customerPatch)
      .eq("id", input.customer_id)
      .is("deleted_at", null);

    if (updateError) throw new Error(updateError.message);
  }

  const { data: activity, error: activityError } = await supabase
    .from("customer_activities")
    .insert({
      customer_id: input.customer_id,
      activity_type: input.activity_type,
      content: input.content,
      result: input.result ?? null,
      next_contact_at: input.next_contact_at ?? null,
      previous_status: previous.status,
      new_status: nextStatus,
      previous_assignee_id: previous.assigned_employee_id,
      new_assignee_id: nextAssignee,
      employee_id:
        input.employee_id || access.profile?.employee_id || null,
      created_by: access.userId,
    })
    .select("*")
    .single();

  if (activityError) throw new Error(activityError.message);

  if (previous.status !== nextStatus) {
    await supabase.from("customer_activities").insert({
      customer_id: input.customer_id,
      activity_type: "상태변경",
      content: `상담상태 변경: ${previous.status} → ${nextStatus}`,
      previous_status: previous.status,
      new_status: nextStatus,
      employee_id: access.profile?.employee_id ?? null,
      created_by: access.userId,
    });
  }

  if (previous.assigned_employee_id !== nextAssignee) {
    await supabase.from("customer_activities").insert({
      customer_id: input.customer_id,
      activity_type: "담당자변경",
      content: "담당자가 변경되었습니다.",
      previous_assignee_id: previous.assigned_employee_id,
      new_assignee_id: nextAssignee,
      employee_id: access.profile?.employee_id ?? null,
      created_by: access.userId,
    });
  }

  await writeAuditLog({
    entity_type: "customer",
    entity_id: input.customer_id,
    action: "consultation",
    payload: {
      activity_type: input.activity_type,
      status: nextStatus,
    },
  });

  return activity as CustomerActivity;
}

export async function logQuickChannelActivity(input: {
  customer_id: string;
  activity_type: "전화" | "문자" | "카카오톡";
  content?: string;
}) {
  return registerConsultation({
    customer_id: input.customer_id,
    activity_type: input.activity_type,
    content:
      input.content ||
      `${input.activity_type} 연결을 시도했습니다. (외부 연동 준비됨)`,
  });
}

export async function updateCustomerQuickFields(input: {
  customer_id: string;
  status?: CustomerStatus | null;
  assigned_employee_id?: string | null | undefined;
  next_contact_at?: string | null;
  change_assignee?: boolean;
}) {
  const access = await getCurrentUserAccess();
  const supabase = await createClient();
  const previous = await getCustomerById(input.customer_id);

  if (!previous || previous.deleted_at) {
    throw new Error("고객을 찾을 수 없습니다.");
  }

  const patch: Record<string, unknown> = {};
  if (input.status && input.status !== previous.status) {
    patch.status = input.status;
  }
  if (input.change_assignee) {
    const nextAssignee = input.assigned_employee_id || null;
    if (nextAssignee !== previous.assigned_employee_id) {
      patch.assigned_employee_id = nextAssignee;
    }
  }
  if (input.next_contact_at !== undefined) {
    patch.next_contact_at = input.next_contact_at;
  }

  if (Object.keys(patch).length === 0) {
    return previous;
  }

  const { data, error } = await supabase
    .from("customers")
    .update(patch)
    .eq("id", input.customer_id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  const customer = data as Customer;

  if (previous.status !== customer.status) {
    await supabase.from("customer_activities").insert({
      customer_id: input.customer_id,
      activity_type: "상태변경",
      content: `상담상태 변경: ${previous.status} → ${customer.status}`,
      previous_status: previous.status,
      new_status: customer.status,
      employee_id: access.profile?.employee_id ?? null,
      created_by: access.userId,
    });
  }

  if (previous.assigned_employee_id !== customer.assigned_employee_id) {
    await supabase.from("customer_activities").insert({
      customer_id: input.customer_id,
      activity_type: "담당자변경",
      content: "담당자가 변경되었습니다.",
      previous_assignee_id: previous.assigned_employee_id,
      new_assignee_id: customer.assigned_employee_id,
      employee_id: access.profile?.employee_id ?? null,
      created_by: access.userId,
    });
  }

  if (
    input.next_contact_at !== undefined &&
    input.next_contact_at !== previous.next_contact_at
  ) {
    await supabase.from("customer_activities").insert({
      customer_id: input.customer_id,
      activity_type: "메모",
      content: input.next_contact_at
        ? `다음 연락일을 ${input.next_contact_at}로 지정했습니다.`
        : "다음 연락일을 해제했습니다.",
      next_contact_at: input.next_contact_at,
      employee_id: access.profile?.employee_id ?? null,
      created_by: access.userId,
    });
  }

  return customer;
}

export async function logPlaceholderAction(input: {
  customer_id: string;
  action_label: string;
}) {
  return registerConsultation({
    customer_id: input.customer_id,
    activity_type: "메모",
    content: `${input.action_label} 기능을 준비 중입니다. (향후 모듈 연동)`,
  });
}

export async function softDeleteCustomer(input: {
  id: string;
  reason?: string;
}) {
  await requireAdminAccess();
  const access = await getCurrentUserAccess();
  const supabase = await createClient();

  const customer = await getCustomerById(input.id);
  if (!customer || customer.deleted_at) {
    throw new Error("삭제할 고객을 찾을 수 없습니다.");
  }

  const { error } = await supabase
    .from("customers")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: access.userId,
      delete_reason: input.reason?.trim() || null,
    })
    .eq("id", input.id)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  await writeAuditLog({
    entity_type: "customer",
    entity_id: input.id,
    action: "soft_delete",
    payload: {
      name: customer.name,
      phone: customer.phone,
      reason: input.reason ?? null,
    },
  });
}

export async function restoreCustomer(id: string) {
  await requireAdminAccess();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")
    .update({
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
    })
    .eq("id", id)
    .not("deleted_at", "is", null)
    .select("id, name, phone")
    .single();

  if (error) throw new Error(error.message);

  await writeAuditLog({
    entity_type: "customer",
    entity_id: id,
    action: "restore",
    payload: { name: data.name, phone: data.phone },
  });
}

export async function permanentlyDeleteCustomer(id: string) {
  await requireAdminAccess();
  const supabase = await createClient();

  const { data: existing, error: findError } = await supabase
    .from("customers")
    .select("id, name, phone, deleted_at")
    .eq("id", id)
    .maybeSingle();

  if (findError) throw new Error(findError.message);
  if (!existing?.deleted_at) {
    throw new Error("영구삭제는 삭제 고객함의 고객만 가능합니다.");
  }

  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    entity_type: "customer",
    entity_id: id,
    action: "permanent_delete",
    payload: { name: existing.name, phone: existing.phone },
  });
}

/** @deprecated use softDeleteCustomer */
export async function deleteCustomer(id: string) {
  await softDeleteCustomer({ id });
}

export async function updateChecklistItem(input: {
  id: string;
  is_completed: boolean;
  note?: string | null;
}) {
  const access = await getCurrentUserAccess();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customer_checklists")
    .update({
      is_completed: input.is_completed,
      completed_at: input.is_completed ? new Date().toISOString() : null,
      completed_by: input.is_completed ? access.userId : null,
      note: input.note ?? null,
    })
    .eq("id", input.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as CustomerChecklist;
}

export async function createCustomerActivity(input: {
  customer_id: string;
  activity_type: ActivityType | string;
  content: string;
}) {
  const access = await getCurrentUserAccess();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customer_activities")
    .insert({
      customer_id: input.customer_id,
      activity_type: input.activity_type,
      content: input.content,
      employee_id: access.profile?.employee_id ?? null,
      created_by: access.userId,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as CustomerActivity;
}

export async function getDashboardCrmStats(): Promise<DashboardCrmStats> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, status, next_contact_at, assigned_employee_id, employees ( id, name, title )")
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    status: string;
    next_contact_at: string | null;
    assigned_employee_id: string | null;
    employees:
      | { id: string; name: string; title: string }
      | { id: string; name: string; title: string }[]
      | null;
  }>;

  const byStatusMap = new Map<string, number>();
  const byAssigneeMap = new Map<string, { name: string; count: number }>();

  let newCount = 0;
  let noContactCount = 0;
  let consultingCount = 0;
  let quoteCount = 0;
  let contractedCount = 0;
  let overdueCount = 0;
  let todayContactCount = 0;
  let weekContactCount = 0;

  for (const row of rows) {
    byStatusMap.set(row.status, (byStatusMap.get(row.status) ?? 0) + 1);

    const employee = Array.isArray(row.employees)
      ? row.employees[0] ?? null
      : row.employees;
    const key = row.assigned_employee_id ?? "unassigned";
    const name = employee
      ? `${employee.name} ${employee.title}`
      : "미배정";
    const current = byAssigneeMap.get(key) ?? { name, count: 0 };
    current.count += 1;
    byAssigneeMap.set(key, current);

    if (row.status === "신규") newCount += 1;
    if (row.status === "미연락" || row.status === "연락두절") noContactCount += 1;
    if (row.status === "상담중" || row.status === "1차 연락완료") {
      consultingCount += 1;
    }
    if (row.status === "견적제출" || row.status === "견적작성중") quoteCount += 1;
    if (row.status === "계약완료" || row.status === "계약") contractedCount += 1;

    const bucket = getContactBucket(row.next_contact_at);
    if (bucket === "overdue") overdueCount += 1;
    if (bucket === "today") todayContactCount += 1;
    if (bucket === "today" || bucket === "soon" || bucket === "this_week") {
      weekContactCount += 1;
    }
  }

  return {
    newCount,
    noContactCount,
    consultingCount,
    quoteCount,
    contractedCount,
    overdueCount,
    todayContactCount,
    weekContactCount,
    byStatus: Array.from(byStatusMap.entries()).map(([status, count]) => ({
      status,
      count,
    })),
    byAssignee: Array.from(byAssigneeMap.entries()).map(([employeeId, v]) => ({
      employeeId: employeeId === "unassigned" ? null : employeeId,
      name: v.name,
      count: v.count,
    })),
  };
}

export async function getContactSchedule(
  bucket?: "today" | "overdue" | "this_week",
): Promise<ContactScheduleItem[]> {
  const { customers } = await getCustomers({
    contact: bucket || "",
    page: 1,
    pageSize: 100,
  });
  const items = customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    status: customer.status,
    assigned_employee_id: customer.assigned_employee_id,
    next_contact_at: customer.next_contact_at,
    last_contact_at: customer.last_contact_at ?? null,
    contact_bucket: customer.contact_bucket ?? getContactBucket(customer.next_contact_at),
  }));

  if (!bucket) return items;

  if (bucket === "this_week") {
    return items.filter((item) =>
      ["today", "soon", "this_week"].includes(item.contact_bucket),
    );
  }

  return items.filter((item) => item.contact_bucket === bucket);
}

export async function createInquiryMessage(input: {
  source_type: InquirySourceType;
  raw_text: string;
  parsed_data: ParsedInquiryData;
  customer_id?: string | null;
  status?: InquiryMessage["status"];
}) {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("inquiry_messages")
    .insert({
      source_type: input.source_type,
      raw_text: input.raw_text,
      parsed_data: input.parsed_data,
      customer_id: input.customer_id ?? null,
      status: input.status ?? "parsed",
      processed_at: input.customer_id ? now : null,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as InquiryMessage;
}

export async function registerCustomerFromInquiry(input: {
  raw_text: string;
  source_type: InquirySourceType;
  parsed: ParsedInquiryData;
  lead_source_id: string | null;
}) {
  const customer = await createCustomer({
    name: input.parsed.name?.trim() || "이름미상",
    phone: input.parsed.phone || "",
    address: input.parsed.address || null,
    consultation_type: input.parsed.consultation_type || "기타",
    status: input.parsed.status || "신규",
    lead_source_id: input.lead_source_id,
    assigned_employee_id: input.parsed.assigned_employee_id || null,
    consultation_notes: input.parsed.consultation_notes || null,
    next_contact_at: input.parsed.next_contact_at || null,
    interest_items: input.parsed.interest_items || [],
    desired_timing: input.parsed.desired_timing || null,
    special_notes: input.parsed.special_notes || null,
    event_memo: input.parsed.event_memo || null,
    inquiry_raw_text: input.raw_text,
    happy_call_required: Boolean(input.parsed.happy_call_required),
  });

  await createInquiryMessage({
    source_type: input.source_type,
    raw_text: input.raw_text,
    parsed_data: input.parsed,
    customer_id: customer.id,
    status: "registered",
  });

  return customer;
}

export async function resolveLeadSourceIdByName(
  name: string | undefined,
  sources: LeadSource[],
): Promise<string | null> {
  if (!name) return null;
  const found = sources.find((source) => source.name === name);
  return found?.id ?? sources.find((s) => s.name === "기타")?.id ?? null;
}
