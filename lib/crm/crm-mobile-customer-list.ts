import { getContactBucket } from "@/lib/crm/contact";
import { requireCustomerAccess } from "@/lib/crm/customer-access";
import {
  buildCustomerSearchFilter,
  normalizeCustomerSearchTerm,
} from "@/lib/crm/customer-list-query";
import { createClient } from "@/lib/supabase-server";
import type { ContactBucket, CustomerStatus } from "@/types/database";

export type CrmMobileCustomerListItem = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  consultation_type: string | null;
  status: string;
  assigned_employee_id: string | null;
  next_contact_at: string | null;
  contact_bucket: ContactBucket;
  created_at: string;
  employees: { id?: string; name: string; title?: string | null } | null;
  lead_sources: { id?: string; name: string } | null;
};

export type CrmMobileCustomerListFilters = {
  q?: string;
  status?: CustomerStatus | "";
  contact?: "" | "today" | "overdue";
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export type CrmMobileCustomerListResult = {
  customers: CrmMobileCustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function koreaDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export async function listCrmMobileCustomers(
  filters: CrmMobileCustomerListFilters = {},
): Promise<CrmMobileCustomerListResult> {
  const access = await requireCustomerAccess();
  const supabase = await createClient();
  const pageSize = Math.max(1, Math.min(filters.pageSize ?? 30, 50));
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const searchTerm = filters.q ? normalizeCustomerSearchTerm(filters.q) : "";

  let projectCustomerIds: string[] = [];
  if (searchTerm) {
    const { data: projectMatches, error: projectSearchError } = await supabase
      .from("projects")
      .select("customer_id")
      .ilike("name", `%${searchTerm}%`)
      .is("deleted_at", null)
      .limit(100);
    if (projectSearchError) throw new Error(projectSearchError.message);
    projectCustomerIds = (projectMatches ?? []).map((project) => project.customer_id);
  }

  let query = supabase
    .from("customers")
    .select(
      `
      id, name, phone, address, consultation_type, status,
      assigned_employee_id, next_contact_at, created_at,
      employees ( id, name, title ),
      lead_sources ( id, name )
      `,
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  if (!access.canViewAllCompanyCustomers) {
    if (!access.employeeId) {
      return { customers: [], total: 0, page, pageSize, totalPages: 1 };
    }
    query = query.eq("assigned_employee_id", access.employeeId);
  }

  if (searchTerm) {
    query = query.or(buildCustomerSearchFilter(searchTerm, projectCustomerIds));
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  // created_at은 timestamptz이고 운영 DB timezone은 UTC다.
  // 직원이 입력한 날짜는 한국 업무일 기준이므로 +09:00 경계를 명시한다.
  if (filters.dateFrom) {
    query = query.gte("created_at", `${filters.dateFrom}T00:00:00+09:00`);
  }
  if (filters.dateTo) {
    query = query.lte("created_at", `${filters.dateTo}T23:59:59.999+09:00`);
  }

  if (filters.contact) {
    const today = koreaDateString();
    if (filters.contact === "today") {
      query = query.eq("next_contact_at", today);
    } else if (filters.contact === "overdue") {
      query = query.lt("next_contact_at", today);
    }
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw new Error(error.message);

  const customers: CrmMobileCustomerListItem[] = (data ?? []).map((row) => {
    const employee = relationOne(row.employees);
    const leadSource = relationOne(row.lead_sources);
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      address: row.address,
      consultation_type: row.consultation_type,
      status: row.status,
      assigned_employee_id: row.assigned_employee_id,
      next_contact_at: row.next_contact_at,
      contact_bucket: getContactBucket(row.next_contact_at),
      created_at: row.created_at,
      employees: employee,
      lead_sources: leadSource,
    };
  });

  const total = count ?? customers.length;
  return {
    customers,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
