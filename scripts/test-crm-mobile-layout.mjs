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

const layout = read("app/crm/layout.tsx");
check(layout, 'width: "device-width"', "CRM viewport follows device width");
check(layout, "initialScale: 1", "CRM viewport keeps 1x initial scale");
check(layout, 'viewportFit: "cover"', "CRM supports iPhone safe-area viewport");

const shell = read("components/crm/CrmShell.tsx");
check(shell, "min-h-dvh", "CRM shell uses dynamic mobile viewport height");
check(shell, "pt-[env(safe-area-inset-top)]", "CRM header respects iPhone top safe area");
check(shell, "pb-[env(safe-area-inset-bottom)]", "CRM bottom nav respects home indicator safe area");
check(shell, "max-w-3xl", "CRM content width remains bounded on large screens");
check(shell, "min-w-0", "CRM header allows content to shrink without horizontal overflow");
check(shell, "grid-cols-5", "CRM bottom navigation stays five compact actions");

const customerCard = read("components/crm/CrmCustomerCard.tsx");
check(customerCard, "min-w-0", "customer card text can shrink on narrow phones");
check(customerCard, "truncate", "customer card protects long names/addresses from overflow");
check(customerCard, "grid-cols-3", "customer card primary actions remain compact");
check(customerCard, "grid-cols-2", "customer card secondary actions remain touchable");

const customerList = read("app/crm/customers/page.tsx");
check(customerList, "min-w-0", "date/search controls can shrink on narrow phones");
check(customerList, "overflow-x-auto", "pipeline/status chips scroll instead of breaking layout");

const newCustomer = read("components/crm/CrmNewCustomerForm.tsx");
check(newCustomer, "w-full", "new customer inputs/buttons use mobile full width");
check(newCustomer, "min-h-11", "new customer controls keep touch-friendly height");

const newSchedule = read("app/crm/customers/[id]/schedule/new/page.tsx");
check(newSchedule, "w-full", "schedule controls use mobile full width");
check(newSchedule, "rounded-2xl", "schedule action keeps mobile card layout");

const notifications = read("app/crm/notifications/page.tsx");
check(notifications, "min-w-0", "notification cards handle long content on small screens");
check(notifications, "truncate", "notification headings cannot force horizontal overflow");

console.log("PASS: EIGHTY CRM mobile layout guard complete");
