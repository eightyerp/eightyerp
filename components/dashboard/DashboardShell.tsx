"use client";

import { useEffect, useState } from "react";
import {
  getTopBarUserAction,
  type TopBarUserDisplay,
} from "@/app/actions/session";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

const fallbackUser: TopBarUserDisplay = {
  name: "직원",
  roleLabel: "",
  department: "",
  companies: [],
  activeCompanyId: null,
  activeCompanyName: "",
  navigationRole: null,
  companyRole: null,
};

type DashboardShellProps = {
  children: React.ReactNode;
};

export default function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<TopBarUserDisplay>(fallbackUser);

  // 사용자/회사 조회를 첫 화면 critical path 밖으로 이동하고 TopBar/Sidebar가 결과를 공유한다.
  useEffect(() => {
    let cancelled = false;
    getTopBarUserAction()
      .then((next) => {
        if (!cancelled) setUser(next);
      })
      .catch(() => {
        /* keep fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        role={user.navigationRole}
        companyRole={user.companyRole}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenuToggle={() => setSidebarOpen(true)} user={user} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
