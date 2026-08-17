"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { href: "/crm", label: "홈", icon: "home" },
  { href: "/crm/customers", label: "고객", icon: "users" },
  { href: "/crm/schedules", label: "일정", icon: "calendar" },
  { href: "/crm/quotes", label: "견적", icon: "document" },
  { href: "/crm/more", label: "더보기", icon: "more" },
] as const;

function NavIcon({ name }: { name: (typeof NAV_ITEMS)[number]["icon"] }) {
  if (name === "home") {
    return <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-8.5Z" />;
  }
  if (name === "users") {
    return (
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    );
  }
  if (name === "calendar") {
    return <path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />;
  }
  if (name === "document") {
    return <path d="M6 2h9l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 1v6h6M8 13h8M8 17h8" />;
  }
  return <path d="M5 12h.01M12 12h.01M19 12h.01" />;
}

function isActive(pathname: string, href: string) {
  if (href === "/crm") return pathname === "/crm";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function CrmShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);

    // 고객카드처럼 수십 개 동적 route는 prefetch하지 않는다.
    // 반복 사용하는 하단 5개 메뉴만 현재 화면이 안정된 뒤 미리 워밍한다.
    const timer = window.setTimeout(() => {
      for (const item of NAV_ITEMS) {
        if (!isActive(pathname, item.href)) router.prefetch(item.href);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [pathname, router]);

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/crm" className="flex min-w-0 items-center gap-2" aria-label="EIGHTY CRM 홈">
            <span className="text-2xl font-black tracking-[-0.08em] text-navy-900">80</span>
            <span className="min-w-0">
              <span className="block text-[11px] font-bold tracking-[0.16em] text-slate-900">EIGHTY CRM</span>
              <span className="block text-[10px] text-slate-500">직원 영업앱</span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/crm/customers/new"
              prefetch={false}
              className="inline-flex h-9 items-center rounded-full bg-navy-900 px-3 text-xs font-black text-white shadow-sm"
              aria-label="신규 고객 등록"
            >
              + 고객
            </Link>
            <Link
              href="/crm/notifications"
              prefetch={false}
              className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm"
            >
              알림
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid h-16 max-w-3xl grid-cols-5">
          {NAV_ITEMS.map((item) => {
            const active = pendingHref
              ? item.href === pendingHref
              : isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                onPointerDown={() => router.prefetch(item.href)}
                onNavigate={() => setPendingHref(item.href)}
                className={`relative flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                  active ? "text-navy-900" : "text-slate-500"
                }`}
              >
                {pendingHref === item.href && pathname !== item.href && (
                  <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-navy-900" />
                )}
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <NavIcon name={item.icon} />
                </svg>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
