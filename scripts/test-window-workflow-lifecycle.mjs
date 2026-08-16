import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

const projectConstants = read("lib/crm/project-constants.ts");
const projects = read("lib/crm/projects.ts");
const quoteActions = read("app/actions/quote-mgmt.ts");
const transition = read("lib/crm/quote-contract-transition.ts");
const quoteDetail = read("components/quotes/QuoteDetailView.tsx");
const contractPanel = read("components/quotes/ContractTransitionPanel.tsx");
const lifecycle = read("docs/WINDOW_WORKFLOW_LIFECYCLE.md");

assert(
  !/customerStatus\s*===\s*["']계약완료["']/.test(projectConstants),
  "현장 생성 UI가 계약완료 상태에만 묶이지 않는다",
);
assert(
  /const address[\s\S]*if \(address\) return address;[\s\S]*const name/.test(
    projectConstants,
  ),
  "기본 현장명은 고객명보다 주소/아파트 정보를 우선한다",
);
assert(
  /status:\s*ProjectStatus\s*=\s*isContractCustomerStatus\(customer\.status\)[\s\S]*?:\s*["']준비["']/.test(projects),
  "계약 전 현장 상태를 서버에서 준비로 고정한다",
);
assert(
  /window_inspections/.test(projects) &&
    /customer_consult_logs/.test(projects) &&
    /contracts/.test(projects) &&
    /quotes/.test(projects),
  "연결 이력이 있는 현장 삭제 방어가 유지된다",
);
assert(
  /현장 삭제는 관리자만/.test(projects) &&
    /if \(!isAdmin\)/.test(projects),
  "현장 삭제는 관리자 전용으로 유지한다",
);
assert(
  !/setContractQuote\s*\(/.test(quoteActions),
  "견적 액션이 레거시 플래그 전환 함수를 호출하지 않는다",
);
assert(
  /transitionQuoteToContract\s*\(/.test(quoteActions),
  "견적 액션이 실제 계약전환 서비스를 호출한다",
);
assert(
  /supabase\.rpc\(["']transition_quote_to_contract["']/.test(transition),
  "실제 계약전환은 운영 원자적 RPC를 사용한다",
);
assert(
  /options\.projects\.length === 1/.test(quoteActions) &&
    /options\.projects\.length === 0/.test(quoteActions),
  "현장 1개는 재사용하고 0개일 때만 생성한다",
);
assert(
  /현장이 여러 개/.test(quoteActions),
  "여러 현장은 자동 추정하지 않고 차단한다",
);
assert(
  !quoteDetail.includes("계약 견적으로 지정") &&
    !quoteDetail.includes("setContractQuoteAction"),
  "견적 상세에 레거시 계약전환 진입점을 다시 노출하지 않는다",
);
assert(
  contractPanel.includes("실제 계약 전환") &&
    contractPanel.includes("실제 계약으로 전환"),
  "명시적 실제 계약전환 패널을 유일한 UI 진입점으로 유지한다",
);
assert(
  lifecycle.includes("점검 → 상담 → 견적") &&
    lifecycle.includes("가짜") &&
    lifecycle.includes("연결 이력이 있는 project 삭제 금지"),
  "생명주기 Source of Truth에 핵심 금지 규칙이 기록돼 있다",
);

if (process.exitCode) {
  throw new Error("Window workflow lifecycle regression guard failed.");
}
