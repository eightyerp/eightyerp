import assert from "node:assert/strict";
import {
  buildCustomerSearchFilter,
  buildCustomerSearchHref,
  CUSTOMER_LIST_COLUMNS,
  CUSTOMER_LIST_PAGE_SIZE,
  CUSTOMER_LIST_SELECT,
  CUSTOMER_SEARCH_DEBOUNCE_MS,
  normalizeCustomerSearchTerm,
} from "../lib/crm/customer-list-query";
import { buildCustomerPaginationHref } from "../components/customers/CustomerPagination";
import fs from "node:fs";

assert.equal(CUSTOMER_LIST_PAGE_SIZE, 50);
assert.equal(CUSTOMER_SEARCH_DEBOUNCE_MS, 300);
assert.equal(CUSTOMER_LIST_COLUMNS.length, 13);
assert.ok(!CUSTOMER_LIST_SELECT.includes("*"), "목록 query에서 select('*') 금지");

assert.equal(normalizeCustomerSearchTerm("  홍길동%_,()  "), "홍길동");

const baseFilter = buildCustomerSearchFilter("홍길동", []);
assert.ok(baseFilter.includes("name.ilike.%홍길동%"));
assert.ok(baseFilter.includes("phone.ilike.%홍길동%"));
assert.ok(baseFilter.includes("address.ilike.%홍길동%"));
assert.ok(!baseFilter.includes("id.in"));

const projectFilter = buildCustomerSearchFilter("현장", ["customer-1", "customer-1", "customer-2"]);
assert.ok(projectFilter.includes("id.in.(customer-1,customer-2)"));

assert.equal(
  buildCustomerSearchHref("status=신규&page=3", " 홍길동 "),
  "/customers?status=%EC%8B%A0%EA%B7%9C&q=%ED%99%8D%EA%B8%B8%EB%8F%99",
);
assert.equal(buildCustomerSearchHref("q=홍길동&page=2", ""), "/customers");

assert.equal(buildCustomerPaginationHref(1, { q: "홍길동" }), "/customers?q=%ED%99%8D%EA%B8%B8%EB%8F%99");
assert.equal(buildCustomerPaginationHref(2, { q: "홍길동" }), "/customers?q=%ED%99%8D%EA%B8%B8%EB%8F%99&page=2");

const customersSource = fs.readFileSync("lib/crm/customers.ts", "utf8");
const pageSource = fs.readFileSync("app/customers/page.tsx", "utf8");
const tableSource = fs.readFileSync("components/customers/CustomerTable.tsx", "utf8");

assert.ok(customersSource.includes("requireCustomerAccess()"), "권한 범위 유지");
assert.ok(customersSource.includes("assigned_employee_id"), "담당 고객 범위 유지");
assert.ok(customersSource.includes('from("projects")'), "현장명 검색 유지");
assert.ok(pageSource.includes("Promise.allSettled"), "독립 조회 병렬 및 부분 실패 fallback");
assert.ok(pageSource.includes("lookupWarning"), "담당자/유입경로 조회 실패 fallback");
assert.ok(pageSource.includes("CustomerPagination"), "pagination 유지");
assert.ok(tableSource.includes("customers.length === 0"), "빈 결과 상태 유지");
assert.ok(tableSource.includes("customer.employees"), "담당 직원 표시 유지");

console.log("PASS: customer list query contract");
