type DashboardLayoutProps = {
  children: React.ReactNode;
};

/**
 * Dashboard shell은 RootLayout의 AppShellRouter가 한 번만 유지한다.
 * 기존 페이지들의 마크업 변경을 최소화하기 위해 이 wrapper는 children만 전달한다.
 */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return <>{children}</>;
}
