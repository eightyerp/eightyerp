"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
    return <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87m-2-11.96a4 4 0 0 1 0 7.75" />;
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

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/crm" className="flex items-center gap-2" aria-label="EIGHTY CRM 홈">
            <span className="text-2xl font-black tracking-[-0.08em] text-navy-950">80</span>
            <span>
              <span className="block text-[11px] font-bold tracking-[0.16em] text-slate-900">EIGHTY CRM</span>
              <span className="block text-[10px] text-slate-500">직원 영업앱</span>
            </span>
          </Link>
          <Link
            href="/crm/notifications"
            className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm"
          >
            알림
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid h-16 max-w-3xl grid-cols-5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                  active ? "text-navy-950" : "text-slate-500"
                }`}
              >
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
