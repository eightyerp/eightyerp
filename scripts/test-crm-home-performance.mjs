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

const quotesPage = read("app/crm/quotes/page.tsx");
check(quotesPage, "listCrmMobileQuotes", "CRM quotes uses dedicated mobile quote query");
check(quotesPage, "prefetch={false}", "CRM quote cards do not prefetch many dynamic quote routes");
checkNot(quotesPage, "listQuotesPage", "CRM quotes avoids large ERP quote list query");
checkNot(quotesPage, "getScheduleAccess", "CRM quote page avoids separate schedule-access waterfall");
const quoteDetailPage = read("app/crm/quotes/[id]/page.tsx");
check(quoteDetailPage, "getCrmMobileQuoteDetail", "CRM quote detail uses lightweight summary query");
checkNot(quoteDetailPage, "getQuoteById", "CRM quote detail avoids full ERP quote items/files query");
check(quoteDetailPage, "prefetch={false}", "CRM quote detail avoids prefetching heavy ERP/customer detail routes");
const quoteQuery = read("lib/crm/crm-mobile-quotes.ts");
check(quoteQuery, "CRM_QUOTE_PAGE_SIZE = 30", "CRM quote list is bounded to 30 rows");
check(quoteQuery, 'select("id")', "manager quote scope fetches only employee ids");
check(quoteQuery, "access.isAdmin", "admin quote list skips employee-scope lookup");
check(quoteQuery, "access.role === \"manager\"", "manager quote scope stays team-aware");
check(quoteQuery, "customer_total_amount, created_at", "CRM quote list selects visible quote fields");
check(quoteQuery, "getCrmMobileQuoteDetail", "CRM quote detail query is isolated from ERP detail loader");
checkNot(quoteQuery, "select(QUOTE_LIST_SELECT", "CRM quote list does not execute heavy ERP select");
checkNot(quoteQuery, "listEmployeesInScope", "CRM quote list does not load full employee objects");
checkNot(quoteQuery, "quote_items", "CRM quote query does not embed quote items");
checkNot(quoteQuery, "quote_files", "CRM quote query does not embed quote files");
checkNot(quoteQuery, 'select("*")', "CRM quote query never selects all quote columns");

const detailPage = read("app/crm/customers/[id]/page.tsx");
check(detailPage, "getCrmCustomerDetail", "CRM customer detail uses lightweight customer header query");
check(detailPage, "listCrmCustomerUpcomingSchedules", "CRM customer detail only loads bounded upcoming schedules");
check(detailPage, "listCrmCustomerRecentConsults", "CRM customer detail only loads bounded recent consultations");
check(detailPage, "Suspense", "CRM customer detail streams secondary panels after fast actions");
check(detailPage, "const contractPromise =", "CRM finance summary starts in parallel without blocking first actions");
checkNot(detailPage, "getCustomerById", "CRM customer detail avoids heavy ERP customer detail query");
checkNot(detailPage, "listCustomerSchedules", "CRM customer detail avoids 800-row shared schedule query");
checkNot(detailPage, "getCustomerConsultLogs", "CRM customer detail avoids unbounded consultation query");

const detailQuery = read("lib/crm/crm-customer-detail.ts");
check(detailQuery, 'select("id, schedule_type, title, start_at, status")', "customer detail schedule query selects only visible columns");
check(detailQuery, 'in("status", [...OPEN_SCHEDULE_STATUSES])', "customer detail schedule query only reads open schedules");
check(detailQuery, ".limit(safeLimit)", "customer detail secondary queries are bounded");
check(detailQuery, 'select("id, consult_type, consult_content, next_contact_date, created_at")', "customer detail consult query selects only visible columns");
checkNot(detailQuery, 'select("*")', "customer detail lightweight queries never select all columns");

const newCustomerPage = read("app/crm/customers/new/page.tsx");
check(newCustomerPage, "access.isAdmin ? getEmployees() : Promise.resolve([])", "staff new-customer screen skips full employee list");
check(newCustomerPage, "const leadSourcesPromise = getLeadSources()", "new-customer lookup begins without avoidable waterfall");

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
