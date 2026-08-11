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
assert.match(
  QUOTE_LIST_SELECT,
  /customers:customers!quotes_customer_id_fkey \( id, name, phone, address, assigned_employee_id, status \)/,
  "회사 범위 복합 FK와 기존 FK가 함께 있어 고객 관계를 명시해야 합니다.",
);
assert.match(
  QUOTE_LIST_SELECT,
  /employees \( id, name, title, team_id, teams \( name \) \)/,
);

const querySource = readFileSync("lib/crm/quote-mgmt.ts", "utf8");
assert.match(querySource, /\.range\(from, from \+ QUOTE_LIST_PAGE_SIZE - 1\)/);
assert.match(querySource, /\.select\(QUOTE_LIST_SELECT, \{ count: "exact" \}\)/);
assert.match(querySource, /created_by\.eq/);
assert.match(querySource, /assigned_employee_id\.in/);
assert.match(querySource, /customer_id\.in/);
assert.match(
  querySource,
  /customers:customers!quotes_customer_id_fkey/,
  "견적 상세 조회도 명시된 고객 FK를 사용해야 합니다.",
);

const contractSource = readFileSync("lib/crm/contracts.ts", "utf8");
assert.match(contractSource, /customers:customers!contracts_customer_id_fkey/);
assert.match(contractSource, /projects:projects!contracts_project_id_fkey/);

const projectSource = readFileSync("lib/crm/projects.ts", "utf8");
assert.match(projectSource, /customers:customers!projects_customer_id_fkey/);

for (const [file, source, ambiguousRelation] of [
  ["lib/crm/quote-mgmt.ts", querySource, /(^|[,(]\s*)customers\s*\(/m],
  ["lib/crm/contracts.ts", contractSource, /(^|[,(]\s*)(customers|projects)\s*\(/m],
  ["lib/crm/projects.ts", projectSource, /(^|[,(]\s*)customers\s*\(/m],
] as const) {
  assert.doesNotMatch(
    source,
    ambiguousRelation,
    `${file}: 모호한 PostgREST 자동 관계 선택을 사용할 수 없습니다.`,
  );
}

const listSource = readFileSync("components/quotes/QuotesList.tsx", "utf8");
assert.match(listSource, /params\.delete\("page"\)/, "검색/필터 변경 시 page를 초기화해야 합니다.");
assert.match(listSource, /QUOTE_SEARCH_DEBOUNCE_MS/);

console.log("quotes performance contract: PASS");
