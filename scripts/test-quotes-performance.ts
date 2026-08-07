import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  QUOTE_LIST_PAGE_SIZE,
  QUOTE_LIST_SELECT,
  QUOTE_SEARCH_DEBOUNCE_MS,
} from "../lib/crm/quote-list-query";

assert.equal(QUOTE_LIST_PAGE_SIZE, 50, "견적 기본 page size는 50이어야 합니다.");
assert.equal(QUOTE_SEARCH_DEBOUNCE_MS, 300, "견적 검색 debounce는 300ms여야 합니다.");
assert.doesNotMatch(QUOTE_LIST_SELECT, /(^|[,(]\s*)\*/m, "목록 select에 *를 사용할 수 없습니다.");
assert.doesNotMatch(QUOTE_LIST_SELECT, /quote_items|quote_files/, "목록에서 items/files를 embed할 수 없습니다.");
assert.match(QUOTE_LIST_SELECT, /customers \( id, name, phone, address, assigned_employee_id, status \)/);
assert.match(QUOTE_LIST_SELECT, /employees \( id, name, title, team_id \)/);

const querySource = readFileSync("lib/crm/quote-mgmt.ts", "utf8");
assert.match(querySource, /\.range\(from, from \+ QUOTE_LIST_PAGE_SIZE - 1\)/);
assert.match(querySource, /\.select\(QUOTE_LIST_SELECT, \{ count: "exact" \}\)/);
assert.match(querySource, /created_by\.eq/);
assert.match(querySource, /assigned_employee_id\.in/);
assert.match(querySource, /customer_id\.in/);

const listSource = readFileSync("components/quotes/QuotesList.tsx", "utf8");
assert.match(listSource, /params\.delete\("page"\)/, "검색/필터 변경 시 page를 초기화해야 합니다.");
assert.match(listSource, /QUOTE_SEARCH_DEBOUNCE_MS/);

console.log("quotes performance contract: PASS");
