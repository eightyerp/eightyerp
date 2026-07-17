"use client";

import { useEffect } from "react";

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Register shell-only SW; does not cache personal/approval responses.
    navigator.serviceWorker.register("/sw-customer.js").catch(() => {
      // ignore registration failures in unsupported environments
    });
  }, []);

  return <>{children}</>;
}
