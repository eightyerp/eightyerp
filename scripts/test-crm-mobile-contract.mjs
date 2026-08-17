import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function check(content, needle, label) {
  if (!content.includes(needle)) {
    throw new Error(`FAIL: ${label} — missing ${JSON.stringify(needle)}`);
  }
  console.log(`PASS: ${label}`);
}

function checkMissing(relativePath, label) {
  if (exists(relativePath)) {
    throw new Error(`FAIL: ${label} — ${relativePath} must stay outside Gate A`);
  }
  console.log(`PASS: ${label}`);
}

const manifest = read("public/crm-manifest.webmanifest");
check(manifest, '"name": "EIGHTY CRM"', "CRM PWA name is fixed");
check(manifest, '"start_url": "/crm"', "CRM PWA starts at /crm");
check(manifest, '"scope": "/crm"', "CRM PWA scope stays isolated");
check(manifest, '"display": "standalone"', "CRM remains installable app shell");

const shell = read("components/crm/CrmShell.tsx");
check(shell, 'href="/crm/customers/new"', "new customer registration stays inside CRM");
check(shell, '{ href: "/crm/customers",', "customer work remains a primary navigation item");
check(shell, '{ href: "/crm/schedules",', "schedule work remains a primary navigation item");
check(shell, '{ href: "/crm/quotes",', "quote work remains a primary navigation item");

const mobileAction = read("app/actions/crm-mobile.ts");
check(mobileAction, "createCrmCustomerAction", "mobile customer registration action exists");
check(mobileAction, "createCrmScheduleAction", "mobile schedule registration action exists");
check(mobileAction, "findCustomerScheduleConflicts", "mobile scheduling checks conflicts");
check(mobileAction, "SCHEDULE_STAGE_TARGET", "schedule types drive stage progression");
check(mobileAction, '방문상담: "방문예약"', "visit schedule advances stage");
check(mobileAction, '실측: "실측예약"', "survey schedule advances stage");
check(mobileAction, '견적작성: "견적작성중"', "quote-work schedule advances stage");
check(mobileAction, '계약상담: "계약협의"', "contract consultation advances stage");
check(mobileAction, "saveCrmConsultationAction", "consultation action exists");
check(mobileAction, "updateCrmCustomerStatusAction", "quick status action exists");
check(mobileAction, 'customer.status === "신규"', "first consultation auto-advances new customer");
check(mobileAction, '"1차 연락완료"', "first-contact transition is preserved");
check(mobileAction, '"계약"', "legacy contract status is preserved");
check(mobileAction, "createCustomerSchedule", "next contact creates a real schedule");

const assigneeAction = read("app/actions/crm-assignee.ts");
check(assigneeAction, "updateCrmCustomerAssigneeAction", "mobile assignee action exists");
check(assigneeAction, "change_assignee: true", "assignee action reuses secured logic");

const newCustomerPage = read("app/crm/customers/new/page.tsx");
check(newCustomerPage, "CrmNewCustomerForm", "compact customer registration screen exists");

const newSchedulePage = read("app/crm/customers/[id]/schedule/new/page.tsx");
check(newSchedulePage, "createCrmScheduleAction", "in-app schedule registration exists");
check(newSchedulePage, 'query.conflict === "1"', "schedule conflict feedback is visible");

const statusPage = read("app/crm/customers/[id]/status/page.tsx");
check(statusPage, "계약 (기존)", "legacy contract state is visible");

const assigneePage = read("app/crm/customers/[id]/assignee/page.tsx");
check(assigneePage, "담당자 배정", "customer can be assigned inside CRM");

const mobileCustomerList = read("lib/crm/crm-mobile-customer-list.ts");
check(mobileCustomerList, 'timeZone: "Asia/Seoul"', "today filter uses Korea timezone");
check(mobileCustomerList, 'T00:00:00+09:00', "period starts at KST midnight");
check(mobileCustomerList, 'T23:59:59.999+09:00', "period ends at KST day end");
check(mobileCustomerList, "pageSize ?? 30", "customer list keeps small page size");

const customerCard = read("components/crm/CrmCustomerCard.tsx");
check(customerCard, "/schedule/new", "customer card exposes schedule action");
check(customerCard, "/status", "customer card exposes status action");
check(customerCard, "D+", "customer card keeps received-age visibility");

const homePage = read("app/crm/page.tsx");
check(homePage, "Suspense", "CRM home streams slower data behind fast shell");
check(homePage, "bundlePromise", "CRM home starts work in parallel");

for (const excluded of [
  "app/actions/crm-push-subscription.ts",
  "components/crm/CrmPushSetupCard.tsx",
  "mobile/crm-android-twa/twa-manifest.json",
  "supabase/functions/crm-push-delivery/index.ts",
  "supabase/migrations/20260816090000_crm_mobile_push_foundation.sql",
  "supabase/migrations/20260816093000_crm_push_policy_completion.sql",
  "supabase/migrations/20260816110000_crm_assignment_followup.sql",
  "supabase/migrations/20260816111500_crm_unassigned_customer_alert.sql",
]) {
  checkMissing(excluded, "Gate A excludes PUSH DB/worker/Android packaging");
}

console.log("PASS: EIGHTY CRM Core Gate A contract complete");
