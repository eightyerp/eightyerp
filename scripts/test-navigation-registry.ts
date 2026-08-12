import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  NAVIGATION_REGISTRY,
  filterNavigation,
  getActiveNavigationItemId,
  isNavigationRouteActive,
} from "../lib/modules/navigation";
import { ERP_MODULE_IDS, ERP_MODULES } from "../lib/modules/registry";

const appDirectory = path.join(process.cwd(), "app");
const pageFiles: string[] = [];

function collectPageFiles(directory: string) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectPageFiles(entryPath);
    if (entry.isFile() && entry.name === "page.tsx") pageFiles.push(entryPath);
  }
}

function pageFileToRoutePattern(pageFile: string) {
  const segments = path
    .relative(appDirectory, path.dirname(pageFile))
    .split(path.sep)
    .filter((segment) => segment && !segment.startsWith("(") && !segment.startsWith("@"));

  const pattern = segments.map((segment) => {
    if (/^\[\[\.\.\..+\]\]$/.test(segment)) return "(?:/.*)?";
    if (/^\[\.\.\..+\]$/.test(segment)) return "/.+";
    if (/^\[.+\]$/.test(segment)) return "/[^/]+";
    return `/${segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
  }).join("");

  return new RegExp(`^${pattern || "/"}$`);
}

function isExternalRoute(route: string) {
  return /^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(route);
}

collectPageFiles(appDirectory);
const appRoutePatterns = pageFiles.map(pageFileToRoutePattern);
const items = NAVIGATION_REGISTRY.flatMap((group) => group.items);
const readyItems = items.filter((item) => item.status !== "coming_soon");
const internalReadyItems = readyItems.filter(
  (item) => item.route && item.route.startsWith("/") && !isExternalRoute(item.route),
);

assert.equal(new Set(ERP_MODULE_IDS).size, ERP_MODULE_IDS.length, "모듈 ID는 중복될 수 없음");
assert.equal(ERP_MODULES.length, ERP_MODULE_IDS.length, "모든 모듈 정의 필요");
assert.equal(new Set(items.map((item) => item.id)).size, items.length, "메뉴 ID는 중복될 수 없음");

for (const item of items) {
  assert.ok(ERP_MODULE_IDS.includes(item.moduleId), `${item.id}: 유효한 moduleId 필요`);
  if (item.status === "coming_soon") {
    assert.equal(item.route, null, `${item.id}: coming_soon 메뉴는 클릭 route를 가질 수 없음`);
  }
}

const missingReadyRoutes = internalReadyItems.filter((item) => {
  const pathname = new URL(item.route!, "https://navigation.test").pathname;
  return !appRoutePatterns.some((pattern) => pattern.test(pathname));
});

assert.deepEqual(
  missingReadyRoutes.map((item) => ({ id: item.id, route: item.route })),
  [],
  "모든 ready 내부 route는 실제 Next.js app route와 일치해야 함",
);

function navigationLabels(
  role: Parameters<typeof filterNavigation>[0],
  companyRole: Parameters<typeof filterNavigation>[2],
) {
  return filterNavigation(role, new Set(), companyRole)
    .flatMap((group) => group.items.map((item) => item.label));
}

for (const companyRole of ["owner", "director"] as const) {
  const labels = navigationLabels("admin", companyRole);
  for (const label of ["내 정보", "직원 Master", "계정 재연결", "직원 초대", "수금관리", "지출관리", "월 마감"]) {
    assert.ok(labels.includes(label), `${companyRole}: ${label} 메뉴 필요`);
  }
}

const companyAdminLabels = navigationLabels("admin", "admin");
for (const label of ["내 정보", "직원 Master", "직원 초대", "수금관리", "지출관리"]) {
  assert.ok(companyAdminLabels.includes(label), `admin: ${label} 메뉴 필요`);
}
assert.ok(!companyAdminLabels.includes("계정 재연결"));

for (const [role, companyRole] of [
  ["manager", "manager"],
  ["staff", "employee"],
] as const) {
  const labels = navigationLabels(role, companyRole);
  for (const label of ["내 정보", "직원 Master", "수금관리", "지출관리"]) {
    assert.ok(labels.includes(label), `${companyRole}: ${label} 메뉴 필요`);
  }
  assert.ok(!labels.includes("계정 재연결"));
  assert.ok(!labels.includes("직원 초대"));
  assert.ok(!labels.includes("월 마감"));
}

assert.ok(isNavigationRouteActive("/quotes/abc", "/quotes"));
assert.ok(!isNavigationRouteActive("/customers", "/quotes"));
assert.ok(isNavigationRouteActive("/me", "/me", new URLSearchParams(), "exact"));
assert.ok(isNavigationRouteActive("/finance/collections", "/finance/collections"));
assert.ok(isNavigationRouteActive("/finance/payments", "/finance/payments"));
assert.equal(
  getActiveNavigationItemId(items, "/quotes/new", new URLSearchParams("type=interior")),
  "interior-quote",
  "query route active 판정 유지",
);
assert.equal(
  getActiveNavigationItemId(items, "/me", new URLSearchParams()),
  "my-profile",
  "내 정보 메뉴 active 판정 유지",
);
assert.equal(
  getActiveNavigationItemId(items, "/finance/collections", new URLSearchParams()),
  "finance-collections",
  "수금관리 메뉴 active 판정 유지",
);
assert.equal(
  getActiveNavigationItemId(items, "/finance/payments", new URLSearchParams()),
  "finance-payments",
  "지출관리 메뉴 active 판정 유지",
);

for (const route of ["/me", "/schedules/customers", "/schedules/processes", "/finance/collections", "/finance/payments"]) {
  assert.ok(internalReadyItems.some((item) => item.route === route), `${route}: ready route 필요`);
}
assert.ok(!internalReadyItems.some((item) => item.route === "/schedules"));

console.log(
  `PASS: ${ERP_MODULES.length} modules, ${NAVIGATION_REGISTRY.length} groups, ${readyItems.length} ready routes, ${missingReadyRoutes.length} missing ready routes`,
);
