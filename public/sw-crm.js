const CRM_SCOPE = "/crm";
const ALLOWED_PUSH_PATH_PREFIXES = ["/crm", "/customers/"];

function safePushUrl(value) {
  if (typeof value !== "string") return CRM_SCOPE;
  return ALLOWED_PUSH_PATH_PREFIXES.some((prefix) => value.startsWith(prefix))
    ? value
    : CRM_SCOPE;
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "EIGHTY CRM";
  const options = {
    body: payload.body || "확인할 CRM 알림이 있습니다.",
    icon: "/pwa/eighty-icon-192.png",
    badge: "/pwa/eighty-icon-192.png",
    tag: payload.tag || undefined,
    renotify: Boolean(payload.renotify),
    data: {
      url: safePushUrl(payload.url),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = safePushUrl(event.notification.data?.url);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const sameOriginClient = clients.find((client) => {
        try {
          const url = new URL(client.url);
          return url.pathname.startsWith(CRM_SCOPE);
        } catch {
          return false;
        }
      });

      if (sameOriginClient) {
        if ("navigate" in sameOriginClient) {
          return sameOriginClient.navigate(targetUrl).then(() => sameOriginClient.focus());
        }
        return sameOriginClient.focus();
      }

      return self.clients.openWindow(targetUrl);
    }),
  );
});
