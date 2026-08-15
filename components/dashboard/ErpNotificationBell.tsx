"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getMyCollectionNotificationsAction } from "@/app/actions/collections";
import { getMyCustomerPushesAction } from "@/app/actions/customer-push";
import { getMyExpenseNotificationsAction } from "@/app/actions/expenses";
import {
  COLLECTION_PAYMENT_LABELS,
  COLLECTION_TYPE_LABELS,
  type CollectionNotificationItem,
} from "@/lib/crm/collection-shared";
import type { CustomerPushItem } from "@/lib/crm/customer-push";
import type { ExpenseNotificationItem } from "@/lib/crm/expense-shared";

type NotificationItem =
  | { kind: "customer"; createdAt: string; item: CustomerPushItem }
  | { kind: "collection"; createdAt: string; item: CollectionNotificationItem }
  | { kind: "expense"; createdAt: string; item: ExpenseNotificationItem };

type CachedNotifications = {
  savedAt: number;
  items: NotificationItem[];
};

const CACHE_KEY = "eighty-erp:notifications:v1";
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const OPEN_REFRESH_MS = 30 * 1000;

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paymentLabel(value: string): string {
  return COLLECTION_PAYMENT_LABELS[
    value as keyof typeof COLLECTION_PAYMENT_LABELS
  ] ?? value;
}

function collectionTypeLabel(value: string): string {
  return COLLECTION_TYPE_LABELS[
    value as keyof typeof COLLECTION_TYPE_LABELS
  ] ?? value;
}

function readCache(): CachedNotifications | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedNotifications;
    if (!Array.isArray(parsed.items) || !Number.isFinite(parsed.savedAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(items: NotificationItem[], savedAt: number) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ savedAt, items } satisfies CachedNotifications),
    );
  } catch {
    // 저장공간이 막힌 환경에서도 알림 기능 자체는 유지합니다.
  }
}

export default function ErpNotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    const cached = readCache();
    if (!cached) return;
    const timer = window.setTimeout(() => {
      setItems(cached.items);
      setLoadedAt(cached.savedAt);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const [customers, collections, expenses] = await Promise.all([
        getMyCustomerPushesAction(),
        getMyCollectionNotificationsAction(),
        getMyExpenseNotificationsAction(),
      ]);
      const merged: NotificationItem[] = [
        ...customers.map((item) => ({
          kind: "customer" as const,
          createdAt: item.createdAt,
          item,
        })),
        ...collections.map((item) => ({
          kind: "collection" as const,
          createdAt: item.createdAt,
          item,
        })),
        ...expenses.map((item) => ({
          kind: "expense" as const,
          createdAt: item.createdAt,
          item,
        })),
      ]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 20);
      const now = Date.now();
      setItems(merged);
      setLoadedAt(now);
      writeCache(merged, now);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const stale = loadedAt === null || Date.now() - loadedAt > CACHE_MAX_AGE_MS;
    if (stale) void load();
    const interval = window.setInterval(() => void load(), OPEN_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [open, loadedAt, load]);

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

  const cutoff = (loadedAt ?? 0) - 24 * 60 * 60 * 1000;
  const recentCount = loadedAt === null
    ? 0
    : items.filter(
        (item) => new Date(item.createdAt).getTime() >= cutoff,
      ).length;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        aria-label="ERP 알림"
        aria-expanded={open}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {recentCount > 0 ? (
          <span className="absolute right-1 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">
            {recentCount > 9 ? "9+" : recentCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-[min(23rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-900">ERP 알림</p>
              <p className="mt-0.5 text-xs text-slate-500">상세 알림은 벨을 열 때 불러옵니다.</p>
            </div>
            {loading ? (
              <span className="text-[11px] font-bold text-sky-700">새로고침 중...</span>
            ) : (
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-black text-slate-600 hover:bg-slate-50"
              >
                새로고침
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm font-semibold text-slate-500">알림을 불러오는 중입니다.</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">새 알림이 없습니다.</p>
            ) : (
              items.map((notification) => {
                if (notification.kind === "customer") {
                  const item = notification.item;
                  return (
                    <Link
                      key={`customer-${item.id}`}
                      href={`/customers/${item.customerId}`}
                      onClick={() => setOpen(false)}
                      className="block border-b border-gray-100 px-4 py-3 hover:bg-sky-50/60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-sky-700">고객정보 PUSH</p>
                          <p className="mt-0.5 truncate text-sm font-bold text-slate-950">{item.customerName}</p>
                          <p className="text-xs text-slate-600">{item.phone || "연락처 없음"}</p>
                        </div>
                        <span className="shrink-0 text-[11px] text-slate-400">{formatTime(item.createdAt)}</span>
                      </div>
                    </Link>
                  );
                }

                if (notification.kind === "collection") {
                  const item = notification.item;
                  const isRequest = item.eventType === "collection_reported";
                  return (
                    <Link
                      key={`collection-${item.id}`}
                      href="/finance/collections"
                      onClick={() => setOpen(false)}
                      className={`block border-b border-gray-100 px-4 py-3 ${isRequest ? "hover:bg-amber-50" : "hover:bg-emerald-50"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`text-xs font-bold ${isRequest ? "text-amber-800" : "text-emerald-700"}`}>
                            {isRequest ? "수금 확인 요청" : "수금 확정"}
                          </p>
                          <p className="mt-0.5 truncate text-sm font-bold text-slate-950">
                            {item.customerName} · {Number(item.amount).toLocaleString("ko-KR")}원
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            {collectionTypeLabel(item.collectionType)} · {paymentLabel(item.paymentMethod)}
                            {isRequest && item.reporterName ? ` · ${item.reporterName} 등록` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] text-slate-400">{formatTime(item.createdAt)}</span>
                      </div>
                    </Link>
                  );
                }

                const item = notification.item;
                const isRequest = item.eventType === "expense_requested";
                const isPaid = item.eventType === "expense_paid";
                return (
                  <Link
                    key={`expense-${item.id}`}
                    href="/finance/payments"
                    onClick={() => setOpen(false)}
                    className={`block border-b border-gray-100 px-4 py-3 ${isRequest ? "hover:bg-amber-50" : isPaid ? "hover:bg-emerald-50" : "hover:bg-sky-50"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`text-xs font-bold ${isRequest ? "text-amber-800" : isPaid ? "text-emerald-700" : "text-sky-700"}`}>
                          {isRequest ? "지출 승인 요청" : isPaid ? "지출 지급완료" : "지출 승인"}
                        </p>
                        <p className="mt-0.5 truncate text-sm font-bold text-slate-950">
                          {item.vendorName || "거래처"} · {Number(item.amount).toLocaleString("ko-KR")}원
                        </p>
                        <p className="mt-1 line-clamp-1 text-xs text-slate-600">
                          {item.description}{isRequest && item.requesterName ? ` · ${item.requesterName} 신청` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] text-slate-400">{formatTime(item.createdAt)}</span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
