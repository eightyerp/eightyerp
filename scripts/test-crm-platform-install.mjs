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
check(manifest, '"id": "/crm"', "CRM PWA identity is stable across Android/iPhone updates");
check(manifest, '"display": "standalone"', "CRM installs as standalone app");
check(manifest, '"orientation": "portrait"', "CRM keeps phone-first portrait mode");

const pushCard = read("components/crm/CrmPushSetupCard.tsx");
check(pushCard, '"install_required"', "iPhone pre-install state is explicit");
check(pushCard, "isIosDevice", "CRM detects iPhone/iPad platform");
check(pushCard, "isStandaloneApp", "CRM detects installed Home Screen app mode");
check(pushCard, "iPhone에서는 먼저 Safari", "iPhone explains Home Screen install before push");
check(pushCard, 'href="/crm/install"', "iPhone push setup links to install guide");

const installPage = read("app/crm/install/page.tsx");
check(installPage, "Android · Chrome", "Android installation guide exists");
check(installPage, "iPhone · Safari", "iPhone installation guide exists");
check(installPage, "Play 스토어 설치 없이", "Android no-store install is explained");
check(installPage, "App Store는 필요 없지만", "iPhone no-App-Store install is explained");
check(installPage, "웹 앱으로 열기", "iPhone web-app mode is explicitly guided");

console.log("PASS: EIGHTY CRM Android/iPhone install contract complete");
