import DashboardLayout from "@/components/dashboard/DashboardLayout";
import InteriorQuoteExcelImportWorkspace from "@/components/quotes/InteriorQuoteExcelImportWorkspace";
import { listInteriorImportCustomers } from "@/lib/crm/interior-quote-import";
import { getScheduleAccess, listEmployeesInScope } from "@/lib/crm/schedule-access";

export default async function InteriorQuoteExcelImportPage() {
  const access = await getScheduleAccess();
  const [customers, employees] = await Promise.all([listInteriorImportCustomers(), listEmployeesInScope(access)]);
  const lockEmployeeId = !access.canViewAll && !access.canViewTeam ? access.employeeId : null;
  return <DashboardLayout><InteriorQuoteExcelImportWorkspace customers={customers} employees={employees} lockEmployeeId={lockEmployeeId} defaultEmployeeId={access.employeeId} /></DashboardLayout>;
}
