"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getMyCustomerPushesAction } from "@/app/actions/customer-push";
import type { CustomerPushItem } from "@/lib/crm/customer-push";

function formatPushTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CustomerPushBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CustomerPushItem[]>([]);
  const [recentCount, setRecentCount] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const next = await getMyCustomerPushesAction();
      if (cancelled) return;
      const recentCutoff = Date.now() - 24 * 60 * 60 * 1000;
      setItems(next);
      setRecentCount(
        next.filter(
          (item) => new Date(item.createdAt).getTime() >= recentCutoff,
        ).length,
      );
    }

    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function closeOnOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (wrapperRef.current && !wrapperRef.current.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("touchstart", closeOnOutside);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("touchstart", closeOnOutside);
    };
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        aria-label="고객정보 PUSH 알림"
        aria-expanded={open}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {recentCount > 0 ? (
          <span className="absolute right-1 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">
            {recentCount > 9 ? "9+" : recentCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">고객정보 PUSH</p>
            <p className="mt-0.5 text-xs text-slate-500">
              담당자로 전달된 최근 고객정보입니다.
            </p>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                받은 고객정보 PUSH가 없습니다.
              </p>
            ) : (
              items.map((item) => (
                <Link
                  key={item.id}
                  href={`/customers/${item.customerId}`}
                  onClick={() => setOpen(false)}
                  className="block border-b border-gray-100 px-4 py-3 hover:bg-sky-50/60 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {item.customerName}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-sky-700">
                        {item.phone || "연락처 없음"}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {formatPushTime(item.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    {[item.consultationType, item.status].filter(Boolean).join(" · ") || "고객 상담"}
                  </p>
                  {item.address ? (
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {item.address}
                    </p>
                  ) : null}
                  {item.note ? (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                      {item.note}
                    </p>
                  ) : null}
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
