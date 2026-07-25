export const CONTRACT_STATUSES = [
  "draft",
  "confirmed",
  "active",
  "amending",
  "adding",
  "terminated",
  "cancelled",
  "completed",
] as const;

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  draft: "초안",
  confirmed: "계약완료",
  active: "계약완료",
  amending: "변경진행",
  adding: "추가진행",
  terminated: "해지",
  cancelled: "해지",
  completed: "완료",
};

export const CONTRACT_KINDS = ["original", "amendment", "addition"] as const;
export const CONTRACT_KIND_LABELS: Record<string, string> = {
  original: "원계약",
  amendment: "변경계약",
  addition: "추가계약",
};

export const CONTRACT_FAULT_TYPES = [
  "customer",
  "company",
  "mutual",
  "other",
] as const;
export const CONTRACT_FAULT_LABELS: Record<string, string> = {
  customer: "고객 귀책",
  company: "회사 귀책",
  mutual: "상호 합의",
  other: "기타",
};

export function normalizeLifecycleStatus(status?: string | null): string {
  if (status === "active") return "confirmed";
  if (status === "cancelled") return "terminated";
  return status || "draft";
}

export function contractStatusLabel(status?: string | null): string {
  return CONTRACT_STATUS_LABELS[normalizeLifecycleStatus(status)] ?? status ?? "-";
}

export function contractRevisionLabel(kind?: string | null, sequence?: number | null): string | null {
  if (!kind || kind === "original" || !sequence) return null;
  return `${kind === "amendment" ? "변경" : "추가"} ${sequence}차`;
}

export const CONTRACT_EVENT_LABELS: Record<string, string> = {
  created: "최초계약",
  updated: "초안 수정",
  confirmed: "계약 확정",
  amendment_created: "변경계약 작성",
  amendment_confirmed: "변경계약 확정",
  addition_created: "추가계약 작성",
  addition_confirmed: "추가계약 확정",
  terminated: "계약 해지",
  restored: "해지 복구",
  budget_sync_skipped: "예산·수금 동기화 보류",
};
