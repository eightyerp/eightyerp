"use client";

import { usePathname } from "next/navigation";
import { isPendingRoute, isPublicRoute } from "@/lib/auth";
import DashboardShell from "./DashboardShell";

type AppShellRouterProps = {
  children: React.ReactNode;
};

function shouldUseDashboardShell(pathname: string): boolean {
  if (pathname === "/") return false;
  if (isPublicRoute(pathname) || isPendingRoute(pathname)) return false;
  return true;
}

/**
 * ERP 보호 화면의 좌측 메뉴/상단바를 RootLayout 아래에서 한 번만 유지한다.
 * 페이지 이동 시에는 children만 교체되어 shell 사용자/회사 상태를 재조회하지 않는다.
 */
export default function AppShellRouter({ children }: AppShellRouterProps) {
  const pathname = usePathname();

  if (!shouldUseDashboardShell(pathname)) {
    return <>{children}</>;
  }

  return <DashboardShell>{children}</DashboardShell>;
}
