import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CustomerSchedulesWorkspace from "@/components/schedules/CustomerSchedulesWorkspace";
import { getCurrentUserAccess } from "@/lib/crm/access";
import { listCustomerSchedules } from "@/lib/crm/customer-schedules";
import { getCustomers } from "@/lib/crm/customers";
import {
  schemaMissingDevHint,
  schemaMissingStaffMessage,
} from "@/lib/crm/dev-diagnostics";
import { isMissingRelationError } from "@/lib/crm/errors";
import {
  getScheduleAccess,
  listEmployeesInScope,
  listTeams,
} from "@/lib/crm/schedule-access";
import { createClient } from "@/lib/supabase-server";
import type { CustomerSchedule, Employee, Team } from "@/types/database";

const MIGRATION_PATH =
  "supabase/migrations/20260725000001_customer_and_process_schedules.sql (+ 20260728000001_customer_schedules_v2.sql)";

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

async function listRecentQuoteRows(customerIds: string[]) {
  if (customerIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .select("customer_id, final_amount, created_at")
    .in("customer_id", customerIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function listRecentConsultRows(customerIds: string[]) {
  if (customerIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_consult_logs")
    .select("customer_id, consult_content, created_at")
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export default async function CustomerSchedulesPage() {
  const userAccess = await getCurrentUserAccess();
  if (!userAccess.isAuthenticated || !userAccess.userId) redirect("/login");
  if (!userAccess.canAccessErp) redirect("/pending-approval");
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
  const devHint = schemaMissingDevHint(MIGRATION_PATH, access.isAdmin);

  // 권한 확인 이후 서로 독립적인 핵심 조회는 동시에 시작한다.
  // 고객별 견적/상담 보조정보는 접근 가능한 고객 ID가 확정된 뒤 최소 컬럼만 읽는다.
  const [employeeResult, teamResult, customerResult, scheduleResult] =
    await Promise.allSettled([
      listEmployeesInScope(access),
      listTeams(),
      getCustomers({ pageSize: 100 }),
      listCustomerSchedules({}, access),
    ]);

  if (employeeResult.status === "fulfilled") employees = employeeResult.value;
  if (teamResult.status === "fulfilled") teams = teamResult.value;

  if (customerResult.status === "fulfilled") {
    const customerIds = customerResult.value.customers.map((customer) => customer.id);
    const [quoteResult, consultResult] = await Promise.allSettled([
      listRecentQuoteRows(customerIds),
      listRecentConsultRows(customerIds),
    ]);

    const quoteByCustomer = new Map<string, number>();
    if (quoteResult.status === "fulfilled") {
      for (const quote of quoteResult.value) {
        const customerId = String(quote.customer_id ?? "");
        if (customerId && !quoteByCustomer.has(customerId)) {
          quoteByCustomer.set(customerId, Number(quote.final_amount ?? 0));
        }
      }
    }

    const consultByCustomer = new Map<string, string>();
    if (consultResult.status === "fulfilled") {
      for (const log of consultResult.value) {
        const customerId = String(log.customer_id ?? "");
        if (customerId && !consultByCustomer.has(customerId)) {
          consultByCustomer.set(customerId, String(log.consult_content ?? ""));
        }
      }
    }

    customers = customerResult.value.customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      status: customer.status,
      recentQuoteAmount: quoteByCustomer.get(customer.id) ?? null,
      recentConsult: consultByCustomer.get(customer.id) ?? null,
    }));
  }

  if (scheduleResult.status === "fulfilled") {
    schedules = scheduleResult.value;
  } else {
    tablesMissing = await isScheduleSchemaMissing();
    loadError = tablesMissing
      ? null
      : "상담 일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {tablesMissing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold">
              {schemaMissingStaffMessage("상담 일정")}
            </p>
            {devHint && <p className="mt-2 text-xs">{devHint}</p>}
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