import type {
  CustomerSchedule,
  ProjectProcessSchedule,
} from "@/types/database";

export function isCustomerScheduleOverdue(s: CustomerSchedule): boolean {
  if (["완료", "취소"].includes(s.status)) return false;
  return new Date(s.start_at).getTime() < Date.now();
}

export function isProcessDelayed(s: ProjectProcessSchedule): boolean {
  if (["완료", "취소"].includes(s.status)) return false;
  if (s.status === "지연") return true;
  const end = s.end_at ? new Date(s.end_at) : new Date(s.start_at);
  return end.getTime() < Date.now() && s.progress < 100;
}

/** 연기 후 후속 일정이 없는 경우 */
export function isPostponedWithoutFollowUp(
  s: CustomerSchedule,
  all: CustomerSchedule[],
): boolean {
  if (s.status !== "연기") return false;
  const start = new Date(s.start_at).getTime();
  return !all.some(
    (o) =>
      o.id !== s.id &&
      o.customer_id === s.customer_id &&
      !["취소"].includes(o.status) &&
      new Date(o.start_at).getTime() > start,
  );
}

/** 다음 연락일이 지났는데 이후 일정이 없는 경우 */
export function isNextContactOverdueWithoutFollowUp(
  s: CustomerSchedule,
  all: CustomerSchedule[],
): boolean {
  if (!s.next_contact_at) return false;
  if (["완료", "취소"].includes(s.status)) return false;
  const next = new Date(s.next_contact_at).getTime();
  if (next >= Date.now()) return false;
  return !all.some(
    (o) =>
      o.id !== s.id &&
      o.customer_id === s.customer_id &&
      !["취소", "완료"].includes(o.status) &&
      new Date(o.start_at).getTime() >= next,
  );
}

export function scheduleWarningKind(
  s: CustomerSchedule,
  all: CustomerSchedule[],
): "overdue" | "postponed" | "nextContact" | "urgent" | null {
  if (s.status === "완료" || s.status === "취소") return null;
  if (s.priority === "긴급") return "urgent";
  if (isCustomerScheduleOverdue(s)) return "overdue";
  if (isPostponedWithoutFollowUp(s, all)) return "postponed";
  if (isNextContactOverdueWithoutFollowUp(s, all)) return "nextContact";
  return null;
}
