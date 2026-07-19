export const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/pending-approval",
  "/customer",
] as const;

/** 로그인했지만 ERP 미승인·거절·비활성 시 허용되는 경로 */
export const PENDING_ROUTES = [
  "/pending-approval",
  "/company/register",
] as const;

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function isPendingRoute(pathname: string): boolean {
  return PENDING_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
