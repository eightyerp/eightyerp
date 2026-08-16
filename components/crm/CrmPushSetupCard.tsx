"use client";

import { useEffect, useState } from "react";
import {
  disableCrmPushSubscriptionAction,
  registerCrmPushSubscriptionAction,
} from "@/app/actions/crm-push-subscription";

type PushState =
  | "loading"
  | "unsupported"
  | "server_not_ready"
  | "off"
  | "on"
  | "denied"
  | "saving"
  | "error";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_CRM_WEB_PUSH_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export default function CrmPushSetupCard() {
  const [state, setState] = useState<PushState>("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      setState("server_not_ready");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    let cancelled = false;
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (cancelled) return;
        setState(subscription ? "on" : "off");
      })
      .catch(() => {
        if (!cancelled) setState("off");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function enablePush() {
    setMessage(null);
    if (!VAPID_PUBLIC_KEY) {
      setState("server_not_ready");
      return;
    }

    try {
      setState("saving");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const json = subscription.toJSON();
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!p256dh || !auth) {
        throw new Error("push_keys_missing");
      }

      const result = await registerCrmPushSubscriptionAction({
        endpoint: subscription.endpoint,
        p256dh,
        auth,
        userAgent: navigator.userAgent,
      });
      if (!result.success) {
        setMessage(result.error ?? "푸시 알림을 등록하지 못했습니다.");
        setState("error");
        return;
      }

      setState("on");
      setMessage("이 휴대폰에서 에잇티 CRM 알림을 받을 수 있습니다.");
    } catch {
      setState("error");
      setMessage("푸시 알림을 켜지 못했습니다. 브라우저 알림 권한을 확인해 주세요.");
    }
  }

  async function disablePush() {
    setMessage(null);
    try {
      setState("saving");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await disableCrmPushSubscriptionAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
      setMessage("이 휴대폰의 CRM 푸시 알림을 껐습니다.");
    } catch {
      setState("error");
      setMessage("푸시 알림 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  const enabled = state === "on";
  const disabled = state === "saving" || state === "loading";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black text-slate-950">휴대폰 업무 알림</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            배분 고객, 예약 1시간 전, 미연락 고객을 놓치지 않도록 알려줍니다.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${
            enabled
              ? "bg-emerald-50 text-emerald-700"
              : state === "denied"
                ? "bg-red-50 text-red-700"
                : "bg-slate-100 text-slate-600"
          }`}
        >
          {enabled ? "켜짐" : state === "denied" ? "권한차단" : "꺼짐"}
        </span>
      </div>

      {state === "unsupported" && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          이 브라우저에서는 Web Push를 사용할 수 없습니다.
        </p>
      )}
      {state === "server_not_ready" && (
        <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">
          푸시 서버 키 연결 전입니다. CRM 화면 테스트는 계속할 수 있습니다.
        </p>
      )}
      {state === "denied" && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          브라우저에서 이 사이트의 알림 권한을 허용해야 합니다.
        </p>
      )}
      {message && (
        <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${state === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {message}
        </p>
      )}

      {!enabled ? (
        <button
          type="button"
          onClick={enablePush}
          disabled={disabled || state === "unsupported" || state === "server_not_ready" || state === "denied"}
          className="mt-4 w-full rounded-xl bg-navy-900 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {state === "saving" ? "연결 중..." : "업무 알림 켜기"}
        </button>
      ) : (
        <button
          type="button"
          onClick={disablePush}
          disabled={disabled}
          className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50"
        >
          업무 알림 끄기
        </button>
      )}
    </section>
  );
}
