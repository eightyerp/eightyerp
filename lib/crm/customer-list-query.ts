export const CUSTOMER_LIST_PAGE_SIZE = 50;
export const CUSTOMER_SEARCH_DEBOUNCE_MS = 300;

export const CUSTOMER_LIST_COLUMNS = [
  "id",
  "name",
  "phone",
  "address",
  "consultation_type",
  "status",
  "lead_source_id",
  "assigned_employee_id",
  "next_contact_at",
  "last_contact_at",
  "deleted_at",
  "delete_reason",
  "created_at",
] as const;

export const CUSTOMER_LIST_SELECT = `
  ${CUSTOMER_LIST_COLUMNS.join(", ")},
  lead_sources ( id, name ),
  employees ( id, name, title, team_id, teams ( name ) ),
  customer_checklists ( is_completed ),
  customer_activities ( created_at )
`;

export function normalizeCustomerSearchTerm(value: string): string {
  return value.trim().replace(/[%_,()]/g, "");
}

export function buildCustomerSearchFilter(
  searchTerm: string,
  projectCustomerIds: readonly string[],
): string {
  const filters = [
    `name.ilike.%${searchTerm}%`,
    `phone.ilike.%${searchTerm}%`,
    `address.ilike.%${searchTerm}%`,
  ];

  if (projectCustomerIds.length > 0) {
    filters.push(`id.in.(${Array.from(new Set(projectCustomerIds)).join(",")})`);
  }

  return filters.join(",");
}

export function buildCustomerSearchHref(
  currentQueryString: string,
  searchTerm: string,
): string {
  const params = new URLSearchParams(currentQueryString);
  const normalizedQuery = searchTerm.trim();

  if (normalizedQuery) params.set("q", normalizedQuery);
  else params.delete("q");
  params.delete("page");

  const queryString = params.toString();
  return queryString ? `/customers?${queryString}` : "/customers";
}
