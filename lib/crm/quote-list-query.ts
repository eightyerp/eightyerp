export const QUOTE_LIST_PAGE_SIZE = 50;
export const QUOTE_SEARCH_DEBOUNCE_MS = 300;

export const QUOTE_LIST_SELECT =
  "id, customer_id, project_id, quote_group_id, parent_quote_id, quote_type, quote_mode, title, quote_number, version_number, status, total_amount, discount_amount, lx_discount_rate, lx_discount_amount, final_amount, vat_mode, vat_rate, supply_amount, vat_amount, customer_total_amount, valid_until, issued_at, sent_at, assigned_employee_id, is_lx_material, is_contract_quote, created_by, created_at, updated_at, deleted_at, customers ( id, name, phone, address, assigned_employee_id, status ), employees ( id, name, title, team_id, teams ( name ) )";
