/**
 * Columns guaranteed by the baseline/live customer_activities table.
 * Keep optional v3 fields (result, next_contact_at, assignee snapshots) out of
 * direct writes until every environment has that schema.
 */
export const CUSTOMER_ACTIVITY_WRITE_COLUMNS = [
  "customer_id",
  "activity_type",
  "content",
  "previous_status",
  "new_status",
  "employee_id",
  "created_by",
] as const;

export type CustomerActivityWriteInput = {
  customer_id: string;
  activity_type: string;
  content?: string | null;
  previous_status?: string | null;
  new_status?: string | null;
  employee_id?: string | null;
  created_by?: string | null;
};

export function buildCustomerActivityWritePayload(
  input: CustomerActivityWriteInput,
) {
  return {
    customer_id: input.customer_id,
    activity_type: input.activity_type,
    content: input.content ?? null,
    previous_status: input.previous_status ?? null,
    new_status: input.new_status ?? null,
    employee_id: input.employee_id ?? null,
    created_by: input.created_by ?? null,
  };
}

export function buildCustomerActivityContent(input: {
  content: string;
  result?: string | null;
  nextContactAt?: string | null;
}): string {
  return [
    input.content.trim(),
    input.result?.trim() ? `상담결과: ${input.result.trim()}` : null,
    input.nextContactAt ? `다음 연락일: ${input.nextContactAt}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
