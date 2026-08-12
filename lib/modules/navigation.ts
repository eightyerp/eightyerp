import type { UserRole } from "@/types/database";
import type { ErpModuleId } from "./registry";

export type NavigationRole = UserRole;
export type CompanyNavigationRole = "owner" | "director" | "admin" | "manager" | "employee";

const NAVIGATION_ROLES = ["super_admin", "admin", "manager", "staff"] as const satisfies readonly UserRole[];
const COMPANY_NAVIGATION_ROLES = ["owner", "director", "admin", "manager", "employee"] as const satisfies readonly CompanyNavigationRole[];

export type NavigationItem = {
  id: string;
  label: string;
  route: string | null;
  icon: string;
  moduleId: ErpModuleId;
  roles?: readonly NavigationRole[];
  companyRoles?: readonly CompanyNavigationRole[];
  featureFlag?: string;
  status?: "ready" | "coming_soon";
  match?: "exact" | "prefix";
};

export type NavigationGroup = {
  id: string;
  label: string;
  items: readonly NavigationItem[];
};

export const ADMIN_ROLES: readonly NavigationRole[] = ["super_admin", "admin"];
export const COMPANY_ADMIN_ROLES: readonly CompanyNavigationRole[] = ["owner", "director", "admin"];
export const COMPANY_APPROVAL_ROLES: readonly CompanyNavigationRole[] = ["owner", "director"];

export const NAVIGATION_REGISTRY: readonly NavigationGroup[] = [
  { id: "dashboard", label: "대시보드", items: [{ id: "dashboard", label: "대시보드", route: "/dashboard", icon: "▦", moduleId: "core", match: "exact" }] },
  { id: "sales", label: "고객·영업", items: [
    { id: "customers", label: "고객관리", route: "/customers", icon: "◉", moduleId: "crm", match: "prefix" },
    { id: "lead-sources", label: "광고·유입경로", route: null, icon: "◈", moduleId: "crm", status: "coming_soon" },
    { id: "vendors", label: "거래처관리", route: null, icon: "◇", moduleId: "crm", status: "coming_soon" },
  ] },
  { id: "quote-contract", label: "견적·계약", items: [
    { id: "quotes", label: "견적 목록", route: "/quotes", icon: "▤", moduleId: "quotes", match: "prefix" },
    { id: "window-quote", label: "창호 견적", route: "/quotes/new?type=window", icon: "□", moduleId: "quotes" },
    { id: "interior-quote", label: "인테리어 견적", route: "/quotes/new?type=interior", icon: "▧", moduleId: "quotes" },
    { id: "interior-import", label: "인테리어 Excel 가져오기", route: "/quotes/import/interior", icon: "⇧", moduleId: "ai" },
    { id: "contracts", label: "계약관리", route: "/contracts", icon: "▣", moduleId: "contracts", match: "prefix" },
  ] },
  { id: "field", label: "현장·일정", items: [
    { id: "projects", label: "현장관리", route: null, icon: "⌂", moduleId: "projects", status: "coming_soon" },
    { id: "customer-schedules", label: "고객상담 일정", route: "/schedules/customers", icon: "◷", moduleId: "schedules" },
    { id: "process-schedules", label: "공사 일정", route: "/schedules/processes", icon: "▦", moduleId: "schedules" },
    { id: "as", label: "AS관리", route: null, icon: "!", moduleId: "projects", status: "coming_soon" },
  ] },
  { id: "finance", label: "회계·정산", items: [
    { id: "finance-collections", label: "수금관리", route: "/finance/collections", icon: "₩", moduleId: "finance", match: "prefix" },
    { id: "finance-payments", label: "지출관리", route: "/finance/payments", icon: "₩", moduleId: "finance", match: "prefix" },
    ...[["expenses", "운영비"], ["settlements", "직원 정산"], ["profit-loss", "월 손익"], ["cash-flow", "현금흐름"], ["closing", "월 마감"]].map(([id, label]) => ({ id: `finance-${id}`, label, route: null, icon: "₩", moduleId: "finance" as const, roles: ADMIN_ROLES, status: "coming_soon" as const })),
  ] },
  { id: "inventory", label: "자재·구매", items: [
    { id: "catalog", label: "자재 카탈로그", route: "/materials/catalog", icon: "▦", moduleId: "inventory" },
    { id: "categories", label: "자재분류 관리", route: "/materials/settings/categories", icon: "≡", moduleId: "inventory" },
    { id: "purchase", label: "발주관리", route: null, icon: "⇄", moduleId: "inventory", status: "coming_soon" },
  ] },
  { id: "documents", label: "문서·알림", items: [
    { id: "documents", label: "문서관리", route: null, icon: "▤", moduleId: "documents", status: "coming_soon" },
    { id: "kakao", label: "카카오톡 알림", route: null, icon: "○", moduleId: "notifications", status: "coming_soon" },
    { id: "notification-history", label: "알림 이력", route: null, icon: "≡", moduleId: "notifications", status: "coming_soon" },
  ] },
  { id: "analytics", label: "통계·경영", items: [
    { id: "analytics", label: "통계·분석", route: null, icon: "↗", moduleId: "analytics", status: "coming_soon", roles: ADMIN_ROLES },
    { id: "ad-performance", label: "광고성과", route: null, icon: "%", moduleId: "analytics", status: "coming_soon", roles: ADMIN_ROLES },
  ] },
  { id: "my-account", label: "내 계정", items: [
    { id: "my-profile", label: "내 정보", route: "/me", icon: "●", moduleId: "hr", match: "exact" },
  ] },
  { id: "system", label: "시스템관리", items: [
    { id: "employees", label: "직원 Master", route: "/system/employees", icon: "♙", moduleId: "hr" },
    { id: "approvals", label: "계정 재연결", route: "/system/approvals", icon: "✓", moduleId: "system", companyRoles: COMPANY_APPROVAL_ROLES },
    { id: "invitations", label: "직원 초대", route: "/system/invitations", icon: "+", moduleId: "system", companyRoles: COMPANY_ADMIN_ROLES },
    { id: "company-permissions", label: "회사·권한", route: null, icon: "⚙", moduleId: "system", status: "coming_soon", companyRoles: COMPANY_ADMIN_ROLES },
    { id: "system-status", label: "시스템 상태", route: null, icon: "●", moduleId: "system", status: "coming_soon", companyRoles: COMPANY_ADMIN_ROLES },
  ] },
] as const;

