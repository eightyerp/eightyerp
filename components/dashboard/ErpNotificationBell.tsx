"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getMyCollectionNotificationsAction } from "@/app/actions/collections";
import { getMyCustomerPushesAction } from "@/app/actions/customer-push";
import {
  COLLECTION_PAYMENT_LABELS,
  COLLECTION_TYPE_LABELS,
  type CollectionNotificationItem,
} from "@/lib/crm/collection-shared";
import type { CustomerPushItem } from "@/lib/crm/customer-push";

type NotificationItem =
  | { kind: "customer"; createdAt: string; item: CustomerPushItem }
  | { kind: "collection"; createdAt: string; item: CollectionNotificationItem };

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

export default function ErpNotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [customers, collections] = await Promise.all([
        getMyCustomerPushesAction(),
        getMyCollectionNotificationsAction(),
      ]);
      if (cancelled) return;
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
      ]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 15);
      setItems(merged);
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

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recentCount = items.filter(
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
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">ERP 알림</p>
            <p className="mt-0.5 text-xs text-slate-500">고객 PUSH와 수금 알림을 확인합니다.</p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
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
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
