import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function check(content, needle, label) {
  if (!content.includes(needle)) {
    throw new Error(`FAIL: ${label} — missing ${JSON.stringify(needle)}`);
  }
  console.log(`PASS: ${label}`);
}

function checkNot(content, needle, label) {
  if (content.includes(needle)) {
    throw new Error(`FAIL: ${label} — found forbidden ${JSON.stringify(needle)}`);
  }
  console.log(`PASS: ${label}`);
}

const homePage = read("app/crm/page.tsx");
check(homePage, "getCrmMobileHomeBundle", "CRM home uses dedicated lightweight bundle");
check(homePage, "listCrmMobileCustomers", "CRM home new-customer count uses lightweight customer query");
check(homePage, "employeeId: employeeId ?? undefined", "CRM home keeps explicit assignee scope for admin users");
check(homePage, "Suspense", "CRM home streams slower work data behind fast shell");
check(homePage, "const bundlePromise =", "CRM home starts bundle work without blocking shell rendering");
checkNot(homePage, "getTodayWorkBundle", "CRM home does not reload full ERP today-work bundle");
checkNot(homePage, "getCustomers({", "CRM home avoids heavy shared customer list query");

const schedulesPage = read("app/crm/schedules/page.tsx");
check(schedulesPage, "getCrmMobileHomeBundle", "CRM schedule screen uses bounded CRM bundle");
check(schedulesPage, 'focus === "next_action"', "next-action focus has a dedicated lightweight path");
checkNot(schedulesPage, "getTodayWorkBundle", "CRM schedule screen avoids heavy ERP today-work bundle");

const customerCard = read("components/crm/CrmCustomerCard.tsx");
check(customerCard, "prefetch={false}", "customer cards do not prefetch many dynamic customer routes");
const todayWorkList = read("components/crm/CrmTodayWorkList.tsx");
check(todayWorkList, "prefetch={false}", "today-work cards do not prefetch dynamic customer/schedule routes");
const loading = read("app/crm/loading.tsx");
check(loading, "animate-pulse", "CRM navigation gives immediate loading feedback");

const homeQuery = read("lib/crm/crm-mobile-home.ts");
check(homeQuery, 'limit(100)', "CRM home schedule/customer query has bounded result sets");
check(homeQuery, 'limit(50)', "CRM home contact/quote query has small bounded result sets");
check(homeQuery, 'select(SCHEDULE_SELECT, { count: "exact" })', "overdue count stays exact without loading all schedules");
check(homeQuery, 'in("status", ACTIVE_SCHEDULE_STATUSES)', "CRM home only loads active overdue schedules");
check(homeQuery, 'gte("start_at", startIso)', "today schedule query is bounded by Korea-day start");
check(homeQuery, 'lte("start_at", endIso)', "today schedule query is bounded by Korea-day end");
check(homeQuery, 'in("status", ACTIVE_QUOTE_STATUSES)', "CRM home avoids loading terminal quote history");
check(homeQuery, 'customer_schedules', "quote follow-up check reuses schedule data server-side");
checkNot(homeQuery, '.limit(800)', "CRM home never loads 800 schedules");
checkNot(homeQuery, '.limit(500)', "CRM home never loads 500 quotes");

const nextAction = read("lib/crm/next-action.ts");
check(nextAction, "next_contact_at.is.null", "next-action query filters missing contact dates in DB");
check(nextAction, "next_contact_at.lt.", "next-action query filters overdue contact dates in DB");
check(nextAction, 'select("customer_id")', "next-action schedule check fetches only customer ids");
check(nextAction, 'in("status", [...OPEN_SCHEDULE_STATUSES])', "next-action query loads only open schedules");
checkNot(nextAction, '.limit(500)', "next-action query no longer loads 500 mixed schedules");

console.log("PASS: EIGHTY CRM Core performance guard complete");
