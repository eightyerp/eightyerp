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
const quoteManagement = read("lib/crm/quote-mgmt.ts");
const quoteWizard = read("components/quotes/QuoteWizardForm.tsx");
const quoteIntegrityMigration = read(
  "supabase/migrations/20260816074308_quote_workflow_atomic_integrity.sql",
);
const quoteIntegrityRollback = read(
  "supabase/rollback/20260816074308_quote_workflow_atomic_integrity_down.sql",
);
const quoteContractRetryMigration = read(
  "supabase/migrations/20260816100000_quote_contract_retry_project_guard.sql",
);
const quoteContractRetryRollback = read(
  "supabase/rollback/20260816100000_quote_contract_retry_project_guard_down.sql",
);
const quoteIntegrityVerification = read(
  "supabase/verification/20260816074308_quote_workflow_atomic_integrity_verify.sql",
);
const workflowReadiness = read("scripts/test-window-workflow-readiness.mjs");
const contractRetryReadiness = read(
  "scripts/test-contract-transition-replay-integrity.mjs",
);
const contractActions = read("app/actions/quote-contract-transition.ts");
const transition = read("lib/crm/quote-contract-transition.ts");
const quoteDetail = read("components/quotes/QuoteDetailView.tsx");
const contractPanel = read("components/quotes/ContractTransitionPanel.tsx");
const lifecycle = read("docs/WINDOW_WORKFLOW_LIFECYCLE.md");
const quoteContractRetryFunction = quoteContractRetryMigration.slice(
  quoteContractRetryMigration.indexOf(
    "create or replace function public.transition_quote_to_contract",
  ),
  quoteContractRetryMigration.indexOf(
    "revoke all on function public.transition_quote_to_contract",
  ),
);
const quoteContractRetryRollbackFunction = quoteContractRetryRollback.slice(
  quoteContractRetryRollback.indexOf(
    "create or replace function public.transition_quote_to_contract",
  ),
  quoteContractRetryRollback.indexOf(
    "revoke all on function public.transition_quote_to_contract",
  ),
);

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
  !quoteActions.includes("setContractQuoteAction") &&
    !quoteActions.includes("getQuoteContractTransitionOptions"),
  "일반 견적 액션에 레거시 계약전환 서버 진입점이 남지 않는다",
);
assert(
  !quoteActions.includes("linkWorkflowContext") &&
    /parseQuoteWorkflowSourceIds\(formData\)/.test(quoteActions) &&
    /workflowSource/.test(quoteActions),
  "견적 생성 후 별도 source UPDATE 없이 원자 RPC context를 전달한다",
);
assert(
  /create_quote_with_workflow_context/.test(quoteManagement) &&
    /p_source_consultation_id/.test(quoteManagement) &&
    /p_source_inspection_id/.test(quoteManagement),
  "점검·상담 source가 전용 원자 견적 RPC 한 번으로 전달된다",
);
assert(
  /effectiveProjectId/.test(quoteManagement) &&
    /source_consultation_id:\s*source\.source_consultation_id/.test(
      quoteManagement,
    ) &&
    /source_inspection_id:\s*source\.source_inspection_id/.test(
      quoteManagement,
    ),
  "연결 견적 수정·버전 생성에서도 project와 source 영구 ID를 유지한다",
);
assert(
  /initialQuote\?\.project_id\s*\?\?\s*initialProjectId/.test(quoteWizard) &&
    /initialQuote\?\.source_consultation_id/.test(quoteWizard) &&
    /initialQuote\?\.source_inspection_id/.test(quoteWizard),
  "견적 수정 폼이 저장된 project/source ID를 누락하지 않는다",
);
assert(
  /p\.customer_id\s*=\s*new\.customer_id/.test(quoteIntegrityMigration) &&
    /quotes_00_validate_project_identity/.test(quoteIntegrityMigration) &&
    /quotes_01_lock_workflow_source/.test(quoteIntegrityMigration),
  "DB가 cross-customer project와 workflow source 재연결을 차단한다",
);
assert(
  /create_quote_with_workflow_context/.test(quoteIntegrityMigration) &&
    /for update/.test(quoteIntegrityMigration) &&
    /v_outcome\s*=\s*'replayed'/.test(quoteIntegrityMigration) &&
    /is distinct from p_source_consultation_id/.test(
      quoteIntegrityMigration,
    ) &&
    /is distinct from p_source_inspection_id/.test(quoteIntegrityMigration),
  "원자 RPC가 replay source pair까지 동일한지 잠금 후 검증한다",
);
assert(
  /drop function if exists public\.create_quote_with_workflow_context/.test(
    quoteIntegrityRollback,
  ) &&
    /quoteIntegrityRollback/.test(workflowReadiness) &&
    /rollback/.test(workflowReadiness) &&
    /WQWF-VERIFY-/.test(quoteIntegrityVerification) &&
    /rollback;/.test(quoteIntegrityVerification) &&
    !/commit;/.test(quoteIntegrityVerification),
  "isolated/실권한 DB smoke와 비파괴 rollback 경로가 함께 유지된다",
);
assert(
  /export async function transitionQuoteToContractAction/.test(contractActions) &&
    /transitionQuoteToContract\s*\(/.test(contractActions),
  "명시적 계약전환 액션만 실제 전환 서비스를 호출한다",
);
assert(
  /supabase\.rpc\(["']transition_quote_to_contract["']/.test(transition),
  "실제 계약전환은 운영 원자적 RPC를 사용한다",
);
assert(
  quoteContractRetryFunction.split("contract replay project mismatch").length -
      1 ===
      2 &&
    quoteContractRetryFunction.split(
      "v_contract.project_id is distinct from p_project_id",
    ).length -
      1 ===
      2 &&
    quoteContractRetryFunction.split("errcode = '23514'").length - 1 === 2,
  "계약 재시도 일반·경쟁 반환 경로 모두 다른 project_id를 fail-closed 한다",
);
assert(
  !quoteContractRetryRollbackFunction.includes(
    "contract replay project mismatch",
  ) &&
    quoteContractRetryRollbackFunction.includes(
      "발송완료 상태의 견적만 전환할 수 있습니다.",
    ),
  "emergency rollback은 migration 39 상태 가드를 정확히 복원한다",
);
assert(
  transition.includes("result.already_converted === true") &&
    transition.includes("result.idempotent === true") &&
    transition.includes("contract replay project mismatch") &&
    transition.includes("기존 계약 현장을 확인해 주세요"),
  "RPC 멱등 결과와 현장 불일치 오류를 사용자에게 정확히 매핑한다",
);
assert(
  contractRetryReadiness.includes("already_converted") &&
    contractRetryReadiness.includes("23514") &&
    contractRetryReadiness.includes("projectA2"),
  "isolated DB가 최초 전환·exact replay·다른 현장 replay를 실행 검증한다",
);
assert(
  /if \(input\.projectMode === ["']link["']\)/.test(transition) &&
    /현재 고객에게 연결할 수 있는 현장이 아닙니다/.test(transition),
  "기존 현장 연결은 같은 고객/회사 현장인지 서버에서 검증한다",
);
assert(
  /if \(\(count \?\? 0\) > 0\)/.test(transition) &&
    /기존 현장이 있습니다\. 새로 만들지 말고 기존 현장을 연결해 주세요/.test(transition),
  "기존 현장이 있으면 create 모드로 중복 현장을 만들지 않는다",
);
assert(
  /projects\.length === 1/.test(contractPanel) &&
    /projects\.length > 1/.test(contractPanel) &&
    /현장을 선택해 주세요/.test(contractPanel),
  "현장 1개는 기본 선택하고 여러 현장은 직원이 명시적으로 선택한다",
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
