export const CUSTOMER_SCHEDULE_TYPES = [
  "전화상담",
  "방문상담",
  "실측",
  "견적작성",
  "견적발송",
  "계약상담",
  "재연락",
  "해피콜",
  "기타",
] as const;

export const CUSTOMER_SCHEDULE_STATUSES = [
  "예정",
  "진행중",
  "완료",
  "연기",
  "취소",
  "미처리",
] as const;

export const SCHEDULE_PRIORITIES = ["낮음", "보통", "높음", "긴급"] as const;

export const PROCESS_SCHEDULE_STATUSES = [
  "예정",
  "진행중",
  "완료",
  "지연",
  "중단",
  "취소",
] as const;

export const PROCESS_NAME_SUGGESTIONS = [
  "철거",
  "설비",
  "창호",
  "목공",
  "전기",
  "타일",
  "욕실",
  "주방",
  "필름",
  "도배",
  "바닥재",
  "도어",
  "중문",
  "가구",
  "조명",
  "마감",
  "청소",
  "준공",
  "AS",
  "기타",
] as const;

export const SCHEDULE_STATUS_BADGE: Record<string, string> = {
  예정: "bg-sky-100 text-sky-900",
  진행중: "bg-sky-100 text-sky-900",
  완료: "bg-emerald-100 text-emerald-900",
  연기: "bg-amber-100 text-amber-900",
  취소: "bg-slate-100 text-slate-900",
  미처리: "bg-red-50 text-red-700",
  지연: "bg-red-50 text-red-700",
  중단: "bg-orange-50 text-orange-700",
};

export const PRIORITY_BADGE: Record<string, string> = {
  낮음: "bg-slate-100 text-slate-900",
  보통: "bg-slate-100 text-slate-900",
  높음: "bg-amber-100 text-amber-900",
  긴급: "bg-red-100 text-red-700 font-semibold",
};

export type ScheduleAlertType =
  | "consult_remind_1d"
  | "consult_remind_1h"
  | "consult_unhandled"
  | "process_start_1d"
  | "process_delayed"
  | "schedule_changed";
