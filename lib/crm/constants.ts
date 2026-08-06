import type {
  ActivityType,
  ChecklistType,
  ConsultationType,
  ConsultType,
  CustomerStatus,
  UserRole,
} from "@/types/database";

export const CONSULT_TYPES: ConsultType[] = [
  "전화",
  "방문",
  "카카오톡",
  "문자",
  "이메일",
  "기타",
];

export const CUSTOMER_PAGE_SIZE = 20;

/** DB·레거시 호환 (과거 '홈씨씨'/KCC 값 조회·표시용). 스키마 CHECK와 동일. */
export const QUOTE_BRANDS = ["LX하우시스", "홈씨씨", "기타"] as const;

/** 신규 견적 UI 선택지 — KCC/홈씨씨 제외, LX·기타만 */
export const QUOTE_BRANDS_FOR_NEW = ["LX하우시스", "기타"] as const;

/** 신규 작성은 FOR_NEW, 과거 홈씨씨 견적 수정 시에만 기존값 옵션 유지 */
export function quoteBrandSelectOptions(
  currentBrand?: string | null,
): readonly string[] {
  const current = (currentBrand ?? "").trim();
  if (
    current &&
    !(QUOTE_BRANDS_FOR_NEW as readonly string[]).includes(current) &&
    (QUOTE_BRANDS as readonly string[]).includes(current)
  ) {
    return [...QUOTE_BRANDS_FOR_NEW, current];
  }
  return QUOTE_BRANDS_FOR_NEW;
}

export const QUOTE_STATUSES = [
  "작성중",
  "고객발송",
  "고객확인",
  "수정요청",
  "최종견적",
  "계약전환",
  "보류",
  "취소",
] as const;

export const QUOTE_SEND_METHODS = ["문자", "카카오톡", "이메일", "기타"] as const;

export const QUOTE_STATUS_BADGE_CLASS: Record<string, string> = {
  작성중: "bg-slate-100 text-slate-900 ring-1 ring-gray-200",
  고객발송: "bg-sky-100 text-sky-900 ring-1 ring-sky-200",
  고객확인: "bg-sky-100 text-sky-900 ring-1 ring-blue-200",
  수정요청: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  최종견적: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
  계약전환: "bg-navy-800 text-gold-400 ring-1 ring-navy-900",
  보류: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
  취소: "bg-slate-100 text-slate-900 ring-1 ring-slate-200",
};

export const QUOTE_STORAGE_BUCKET = "customer-quotes";
export const QUOTE_ALLOWED_EXTENSIONS = ["pdf", "xlsx", "xls"] as const;
export const QUOTE_MAX_FILE_BYTES = 50 * 1024 * 1024;

/** 신규/수정 폼용 상담유형 */
export const CONSULTATION_TYPES: ConsultationType[] = [
  "창호",
  "종합인테리어",
  "부분인테리어",
  "주방",
  "욕실",
  "도배",
  "바닥재",
  "도어/중문",
  "기타",
];

/** 관심 공종 (복수 선택) */
export const INTEREST_ITEMS = [
  "창호",
  "주방",
  "욕실",
  "도배",
  "바닥재",
  "도어",
  "중문",
  "인테리어필름",
  "빌트인 시스템",
  "확장",
  "전기",
  "조명",
  "목공",
  "타일",
  "기타",
] as const;

/** 신규등록 화면용 상담상태 */
export const CUSTOMER_FORM_STATUSES: CustomerStatus[] = [
  "신규",
  "미연락",
  "1차 연락완료",
  "상담중",
  "방문예약",
  "실측예약",
  "견적작성중",
  "견적제출",
  "계약협의",
  "계약완료",
  "보류",
  "연락두절",
  "취소",
];

/** 필터/목록용 전체 상태 (기존 데이터 포함) */
export const CUSTOMER_STATUSES: CustomerStatus[] = [
  ...CUSTOMER_FORM_STATUSES,
  "시공예정",
  "시공중",
  "완료",
];

export const CHECKLIST_TYPES: ChecklistType[] = [
  "신규문의 확인",
  "1차 해피콜",
  "상담내용 등록",
  "방문/실측 일정 확정",
  "견적서 작성",
  "견적서 발송",
  "고객 피드백 확인",
  "계약 여부 확인",
  "계약금 확인",
  "현장 인계",
];

