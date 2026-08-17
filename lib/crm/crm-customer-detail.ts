import {
  canAccessCustomerRecord,
  requireCustomerAccess,
} from "@/lib/crm/customer-access";
import { createClient } from "@/lib/supabase-server";

const OPEN_SCHEDULE_STATUSES = ["예정", "진행중", "연기", "미처리"] as const;

export type CrmCustomerDetail = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  consultation_type: string | null;
  status: string;
  assigned_employee_id: string | null;
  next_contact_at: string | null;
  created_at: string;
  deleted_at: string | null;
  employees: { id: string; name: string; title: string | null } | null;
  lead_sources: { id: string; name: string } | null;
};

export type CrmCustomerUpcomingSchedule = {
  id: string;
  schedule_type: string;
  title: string;
  start_at: string;
  status: string;
};

export type CrmCustomerRecentConsult = {
  id: string;
  consult_type: string;
  consult_content: string;
  next_contact_date: string | null;
  created_at: string;
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * CRM 고객 상세의 첫 렌더 전용 경량 조회.
 * ERP 공용 getCustomerById(*) + checklist embed를 사용하지 않는다.
 */
export async function getCrmCustomerDetail(
  customerId: string,
): Promise<CrmCustomerDetail | null> {
  const access = await requireCustomerAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select(
      `
      id, name, phone, address, consultation_type, status,
      assigned_employee_id, next_contact_at, created_at, deleted_at,
      employees ( id, name, title ),
      lead_sources ( id, name )
      `,
    )
    .eq("id", customerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const customer: CrmCustomerDetail = {
    id: data.id,
    name: data.name,
    phone: data.phone,
    address: data.address,
    consultation_type: data.consultation_type,
    status: data.status,
    assigned_employee_id: data.assigned_employee_id,
    next_contact_at: data.next_contact_at,
    created_at: data.created_at,
    deleted_at: data.deleted_at,
    employees: relationOne(data.employees),
    lead_sources: relationOne(data.lead_sources),
  };

  if (!canAccessCustomerRecord(access, customer)) return null;
  return customer;
}

/** 고객 상세에는 실제로 필요한 열린 일정 최대 3건만 읽는다. */
export async function listCrmCustomerUpcomingSchedules(
  customerId: string,
  limit = 3,
): Promise<CrmCustomerUpcomingSchedule[]> {
  const supabase = await createClient();
  const safeLimit = Math.max(1, Math.min(limit, 10));
  const { data, error } = await supabase
    .from("customer_schedules")
    .select("id, schedule_type, title, start_at, status")
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .in("status", [...OPEN_SCHEDULE_STATUSES])
    .order("start_at", { ascending: true })
    .limit(safeLimit);

  if (error) throw new Error("예정 일정을 불러오지 못했습니다.");
  return (data ?? []) as CrmCustomerUpcomingSchedule[];
}

/** 고객 상세에는 최근 상담기록 최대 8건만 읽는다. */
export async function listCrmCustomerRecentConsults(
  customerId: string,
  limit = 8,
): Promise<CrmCustomerRecentConsult[]> {
  const supabase = await createClient();
  const safeLimit = Math.max(1, Math.min(limit, 20));
  const { data, error } = await supabase
    .from("customer_consult_logs")
    .select("id, consult_type, consult_content, next_contact_date, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw new Error("최근 상담기록을 불러오지 못했습니다.");
  return (data ?? []) as CrmCustomerRecentConsult[];
}
