import { isContractCustomerStatus } from "@/lib/crm/constants";

export const PROJECT_STATUSES = [
  "준비",
  "진행중",
  "완료",
  "보류",
  "취소",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function defaultProjectName(
  customerName: string,
  customerAddress?: string | null,
): string {
  const name = customerName.trim();
  if (name) return name;
  const address = (customerAddress ?? "").trim();
  return address || "현장";
}

/** UI용: 현장 생성 버튼 노출 여부 */
export function canShowCreateSiteButton(input: {
  isAdmin: boolean;
  employeeId: string | null | undefined;
  assignedEmployeeId: string | null | undefined;
  customerStatus: string | null | undefined;
  hasProject: boolean;
}): boolean {
  if (input.hasProject) return false;
  if (input.isAdmin) return true;
  const isAssignee =
    Boolean(input.employeeId) &&
    input.employeeId === input.assignedEmployeeId;
  return isAssignee && isContractCustomerStatus(input.customerStatus);
}
