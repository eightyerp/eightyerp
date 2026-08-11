import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildCustomerActivityContent,
  buildCustomerActivityWritePayload,
  CUSTOMER_ACTIVITY_WRITE_COLUMNS,
} from "../lib/crm/customer-schema-compat";

const payload = buildCustomerActivityWritePayload({
  customer_id: "customer-1",
  activity_type: "전화",
  content: "상담 완료",
  previous_status: "신규",
  new_status: "상담중",
  employee_id: "employee-1",
  created_by: "user-1",
});

assert.deepEqual(
  Object.keys(payload),
  [...CUSTOMER_ACTIVITY_WRITE_COLUMNS],
  "운영 customer_activities 기본 컬럼만 write",
);
assert.ok(!("result" in payload), "미적용 result 컬럼 write 금지");
assert.ok(!("next_contact_at" in payload), "미적용 next_contact_at 컬럼 write 금지");
assert.ok(
  !("previous_assignee_id" in payload) && !("new_assignee_id" in payload),
  "미적용 담당자 snapshot 컬럼 write 금지",
);

assert.equal(
  buildCustomerActivityContent({
    content: "유선 상담",
    result: "재통화 요청",
    nextContactAt: "2026-08-15",
  }),
  "유선 상담\n상담결과: 재통화 요청\n다음 연락일: 2026-08-15",
  "확장 컬럼 없이도 상담 결과와 다음 연락일을 본문에 보존",
);

const customersSource = fs.readFileSync("lib/crm/customers.ts", "utf8");
const todayWorkSource = fs.readFileSync("lib/crm/today-work.ts", "utf8");
const schedulePageSource = fs.readFileSync(
  "app/schedules/customers/page.tsx",
  "utf8",
);
const customerDetailSource = fs.readFileSync(
  "components/customers/CustomerDetailPanels.tsx",
  "utf8",
);

assert.ok(
  !customersSource.includes(".update({ last_contact_at:"),
  "운영에 없는 customers.last_contact_at 직접 write 금지",
);
assert.match(
  customersSource,
  /activity_type: input\.consult_type,[\s\S]{0,160}?content,/,
  "상담로그를 baseline 활동으로 함께 기록해 마지막 상담일 파생 유지",
);
assert.ok(
  !/\.from\("customer_activities"\)[\s\S]{0,160}?\.insert\(\{/.test(
    customersSource,
  ),
  "customer_activities write는 호환 payload helper를 거쳐야 함",
);
assert.ok(
  !todayWorkSource.includes("next_contact_at, last_contact_at"),
  "오늘 업무에서 없는 customers.last_contact_at 조회 금지",
);
assert.ok(
  todayWorkSource.includes('.eq("next_contact_at", todayKey)'),
  "date 컬럼은 로컬 날짜 키로 조회",
);

for (const source of [todayWorkSource, schedulePageSource]) {
  assert.ok(
    source.includes("customer_id, consult_content, created_at"),
    "상담로그 운영 컬럼 consult_content 사용",
  );
  assert.ok(
    !source.includes("customer_id, content, created_at"),
    "존재하지 않는 customer_consult_logs.content 조회 금지",
  );
}

assert.match(
  customerDetailSource,
  /customer\.last_contact_at\s*\?\?\s*latestLog\?\.created_at/,
  "고객 상세 최근 연락은 상담로그 날짜로 fallback",
);

console.log("PASS: customer live schema compatibility contract");
