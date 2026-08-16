import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function assertIncludes(content, needle, label) {
  if (!content.includes(needle)) {
    throw new Error(`FAIL: ${label} — missing ${JSON.stringify(needle)}`);
  }
  console.log(`PASS: ${label}`);
}

const manifest = read("public/crm-manifest.webmanifest");
assertIncludes(manifest, '"name": "EIGHTY CRM"', "CRM PWA name is fixed");
assertIncludes(manifest, '"start_url": "/crm"', "CRM PWA starts at /crm");
assertIncludes(manifest, '"scope": "/crm"', "CRM PWA scope stays isolated");
assertIncludes(manifest, '"display": "standalone"', "CRM remains installable app shell");

const shell = read("components/crm/CrmShell.tsx");
assertIncludes(shell, 'href="/crm/customers/new"', "new customer registration stays inside CRM PWA scope");

const mobileAction = read("app/actions/crm-mobile.ts");
assertIncludes(mobileAction, "createCrmCustomerAction", "mobile quick customer registration action exists");
assertIncludes(mobileAction, "createCrmScheduleAction", "mobile customer schedule registration action exists");
assertIncludes(mobileAction, "saveCrmConsultationAction", "mobile consultation action exists");
assertIncludes(mobileAction, "updateCrmCustomerStatusAction", "mobile status quick action exists");
assertIncludes(mobileAction, 'customer.status === "신규"', "first consultation auto-advances new customer");
assertIncludes(mobileAction, '"1차 연락완료"', "first-contact status transition is preserved");
assertIncludes(mobileAction, '"계약"', "legacy contract customer status remains writable without regression");
assertIncludes(mobileAction, '"방문상담"', "mobile scheduling supports visit consultation");
assertIncludes(mobileAction, '"실측"', "mobile scheduling supports site measurement");
assertIncludes(mobileAction, "createCustomerSchedule", "next contact and mobile scheduling create real schedules");

const newCustomerPage = read("app/crm/customers/new/page.tsx");
assertIncludes(newCustomerPage, "CrmNewCustomerForm", "CRM has compact in-app customer registration screen");

const newSchedulePage = read("app/crm/customers/[id]/schedule/new/page.tsx");
assertIncludes(newSchedulePage, "createCrmScheduleAction", "CRM has in-app customer schedule registration screen");

const statusPage = read("app/crm/customers/[id]/status/page.tsx");
assertIncludes(statusPage, "계약 (기존)", "legacy contract state is visible instead of silently resetting");

const pushFoundation = read("supabase/migrations/20260816090000_crm_mobile_push_foundation.sql");
assertIncludes(pushFoundation, "customer_assigned", "company assignment push event exists");
assertIncludes(pushFoundation, "consult_remind_1h", "1-hour reminder event exists");
assertIncludes(pushFoundation, "consult_unhandled", "+30m unhandled event exists");
assertIncludes(pushFoundation, "dedupe_key", "push dedupe foundation exists");

const stalePolicy = read("supabase/migrations/20260816093000_crm_push_policy_completion.sql");
assertIncludes(stalePolicy, "customer_stale_3d", "3-day stale customer event exists");
assertIncludes(stalePolicy, "customer_stale_7d", "7-day stale customer event exists");
assertIncludes(stalePolicy, "company_id", "stale event preserves company scope");

const assignmentFollowup = read("supabase/migrations/20260816110000_crm_assignment_followup.sql");
assertIncludes(assignmentFollowup, "customer_assignment_uncontacted_30m", "30-minute first-contact follow-up exists");
assertIncludes(assignmentFollowup, "assignment_followup_eligible", "old assignment backlog cannot replay");
assertIncludes(assignmentFollowup, "service_role", "server-assigned inbound leads create assignment alerts");
assertIncludes(assignmentFollowup, "automatic_system_assignment", "system assignment source is preserved");

const unassignedAlert = read("supabase/migrations/20260816111500_crm_unassigned_customer_alert.sql");
assertIncludes(unassignedAlert, "customer_unassigned_10m", "unassigned lead admin alert exists");
assertIncludes(unassignedAlert, "super_admin", "unassigned lead reaches administrators");

const worker = read("supabase/functions/crm-push-delivery/index.ts");
for (const eventType of [
  "customer_assigned",
  "customer_assignment_uncontacted_30m",
  "customer_unassigned_10m",
  "schedule_changed",
  "consult_remind_1h",
  "consult_unhandled",
  "customer_stale_3d",
  "customer_stale_7d",
]) {
  assertIncludes(worker, eventType, `push worker handles ${eventType}`);
}
assertIncludes(worker, "/crm/schedules/", "schedule push deep-links to mobile schedule handler");
assertIncludes(worker, 'value.startsWith("/customers/")', "admin push may deep-link to safe customer edit route");
assertIncludes(worker, "self_schedule_change", "self-created schedule change push is suppressed");

const serviceWorker = read("public/sw-crm.js");
assertIncludes(serviceWorker, '"/customers/"', "service worker permits safe same-origin customer admin deep links");

const inbox = read("lib/crm/crm-alert-inbox.ts");
assertIncludes(inbox, "listMyCrmAlerts", "unified in-app alert inbox exists");
assertIncludes(inbox, "customer_assignment_uncontacted_30m", "inbox shows first-contact misses");
assertIncludes(inbox, "customer_unassigned_10m", "inbox shows unassigned leads");
assertIncludes(inbox, "customer_stale_7d", "inbox shows long-stale customers");
assertIncludes(inbox, "self_schedule_change", "inbox hides self-generated schedule change noise");

const customerCard = read("components/crm/CrmCustomerCard.tsx");
assertIncludes(customerCard, "/schedule/new", "customer card exposes quick schedule registration");
assertIncludes(customerCard, "/status", "customer card exposes quick status action");
assertIncludes(customerCard, "D+", "customer card keeps received-age visibility");

console.log("PASS: EIGHTY CRM mobile contract guard complete");
