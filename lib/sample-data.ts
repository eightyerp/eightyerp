export const menuItems = [
  { label: "대시보드", href: "/dashboard" },
  { label: "고객관리(CRM)", href: "/customers" },
  { label: "견적관리", href: "#" },
  { label: "계약관리", href: "#" },
  { label: "현장관리", href: "#" },
  { label: "수금관리", href: "#" },
  { label: "지출관리", href: "#" },
  { label: "정산관리(직원)", href: "#" },
  { label: "입금요청관리", href: "#" },
  { label: "일정관리", href: "#" },
  { label: "AS관리", href: "#" },
  { label: "문서관리", href: "#" },
  { label: "자재 카탈로그", href: "/materials/catalog" },
  { label: "자재분류 관리", href: "/materials/settings/categories" },
  { label: "거래처관리", href: "#" },
  { label: "통계/분석", href: "#" },
  { label: "광고/유입경로", href: "#" },
  { label: "카카오톡 알림", href: "#" },
  { label: "시스템관리", href: "#" },
] as const;

export const kpiCards = [
  { label: "신규 고객", value: "8", unit: "건", color: "blue" },
  { label: "미연락 고객", value: "15", unit: "건", color: "red" },
  { label: "상담 진행 고객", value: "23", unit: "건", color: "amber" },
  { label: "계약 고객", value: "12", unit: "건", color: "green" },
  { label: "계약 금액", value: "285,600,000", unit: "원", color: "gold" },
  { label: "미수금", value: "98,450,000", unit: "원", color: "orange" },
] as const;

export const monthlyRevenue = [
  { month: "1월", revenue: 180, profit: 42 },
  { month: "2월", revenue: 210, profit: 51 },
  { month: "3월", revenue: 195, profit: 48 },
  { month: "4월", revenue: 240, profit: 58 },
  { month: "5월", revenue: 265, profit: 63 },
  { month: "6월", revenue: 285, profit: 68 },
  { month: "7월", revenue: 310, profit: 74 },
] as const;

export const siteProgress = [
  { name: "강남 래미안 리모델링", status: "시공중", progress: 72, manager: "양현제 팀장" },
  { name: "분당 정자동 주택", status: "자재발주", progress: 35, manager: "김솔 팀장" },
  { name: "용인 수지 빌라", status: "준공검수", progress: 95, manager: "홍인표 팀장" },
  { name: "일산 백석 아파트", status: "설계확정", progress: 18, manager: "양현준 팀장" },
  { name: "판교 오피스텔", status: "시공중", progress: 58, manager: "김정아 실장" },
] as const;

export const tradeRevenue = [
  { trade: "목공", amount: 85400000, ratio: 30 },
  { trade: "타일", amount: 62800000, ratio: 22 },
  { trade: "도배", amount: 51200000, ratio: 18 },
  { trade: "전기", amount: 38600000, ratio: 14 },
  { trade: "설비", amount: 28600000, ratio: 10 },
  { trade: "기타", amount: 17400000, ratio: 6 },
] as const;

export const staffPerformance = [
  { name: "이응세", role: "대표이사", consulting: 5, contracted: 3, amount: 98000000, unpaid: 12000000 },
  { name: "김설화", role: "이사", consulting: 4, contracted: 2, amount: 62000000, unpaid: 18500000 },
  { name: "양현제", role: "팀장", consulting: 6, contracted: 2, amount: 48000000, unpaid: 15200000 },
  { name: "양현준", role: "팀장", consulting: 3, contracted: 1, amount: 32000000, unpaid: 9800000 },
  { name: "김솔", role: "팀장", consulting: 2, contracted: 2, amount: 28600000, unpaid: 14300000 },
  { name: "홍인표", role: "팀장", consulting: 2, contracted: 1, amount: 12000000, unpaid: 18700000 },
  { name: "김정아", role: "실장", consulting: 1, contracted: 1, amount: 5000000, unpaid: 9500000 },
] as const;

export const alertCustomers = [
  { name: "박지훈", phone: "010-2345-6789", lastContact: "7일 전", manager: "양현제 팀장", status: "미연락" },
  { name: "최수연", phone: "010-3456-7890", lastContact: "5일 전", manager: "김솔 팀장", status: "미연락" },
  { name: "정민호", phone: "010-4567-8901", lastContact: "3일 전", manager: "홍인표 팀장", status: "관리필요" },
  { name: "한소영", phone: "010-5678-9012", lastContact: "4일 전", manager: "김정아 실장", status: "미연락" },
  { name: "윤재원", phone: "010-6789-0123", lastContact: "6일 전", manager: "양현준 팀장", status: "관리필요" },
] as const;

export const todaySchedule = [
  { time: "09:30", title: "강남 현장 실측", type: "현장", manager: "양현제 팀장" },
  { time: "11:00", title: "분당 고객 상담", type: "상담", manager: "김설화 이사" },
  { time: "14:00", title: "용인 준공 검수", type: "검수", manager: "홍인표 팀장" },
  { time: "15:30", title: "수금 미팅 (박지훈)", type: "수금", manager: "김정아 실장" },
  { time: "17:00", title: "주간 영업 회의", type: "회의", manager: "이응세 대표이사" },
] as const;

export const quickRegisterButtons = [
  "고객 등록",
  "견적 등록",
  "계약 등록",
  "현장 등록",
  "수금 등록",
  "일정 등록",
] as const;

export const notifications = [
  { time: "10분 전", message: "강남 래미안 리모델링 자재 입고 완료", type: "info" },
  { time: "32분 전", message: "박지훈 고객 미수금 결제 기한 D-3", type: "warning" },
  { time: "1시간 전", message: "분당 정자동 주택 계약서 서명 완료", type: "success" },
  { time: "2시간 전", message: "용인 수지 빌라 준공 검수 일정 확정", type: "info" },
  { time: "3시간 전", message: "김솔 팀장 AS 요청 2건 접수", type: "warning" },
] as const;

export const currentUser = {
  name: "이응세",
  role: "대표이사",
  department: "경영지원",
} as const;

export function formatCurrency(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}
