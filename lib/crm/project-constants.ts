export const PROJECT_STATUSES = [
  "준비",
  "진행중",
  "완료",
  "보류",
  "취소",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
