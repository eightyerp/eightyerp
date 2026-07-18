"use client";

import { useEffect, useRef, useState } from "react";
import LogoutButton from "@/components/auth/LogoutButton";
import { currentUser } from "@/lib/sample-data";

type TopBarProps = {
  onMenuToggle: () => void;
};

export default function TopBar({ onMenuToggle }: TopBarProps) {
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

        {/* Mobile: search icon → expand */}
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

        {/* Desktop / tablet: full search */}
        <div className="relative hidden min-w-0 sm:block">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
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
            placeholder="고객, 현장, 계약 검색..."
            className="h-11 w-64 rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 lg:w-80"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-3 lg:gap-5">
        <button
          type="button"
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label="알림"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-red-500" />
        </button>

        <div
          ref={profileRef}
          className="relative flex items-center gap-2 border-l border-gray-200 pl-2 sm:gap-3 sm:pl-3 lg:pl-5"
        >
          {/* Mobile: avatar opens menu (name + logout) */}
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-gold-400 sm:hidden"
            aria-label="프로필 메뉴"
            aria-expanded={profileOpen}
          >
            {currentUser.name.charAt(0)}
          </button>

          {/* Desktop: avatar + name + logout */}
          <div className="hidden items-center gap-3 sm:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-gold-400">
              {currentUser.name.charAt(0)}
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-gray-800">
                {currentUser.name} {currentUser.role}
              </p>
              <p className="text-xs text-gray-500">{currentUser.department}</p>
            </div>
            <LogoutButton />
          </div>

          {profileOpen && (
            <div className="absolute right-0 top-12 z-50 w-48 rounded-xl border border-gray-200 bg-white p-2 shadow-lg sm:hidden">
              <div className="border-b border-gray-100 px-3 py-2">
                <p className="text-sm font-semibold text-gray-900">
                  {currentUser.name}
                </p>
                <p className="text-xs text-gray-500">
                  {currentUser.role} · {currentUser.department}
                </p>
              </div>
              <div className="pt-2">
                <LogoutButton className="flex h-11 w-full items-center justify-center rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50" />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
