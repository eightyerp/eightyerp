import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CustomerSchedulesWorkspace from "@/components/schedules/CustomerSchedulesWorkspace";
import { listCustomerSchedules } from "@/lib/crm/customer-schedules";
import { getCustomers } from "@/lib/crm/customers";
import { isMissingRelationError } from "@/lib/crm/errors";
import {
  getScheduleAccess,
  listEmployeesInScope,
  listTeams,
} from "@/lib/crm/schedule-access";
import { createClient } from "@/lib/supabase-server";
import type { CustomerSchedule, Employee, Team } from "@/types/database";

const MIGRATION_HINT =
  "supabase/migrations/20260725000001_customer_and_process_schedules.sql 과 20260728000001_customer_schedules_v2.sql 을 Supabase SQL Editor에서 순서대로 실행해 주세요.";

async function isScheduleSchemaMissing(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("customer_schedules").select("id").limit(1);
    if (!error) return false;
    return isMissingRelationError(new Error(error.message));
  } catch {
    return false;
  }
}

export default async function CustomerSchedulesPage() {
  const access = await getScheduleAccess();

  let schedules: CustomerSchedule[] = [];
  let employees: Employee[] = [];
  let teams: Team[] = [];
  let customers: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    status?: string | null;
    recentQuoteAmount?: number | null;
    recentConsult?: string | null;
  }[] = [];
  let loadError: string | null = null;
  let tablesMissing = false;

  try {
    employees = await listEmployeesInScope(access);
  } catch {
    employees = [];
  }

  try {
    teams = await listTeams();
  } catch {
    teams = [];
  }

  try {
    const customerList = await getCustomers({ pageSize: 100 });
    const quoteByCustomer = new Map<string, number>();
    const consultByCustomer = new Map<string, string>();
    try {
      const { listQuotes } = await import("@/lib/crm/quote-mgmt");
      const quotes = await listQuotes({});
      for (const q of quotes) {
        if (!quoteByCustomer.has(q.customer_id)) {
          quoteByCustomer.set(q.customer_id, q.final_amount);
        }
      }
    } catch {
      // optional
    }
    try {
      const supabase = await createClient();
      const { data: logs } = await supabase
        .from("customer_consult_logs")
        .select("customer_id, content, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      for (const log of logs ?? []) {
        const cid = log.customer_id as string;
        if (!consultByCustomer.has(cid)) {
          consultByCustomer.set(cid, String(log.content ?? ""));
        }
      }
    } catch {
      // optional
    }

    customers = customerList.customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      address: c.address,
      status: c.status,
      recentQuoteAmount: quoteByCustomer.get(c.id) ?? null,
      recentConsult: consultByCustomer.get(c.id) ?? null,
    }));
  } catch {
    customers = [];
  }

  try {
    schedules = await listCustomerSchedules({}, access);
  } catch (error) {
    tablesMissing = await isScheduleSchemaMissing();
    loadError = error instanceof Error ? error.message : "일정을 불러오지 못했습니다.";
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {tablesMissing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold">상담 일정 테이블을 찾을 수 없습니다.</p>
            <p className="mt-2">{MIGRATION_HINT}</p>
          </div>
        )}

        {loadError && !tablesMissing && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {!loadError && (
          <CustomerSchedulesWorkspace
            initialSchedules={schedules}
            employees={employees}
            teams={teams}
            customers={customers}
            access={{
              canViewAll: access.canViewAll,
              canViewTeam: access.canViewTeam,
              employeeId: access.employeeId,
              role: access.role,
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
