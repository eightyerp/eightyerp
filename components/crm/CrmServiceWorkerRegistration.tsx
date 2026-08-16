"use client";

import { useEffect } from "react";

export default function CrmServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker
      .register("/sw-crm.js", { scope: "/crm" })
      .catch(() => {
        // PWA 등록 실패가 CRM 업무 자체를 막으면 안 된다.
      });
  }, []);

  return null;
}
