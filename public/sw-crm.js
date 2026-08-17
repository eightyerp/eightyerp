const CRM_SCOPE = "/crm";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Gate A는 설치형 CRM Core만 담당한다.
// PUSH 구독/수신/딥링크는 Gate B에서 별도 검증 후 추가한다.