export const ACTIVITY_TYPES: ActivityType[] = [
  "전화",
  "문자",
  "카카오톡",
  "홈페이지 문의",
  "LX 본사문의",
  "방문상담",
  "실측",
  "견적발송",
  "계약협의",
  "메모",
  "상태변경",
  "담당자변경",
];

export const CONSULTATION_RESULTS = [
  "부재중",
  "통화완료",
  "상담진행",
  "재연락필요",
  "방문예약",
  "견적요청",
  "계약관심",
  "보류",
  "거절",
] as const;

export const LEAD_SOURCE_NAMES = [
  "홈페이지",
  "네이버 검색광고",
  "네이버 블로그",
  "인스타그램",
  "카카오톡",
  "문자문의",
  "LX하우시스 본사",
  "소개",
  "공동구매",
  "단지행사",
  "재계약",
  "기타",
] as const;

export const EMPLOYEE_DIRECTORY = [
  { name: "이응세", title: "대표이사", recommendedRole: "super_admin" as UserRole },
  { name: "김설화", title: "이사", recommendedRole: "admin" as UserRole },
  { name: "양현준", title: "인테리어 팀장", recommendedRole: "manager" as UserRole },
  { name: "양현제", title: "인테리어 팀장", recommendedRole: "manager" as UserRole },
  { name: "조근아", title: "인테리어 실장", recommendedRole: "manager" as UserRole },
  { name: "김솔", title: "인테리어 팀장", recommendedRole: "manager" as UserRole },
  { name: "김유진", title: "인테리어 실장", recommendedRole: "manager" as UserRole },
  { name: "홍인표", title: "창호 팀장", recommendedRole: "manager" as UserRole },
  { name: "이응준", title: "창호 팀장", recommendedRole: "manager" as UserRole },
  { name: "최준우", title: "창호 팀장", recommendedRole: "manager" as UserRole },
  {
    name: "김정아",
    title: "창호 실장",
    recommendedRole: "manager" as UserRole,
    defaultPermissions: {
      can_manage_windows: true,
      can_edit_customers: true,
      can_assign_staff: true,
    },
  },
  { name: "오용철", title: "창호 팀장", recommendedRole: "manager" as UserRole },
] as const;

export function formatEmployeeLabel(name: string, title: string): string {
  return `${name} ${title}`;
}

/** 견적 담당자 선택용 — 이름 · 직책 · 휴대전화 */
export function formatEmployeeAssigneeOption(
  employee: {
    name: string;
    title?: string | null;
    phone?: string | null;
  },
): string {
  const title = (employee.title ?? "").trim();
  const phone = (employee.phone ?? "").trim();
  const base = title
    ? formatEmployeeLabel(employee.name, title)
    : employee.name.trim();
  return phone ? `${base} · ${phone}` : base;
}

export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

/** 계약 고객(현장 전환 대상) — 관리자는 계약 여부와 무관하게 현장 생성 가능 */
export function isContractCustomerStatus(
  status: string | null | undefined,
): boolean {
  return status === "계약완료" || status === "계약";
}

/** manager + admin + super_admin (executive 역할은 DB에 없으며 super_admin으로 취급) */
export function isManagerOrAboveRole(role: UserRole | null | undefined): boolean {
  return role === "manager" || isAdminRole(role);
}

export const STATUS_BADGE_CLASS: Record<string, string> = {
  신규: "bg-sky-100 text-sky-900 ring-1 ring-sky-200",
  미연락: "bg-red-50 text-red-700 ring-1 ring-red-200",
  "1차 연락완료": "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  상담중: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
  방문예약: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  실측예약: "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-200",
  견적작성중: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  견적제출: "bg-sky-100 text-sky-900 ring-1 ring-blue-200",
  계약협의: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
  계약완료: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
  계약: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
  시공예정: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200",
  시공중: "bg-navy-800/10 text-navy-800 ring-1 ring-navy-700/20",
  완료: "bg-navy-800 text-gold-400 ring-1 ring-navy-900",
  보류: "bg-slate-100 text-slate-900 ring-1 ring-gray-200",
  연락두절: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  취소: "bg-slate-100 text-slate-900 ring-1 ring-slate-200",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: "최고관리자",
  admin: "관리자",
  manager: "팀장/실장",
  staff: "일반직원",
};
