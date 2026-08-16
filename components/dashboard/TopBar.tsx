"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { TopBarUserDisplay } from "@/app/actions/session";
import LogoutButton from "@/components/auth/LogoutButton";
import CompanySwitcher from "@/components/dashboard/CompanySwitcher";
import ErpNotificationBell from "@/components/dashboard/ErpNotificationBell";

type TopBarProps = {
  onMenuToggle: () => void;
  user: TopBarUserDisplay;
};

export default function TopBar({ onMenuToggle, user }: TopBarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) {
        setSearchOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, []);

  const initial = user.name.charAt(0) || "직";
  const subtitle = [user.roleLabel, user.department].filter(Boolean).join(" · ");

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 sm:h-16 sm:gap-4 sm:px-4 lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-3">
        <button
          type="button"
          onClick={onMenuToggle}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 lg:hidden"
          aria-label="메뉴 열기"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div ref={searchRef} className="relative min-w-0 flex-1 sm:hidden">
          {searchOpen ? (
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="search"
                autoFocus
                placeholder="고객, 현장 검색..."
                className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="검색"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>
          )}
        </div>

        <div className="relative hidden min-w-0 flex-1 sm:block">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="search"
            placeholder="고객명, 연락처, 주소, 현장명 검색..."
            className="h-11 w-full max-w-md rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <CompanySwitcher
          companies={user.companies}
          activeCompanyId={user.activeCompanyId}
          activeCompanyName={user.activeCompanyName}
        />
        <ErpNotificationBell />

        <div
          ref={profileRef}
          className="relative flex items-center gap-2 border-l border-gray-200 pl-2 sm:gap-3 sm:pl-3 lg:pl-5"
        >
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-gold-400 sm:hidden"
            aria-label="프로필 메뉴"
            aria-expanded={profileOpen}
          >
            {initial}
          </button>

          <div className="hidden items-center gap-2 sm:flex">
            <Link
              href="/me"
              className="flex items-center gap-3 rounded-lg px-1.5 py-1 hover:bg-gray-50"
              aria-label="내 정보 열기"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-gold-400">
                {initial}
              </div>
              <div className="hidden min-w-0 md:block">
                <p className="truncate text-sm font-medium text-gray-800">
                  {user.name}
                  {user.roleLabel ? ` ${user.roleLabel}` : ""}
                </p>
                {user.department ? (
                  <p className="truncate text-xs text-gray-500">{user.department}</p>
                ) : null}
              </div>
            </Link>
            <LogoutButton />
          </div>

          {profileOpen && (
            <div className="absolute right-0 top-12 z-50 w-52 rounded-xl border border-gray-200 bg-white p-2 shadow-lg sm:hidden">
              <div className="border-b border-gray-100 px-3 py-2">
                <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                {subtitle ? (
                  <p className="text-xs text-gray-500">{subtitle}</p>
                ) : null}
              </div>
              <div className="space-y-1 pt-2">
                <Link
                  href="/me"
                  onClick={() => setProfileOpen(false)}
                  className="flex min-h-11 w-full items-center rounded-lg px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  내 정보 수정
                </Link>
                <LogoutButton className="flex h-11 w-full items-center justify-center rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50" />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
