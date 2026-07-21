"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { menuItems } from "@/lib/sample-data";
import { createClient } from "@/lib/supabase";
import { isAdminRole } from "@/lib/crm/constants";
import type { UserRole } from "@/types/database";

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

type MenuItem = {
  label: string;
  href: string;
  children?: { label: string; href: string }[];
};

function isActivePath(pathname: string, href: string): boolean {
  if (href === "#") return false;
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isGroupActive(pathname: string, item: MenuItem): boolean {
  if (item.children?.length) {
    return item.children.some((c) => isActivePath(pathname, c.href));
  }
  return isActivePath(pathname, item.href);
}

function buildNav(isAdmin: boolean): MenuItem[] {
  return menuItems.map((item): MenuItem => {
    const label = String(item.label);
    const href = String(item.href);
    if (label === "스케줄관리") {
      return {
        label: "스케줄관리",
        href: "/schedules/customers",
        children: [
          { label: "고객상담 스케줄", href: "/schedules/customers" },
          { label: "공사 스케줄", href: "/schedules/processes" },
        ],
      };
    }
    if (label === "시스템관리") {
      return {
        label: "시스템관리",
        href: isAdmin ? "/system/approvals" : "/system/employees",
        children: isAdmin
          ? [
              { label: "가입 승인 관리", href: "/system/approvals" },
              { label: "직원 초대 관리", href: "/system/invitations" },
              { label: "직원 연락처·명함", href: "/system/employees" },
            ]
          : [{ label: "내 연락처·명함", href: "/system/employees" }],
      };
    }
    return { label, href };
  });
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    스케줄관리: true,
    시스템관리: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, is_active, is_approved, approval_status")
          .eq("id", user.id)
          .maybeSingle();
        if (!profile || cancelled) return;
        const approved =
          typeof profile.is_approved === "boolean"
            ? profile.is_approved === true
            : true;
        const status =
          (profile.approval_status as string | undefined) ??
          (approved ? "approved" : "pending");
        const canAccess =
          profile.is_active === true && approved && status === "approved";
        setIsAdmin(
          canAccess && isAdminRole(profile.role as UserRole),
        );
      } catch {
        // ignore — menu stays without admin links
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const NAV = buildNav(isAdmin).filter((item) => {
    if (item.label === "시스템관리") {
      // 관리자: 전체 / 일반: 내 연락처·명함만
      return true;
    }
    return true;
  });

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-navy-900 transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <span className="text-2xl font-bold text-gold-500">80</span>
          <div>
            <p className="text-sm font-semibold tracking-wider text-white">
              EIGHTY ERP
            </p>
            <p className="text-xs text-white/50">주식회사 에잇티</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const active = isGroupActive(pathname, item);
              const hasChildren = Boolean(item.children?.length);
              const expanded = openGroups[item.label] ?? active;

              if (hasChildren) {
                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenGroups((prev) => ({
                          ...prev,
                          [item.label]: !expanded,
                        }))
                      }
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm transition-colors ${
                        active
                          ? "bg-gold-500/15 font-medium text-gold-400"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span>{item.label}</span>
                      <span className="text-xs opacity-60">
                        {expanded ? "▾" : "▸"}
                      </span>
                    </button>
                    {expanded && (
                      <ul className="mt-0.5 ml-3 space-y-0.5 border-l border-white/10 pl-3">
                        {item.children!.map((child) => {
                          const childActive = isActivePath(
                            pathname,
                            child.href,
                          );
                          return (
                            <li key={child.href}>
                              <Link
                                href={child.href}
                                onClick={onClose}
                                className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                                  childActive
                                    ? "bg-gold-500/15 font-medium text-gold-400"
                                    : "text-white/60 hover:bg-white/5 hover:text-white"
                                }`}
                              >
                                {child.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              }

              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={`block rounded-md px-3 py-2.5 text-sm transition-colors ${
                      active
                        ? "bg-gold-500/15 font-medium text-gold-400"
                        : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <p className="text-xs text-white/40">© 2026 주식회사 에잇티</p>
        </div>
      </aside>
    </>
  );
}