export function filterNavigation(
  role: NavigationRole | null,
  featureFlags: ReadonlySet<string> = new Set(),
  companyRole: CompanyNavigationRole | null = null,
) {
  return NAVIGATION_REGISTRY.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      const roleAllowed =
        (!item.roles && !item.companyRoles) ||
        (role != null && item.roles?.includes(role) === true) ||
        (companyRole != null &&
          item.companyRoles?.includes(companyRole) === true);

      return roleAllowed &&
        (!item.featureFlag || featureFlags.has(item.featureFlag));
    }),
  })).filter((group) => group.items.length > 0);
}

export function isNavigationRole(value: unknown): value is NavigationRole {
  return typeof value === "string" && NAVIGATION_ROLES.some((role) => role === value);
}

export function isCompanyNavigationRole(value: unknown): value is CompanyNavigationRole {
  return typeof value === "string" && COMPANY_NAVIGATION_ROLES.some((role) => role === value);
}

export function isNavigationRouteActive(
  pathname: string,
  route: string | null,
  searchParams: Pick<URLSearchParams, "get"> = new URLSearchParams(),
  match: NavigationItem["match"] = "prefix",
) {
  if (!route) return false;
  const [path, query = ""] = route.split("?");
  const pathMatches = pathname === path || (match === "prefix" && pathname.startsWith(`${path}/`));
  if (!pathMatches) return false;

  let queryMatches = true;
  new URLSearchParams(query).forEach((value, key) => {
    if (searchParams.get(key) !== value) queryMatches = false;
  });
  return queryMatches;
}

export function getActiveNavigationItemId(
  items: readonly NavigationItem[],
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
) {
  const matches = items.filter((item) =>
    isNavigationRouteActive(pathname, item.route, searchParams, item.match),
  );
  return matches.sort((left, right) => {
    const leftScore = (left.route?.includes("?") ? 1000 : 0) + (left.route?.split("?")[0].length ?? 0);
    const rightScore = (right.route?.includes("?") ? 1000 : 0) + (right.route?.split("?")[0].length ?? 0);
    return rightScore - leftScore;
  })[0]?.id ?? null;
}
