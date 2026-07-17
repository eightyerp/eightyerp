/* Customer PWA service worker — caches static shell only. Never caches personal/approval data. */
const CACHE = "eighty-customer-shell-v1";
const SHELL = [
  "/customer-manifest.webmanifest",
  "/pwa/eighty-icon-192.png",
  "/pwa/eighty-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never cache HTML/API/material pages (PII & approval data).
  if (
    req.method !== "GET" ||
    url.pathname.startsWith("/customer/projects/") ||
    req.headers.get("accept")?.includes("text/html")
  ) {
    return;
  }

  // Only shell assets from same origin.
  if (url.origin === self.location.origin && SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req)),
    );
  }
});
