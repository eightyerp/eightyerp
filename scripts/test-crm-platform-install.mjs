import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}
function check(content, needle, label) {
  if (!content.includes(needle)) {
    throw new Error(`FAIL: ${label} — missing ${JSON.stringify(needle)}`);
  }
  console.log(`PASS: ${label}`);
}

const manifest = read("public/crm-manifest.webmanifest");
check(manifest, '"id": "/crm"', "CRM PWA identity stays stable");
check(manifest, '"display": "standalone"', "CRM installs as standalone app");
check(manifest, '"orientation": "portrait"', "CRM keeps phone-first portrait mode");

const installPage = read("app/crm/install/page.tsx");
check(installPage, "Android · Chrome", "Android installation guide exists");
check(installPage, "iPhone · Safari", "iPhone installation guide exists");
check(installPage, "Play 스토어 설치 없이", "Android PWA installation is explained");
check(installPage, "App Store는 필요 없지만", "iPhone PWA installation is explained");
check(installPage, "웹 앱으로 열기", "iPhone standalone web-app mode is guided");

const serviceWorkerRegistration = read("components/crm/CrmServiceWorkerRegistration.tsx");
check(serviceWorkerRegistration, '.register("/sw-crm.js", { scope: "/crm" })', "CRM service worker stays scoped to /crm");

const serviceWorker = read("public/sw-crm.js");
check(serviceWorker, "self.skipWaiting()", "CRM service worker activates quickly");
check(serviceWorker, "self.clients.claim()", "CRM service worker takes control after activation");

console.log("PASS: EIGHTY CRM Android/iPhone Core install contract complete");
