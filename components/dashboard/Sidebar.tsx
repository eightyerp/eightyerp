"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import EightyLogo from "@/components/brand/EightyLogo";
import {
  filterNavigation,
  getActiveNavigationItemId,
  type CompanyNavigationRole,
  type NavigationRole,
} from "@/lib/modules/navigation";

type SidebarProps = {
  open: boolean;
  onClose: () => void;
  role: NavigationRole | null;
  companyRole: CompanyNavigationRole | null;
};

const GROUP_CACHE_KEY = "eighty:sidebar-groups:v2";

function SearchParamsReader({
  children,
}: {
  children: (searchParams: Pick<URLSearchParams, "get">) => ReactNode;
}) {
  return children(useSearchParams());
}

export default function Sidebar({
  open,
  onClose,
  role,
  companyRole,
}: SidebarProps) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const saved = window.localStorage.getItem(GROUP_CACHE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, boolean>;
        timeoutId = setTimeout(() => setOpenGroups(parsed), 0);
      }
    } catch {
      // 손상된 브라우저 저장값은 기본 접힘 상태로 복구합니다.
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const nav = filterNavigation(role, new Set(), companyRole);

  function toggleGroup(id: string, expanded: boolean) {
    setOpenGroups((current) => {
      const next = { ...current, [id]: !expanded };
      window.localStorage.setItem(GROUP_CACHE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function renderNavigation(searchParams: Pick<URLSearchParams, "get">) {
    return (
      <ul className="space-y-0.5">
        {nav.map((group) => {
          const activeItemId = getActiveNavigationItemId(
            group.items,
            pathname,
            searchParams,
          );
          const active = activeItemId !== null;
          const expanded =
            openGroups[group.id] ??
            (active || group.id === "dashboard" || group.id === "finance");
          return (
            <li key={group.id}>
              <button
                type="button"
                onClick={() => toggleGroup(group.id, expanded)}
                aria-expanded={expanded}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-gold-500/15 font-medium text-gold-400"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span>{group.label}</span>
                <span className="text-xs opacity-60">
                  {expanded ? "▾" : "▸"}
                </span>
              </button>
              {expanded && (
                <ul className="mt-0.5 ml-3 space-y-0.5 border-l border-white/10 pl-3">
                  {group.items.map((item) => {
                    const childActive = item.id === activeItemId;
                    return (
                      <li key={item.id}>
                        {item.route ? (
                          <Link
                            href={item.route}
                            onClick={onClose}
                            className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                              childActive
                                ? "bg-gold-500/15 font-medium text-gold-400"
                                : "text-white/60 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <span className="mr-2 opacity-60" aria-hidden>
                              {item.icon}
                            </span>
                            {item.label}
                          </Link>
                        ) : (
                          <span
                            className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-white/45"
                            aria-disabled="true"
                          >
                            <span>
                              <span className="mr-2 opacity-60">{item.icon}</span>
                              {item.label}
                            </span>
                            <span className="text-[10px]">준비중</span>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

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
          <EightyLogo
            variant="white"
            layout="symbol"
            className="h-9 w-auto shrink-0"
            title="EIGHTY"
          />
          <div>
            <p className="text-sm font-semibold tracking-wider text-white">
              EIGHTY ERP
            </p>
            <p className="text-xs text-white/50">주식회사 에잇티</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <Suspense fallback={renderNavigation(new URLSearchParams())}>
            <SearchParamsReader>{renderNavigation}</SearchParamsReader>
          </Suspense>
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <p className="text-xs text-white/40">© 2026 주식회사 에잇티</p>
        </div>
      </aside>
    </>
  );
}
