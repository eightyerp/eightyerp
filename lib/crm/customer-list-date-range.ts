import { buildKstDateTimeBounds, getKstToday, shiftDate } from "@/lib/date-range";
import { requireCustomerAccess } from "@/lib/crm/customer-access";
import { getContactBucket } from "@/lib/crm/contact";
import { CUSTOMER_PAGE_SIZE } from "@/lib/crm/constants";
import {
  buildCustomerSearchFilter,
  CUSTOMER_LIST_SELECT,
  normalizeCustomerSearchTerm,
} from "@/lib/crm/customer-list-query";
import { getCustomers } from "@/lib/crm/customers";
import { createClient } from "@/lib/supabase-server";
import type {
  CustomerListFilters,
  CustomerListResult,
  CustomerWithRelations,
} from "@/types/database";

const STALE_CHECKLIST_DAYS = 7;

function endOfWeekDate(today: string): string {
  const [year, month, day] = today.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const weekday = utc.getUTCDay();
  const offset = weekday === 0 ? 0 : 7 - weekday;
  return shiftDate(today, offset);
}

function enrichCustomer(customer: CustomerWithRelations): CustomerWithRelations {
  const checklists = customer.customer_checklists ?? [];
  const activities = customer.customer_activities ?? [];
  const checklistTotal = checklists.length;
  const checklistCompleted = checklists.filter((item) => item.is_completed).length;
  const checklistRate =
    checklistTotal === 0 ? 0 : Math.round((checklistCompleted / checklistTotal) * 100);

  const lastActivityAt =
    customer.last_contact_at ??
    activities
      .map((activity) => activity.created_at)
      .sort()
      .at(-1) ??
    null;
  const contactBucket = getContactBucket(customer.next_contact_at);
  const attentionReasons: string[] = [];

  if (customer.status === "미연락" || customer.status === "연락두절") {
    attentionReasons.push(customer.status);
  }
  if (contactBucket === "overdue") attentionReasons.push("다음 연락일 경과");

  const incomplete = checklists.filter((item) => !item.is_completed);
  if (incomplete.length > 0) {
    const staleCutoff = Date.now() - STALE_CHECKLIST_DAYS * 24 * 60 * 60 * 1000;
    if (new Date(customer.created_at).getTime() < staleCutoff && checklistRate < 50) {
      attentionReasons.push("체크리스트 장기 미완료");
    }
  }

  return {
    ...customer,
    checklist_completed: checklistCompleted,
    checklist_total: checklistTotal,
    checklist_rate: checklistRate,
    last_activity_at: lastActivityAt,
    contact_bucket: contactBucket,
    needs_attention: attentionReasons.length > 0,
    attention_reasons: attentionReasons,
  };
}

/**
 * 기간이 없으면 기존 getCustomers를 그대로 사용한다.
 * 기간이 있을 때만 KST 자정 경계를 UTC timestamptz로 변환해 서버에서 먼저 필터한다.
 */
export async function getCustomersWithDateRange(
  filters: CustomerListFilters = {},
): Promise<CustomerListResult> {
  const bounds = buildKstDateTimeBounds(filters.dateFrom, filters.dateTo);
  if (bounds.error) throw new Error(bounds.error);
  if (!bounds.fromInclusiveUtc && !bounds.toExclusiveUtc) return getCustomers(filters);

  const access = await requireCustomerAccess();
  const supabase = await createClient();
  const pageSize = Math.max(1, Math.min(filters.pageSize ?? CUSTOMER_PAGE_SIZE, 100));
  const page = Math.max(1, filters.page ?? 1);
  const fromRow = (page - 1) * pageSize;
  const toRow = fromRow + pageSize - 1;
  const searchTerm = filters.q ? normalizeCustomerSearchTerm(filters.q) : "";
  let projectCustomerIds: string[] = [];

  if (searchTerm) {
    const { data: projectMatches, error: projectSearchError } = await supabase
      .from("projects")
      .select("customer_id")
      .ilike("name", `%${searchTerm}%`)
      .is("deleted_at", null);
    if (projectSearchError) throw new Error(projectSearchError.message);
    projectCustomerIds = (projectMatches ?? []).map((project) => project.customer_id);
  }

  let query = supabase
    .from("customers")
    .select(CUSTOMER_LIST_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "customer_activities", ascending: false })
    .limit(1, { referencedTable: "customer_activities" });

  if (filters.deletedOnly) {
    if (!access.isAdmin) {
      return { customers: [], total: 0, page, pageSize, totalPages: 1 };
    }
    query = query.not("deleted_at", "is", null);
  } else {
    query = query.is("deleted_at", null);
  }

  if (!access.canViewAllCompanyCustomers) {
    if (!access.employeeId) {
      return { customers: [], total: 0, page, pageSize, totalPages: 1 };
    }
    query = query.eq("assigned_employee_id", access.employeeId);
  } else if (filters.employeeId) {
    query = query.eq("assigned_employee_id", filters.employeeId);
  }

  if (searchTerm) query = query.or(buildCustomerSearchFilter(searchTerm, projectCustomerIds));
  if (filters.leadSourceId) query = query.eq("lead_source_id", filters.leadSourceId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.interestItem) query = query.contains("interest_items", [filters.interestItem]);
  if (bounds.fromInclusiveUtc) query = query.gte("created_at", bounds.fromInclusiveUtc);
  if (bounds.toExclusiveUtc) query = query.lt("created_at", bounds.toExclusiveUtc);

  if (filters.contact) {
    const today = getKstToday();
    const soonEnd = shiftDate(today, 3);
    const weekEnd = endOfWeekDate(today);
    if (filters.contact === "today") query = query.eq("next_contact_at", today);
    else if (filters.contact === "overdue") query = query.lt("next_contact_at", today);
    else if (filters.contact === "soon") {
      query = query.gt("next_contact_at", today).lte("next_contact_at", soonEnd);
    } else if (filters.contact === "this_week") {
      query = query.gte("next_contact_at", today).lte("next_contact_at", weekEnd);
    }
  }

  const { data, error, count } = await query.range(fromRow, toRow);
  if (error) throw new Error(error.message);

  const customers = ((data ?? []) as unknown as CustomerWithRelations[]).map(enrichCustomer);
  const total = count ?? customers.length;
  return {
    customers,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
