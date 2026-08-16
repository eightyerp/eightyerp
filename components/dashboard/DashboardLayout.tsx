import { getTopBarUserAction } from "@/app/actions/session";
import DashboardShell from "./DashboardShell";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const user = await getTopBarUserAction();
  return <DashboardShell user={user}>{children}</DashboardShell>;
}
