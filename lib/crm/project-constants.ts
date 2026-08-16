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
  // project_id는 고객이 아니라 실제 현장을 식별하는 키다.
  // 같은 고객이 여러 현장을 가질 수 있으므로 주소/아파트 정보를 우선한다.
  const address = (customerAddress ?? "").trim();
  if (address) return address;
  const name = customerName.trim();
  return name ? `${name} 현장` : "현장";
}

/**
 * UI용: 현장 생성 버튼 노출 여부.
 *
 * Window workflow는 계약 전 `준비` 현장을 기준으로
 * 현장 → 점검 → 상담 → 견적을 같은 project_id로 연결한다.
 * 관리자는 고객상태와 무관하게 만들 수 있고,
 * 일반 직원은 본인 담당 고객에 한해 계약 전에도 만들 수 있다.
 */
export function canShowCreateSiteButton(input: {
  isAdmin: boolean;
  employeeId: string | null | undefined;
  assignedEmployeeId: string | null | undefined;
  customerStatus: string | null | undefined;
  hasProject: boolean;
}): boolean {
  if (input.hasProject) return false;
  if (input.isAdmin) return true;
  return (
    Boolean(input.employeeId) &&
    input.employeeId === input.assignedEmployeeId
  );
}
