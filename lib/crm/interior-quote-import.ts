import { requireCustomerAccess } from "@/lib/crm/customer-access";
import { createClient } from "@/lib/supabase-server";

export type InteriorImportCustomerOption = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  company_id: string | null;
  assigned_employee_id: string | null;
  sites: Array<{ id: string; name: string; address: string | null }>;
};

/**
 * `projects` has both its legacy customer FK and a company-scoped composite FK.
 * PostgREST therefore needs the legacy FK named explicitly when embedding sites.
 */
export const INTERIOR_IMPORT_CUSTOMER_SELECT = `
  id,
  name,
  phone,
  address,
  company_id,
  assigned_employee_id,
  projects:projects!projects_customer_id_fkey ( id, name, address )
`;

export async function listInteriorImportCustomers(): Promise<InteriorImportCustomerOption[]> {
  const access = await requireCustomerAccess();
  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select(INTERIOR_IMPORT_CUSTOMER_SELECT)
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(500);
  if (!access.canViewAllCompanyCustomers) {
    if (!access.employeeId) return [];
    query = query.eq("assigned_employee_id", access.employeeId);
  }
  const { data, error } = await query;
  if (error) throw new Error("인테리어 견적용 고객 목록을 불러오지 못했습니다.");
  return (data ?? []).map((row) => ({
    id: String(row.id), name: String(row.name), phone: String(row.phone),
    address: row.address == null ? null : String(row.address),
    company_id: row.company_id == null ? null : String(row.company_id),
    assigned_employee_id: row.assigned_employee_id == null ? null : String(row.assigned_employee_id),
    sites: Array.isArray(row.projects) ? row.projects.map((site) => ({ id: String(site.id), name: String(site.name), address: site.address == null ? null : String(site.address) })) : [],
  }));
}
