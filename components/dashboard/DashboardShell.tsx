"use client";

import { useState } from "react";
import type { TopBarUserDisplay } from "@/app/actions/session";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

type DashboardShellProps = {
  children: React.ReactNode;
  user: TopBarUserDisplay;
};

export default function DashboardShell({ children, user }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
