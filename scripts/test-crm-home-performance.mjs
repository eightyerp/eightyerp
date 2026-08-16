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
checkNot(homePage, "getTodayWorkBundle", "CRM home does not reload full ERP today-work bundle");
checkNot(homePage, "getCustomers({", "CRM home avoids heavy shared customer list query");

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

console.log("PASS: EIGHTY CRM home performance guard complete");
