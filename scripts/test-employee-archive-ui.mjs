import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actions = readFileSync("app/actions/employee-contacts.ts", "utf8");
const workspace = readFileSync(
  "components/system/EmployeeContactsWorkspace.tsx",
  "utf8",
);
const dashboard = readFileSync(
  "components/dashboard/TodayWorkDashboard.tsx",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260811224438_employee_active_status_rpc.sql",
  "utf8",
);

const helperStart = actions.indexOf("async function setEmployeeActiveStatus(");
const helperEnd = actions.indexOf("\n/**", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "직원 상태 변경 helper가 필요합니다.");
const statusHelper = actions.slice(helperStart, helperEnd);

assert.match(
  statusHelper,
  /rpc\("current_company_role"\)[\s\S]*role !== "owner"[\s\S]*role !== "director"[\s\S]*role !== "admin"/,
  "Server Action은 현재 회사 관리자 권한을 직접 확인해야 합니다.",
);
assert.match(
  statusHelper,
  /rpc\("set_employee_active_status", \{[\s\S]*p_is_active: isActive/,
  "보관·복원은 상태 컬럼만 잠그는 전용 RPC를 사용해야 합니다.",
);
assert.doesNotMatch(
  statusHelper,
  /p_name|p_team_id|p_title|p_phone|p_email|\.from\("employees"\)/,
  "상태 액션이 연락처를 재조회·재기록하면 동시 수정 내용을 덮을 수 있습니다.",
);
assert.doesNotMatch(
  statusHelper,
  /\.delete\s*\(/,
  "직원 보관 흐름에서 물리 DELETE를 호출하면 안 됩니다.",
);
assert.match(
  actions,
  /archiveEmployeeAction\([\s\S]*setEmployeeActiveStatus\(employeeId, false\)/,
  "직원 삭제 메뉴는 실제 삭제 대신 비활성 보관을 실행해야 합니다.",
);
assert.match(
  actions,
  /restoreEmployeeAction\([\s\S]*setEmployeeActiveStatus\(employeeId, true\)/,
  "보관 직원은 복원할 수 있어야 합니다.",
);

const saveStart = actions.indexOf("export async function saveEmployeeMasterAction(");
const saveEnd = actions.indexOf("\nexport async function linkEmployeeLoginAction(", saveStart);
const saveAction = actions.slice(saveStart, saveEnd);
assert.doesNotMatch(
  saveAction,
  /formData\.get\("is_active"\)/,
  "일반 직원 저장은 클라이언트의 상태 값을 신뢰하면 안 됩니다.",
);
assert.match(
  saveAction,
  /\.select\("is_active"\)[\s\S]*p_is_active: currentStatus\?\.data\?\.is_active === true/,
  "일반 직원 저장은 서버에서 읽은 현재 상태만 전달해야 합니다.",
);

assert.match(
  migration,
  /create or replace function public\.set_employee_active_status\([\s\S]*set is_active = p_is_active[\s\S]*'status_changed'/,
  "상태 전용 RPC는 상태만 변경하고 감사 이벤트를 남겨야 합니다.",
);
assert.match(
  migration,
  /create or replace function public\.update_employee_master\([\s\S]*p_is_active is distinct from v_before\.is_active[\s\S]*전용 보관·복원 절차/,
  "일반 직원 RPC는 상태 변경을 거부해야 합니다.",
);
assert.match(
  migration,
  /revoke all[\s\S]*set_employee_active_status\(uuid, boolean\)[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*set_employee_active_status\(uuid, boolean\)[\s\S]*to authenticated/,
  "상태 전용 RPC는 deny-first ACL 뒤 authenticated에만 공개해야 합니다.",
);

for (const copy of [
  "직원 삭제·보관",
  "실제로 삭제하지 않습니다.",
  "기존 고객·견적·일정·계약·정산 이력은 그대로 보존됩니다.",
  "현재 로그인한 본인 직원은 보관할 수 없습니다.",
  "직원 다시 활성화",
]) {
  assert.ok(workspace.includes(copy), `보관 안전 안내 누락: ${copy}`);
}
assert.match(
  workspace,
  /archiveEmployeeAction\(selected\.id\)/,
  "확인 UI가 전용 보관 Server Action을 호출해야 합니다.",
);
assert.match(
  workspace,
  /openEmployeeArchiveMenu\(employee\)[\s\S]*"삭제·보관"/,
  "직원 목록에서 삭제·보관 메뉴를 바로 찾을 수 있어야 합니다.",
);
assert.equal(
  [...workspace.matchAll(/>일정<\/th>/g)].length,
  1,
  "직원 목록 일정 헤더는 한 번만 표시해야 합니다.",
);
assert.equal(
  [...workspace.matchAll(/>관리<\/th>/g)].length,
  1,
  "직원 목록 관리 헤더는 한 번만 표시해야 합니다.",
);
assert.match(
  workspace,
  /requestAnimationFrame\([\s\S]*employee-archive-title[\s\S]*scrollIntoView[\s\S]*focus\(\{ preventScroll: true \}\)/,
  "목록의 관리 메뉴는 렌더 완료 후 보관 제목으로 키보드 포커스를 옮겨야 합니다.",
);
assert.match(
  workspace,
  /role="alertdialog"[\s\S]*aria-modal="true"[\s\S]*onKeyDown=\{handleArchiveConfirmKeyDown\}/,
  "보관 확인은 키보드 이벤트를 처리하는 modal alertdialog여야 합니다.",
);
assert.match(
  workspace,
  /function handleArchiveConfirmKeyDown[\s\S]*event\.key === "Escape"[\s\S]*closeArchiveConfirmation\(\)/,
  "보관 확인창은 Escape로 닫혀야 합니다.",
);
assert.match(
  workspace,
  /function closeArchiveConfirmation[\s\S]*requestAnimationFrame\(\(\) => archiveConfirmButtonRef\.current\?\.focus\(\)\)/,
  "보관 확인창을 닫으면 호출 버튼으로 포커스를 복원해야 합니다.",
);
assert.match(
  workspace,
  /const activeIsFocusable = active \? focusable\.includes\(active\) : false;[\s\S]*event\.shiftKey[\s\S]*!activeIsFocusable[\s\S]*!event\.shiftKey[\s\S]*!activeIsFocusable/,
  "dialog 컨테이너 자체가 포커스된 경우에도 Tab과 Shift+Tab이 밖으로 빠지면 안 됩니다.",
);
assert.equal(
  [...workspace.matchAll(/const isSelf =/g)].length,
  1,
  "직원 보관 본인 판정은 중복 선언하면 안 됩니다.",
);
assert.match(
  workspace,
  /selected\.id === currentEmployeeId[\s\S]*disabled=\{pending \|\| !canArchiveFromUi\}/,
  "본인 보관은 UI에서도 선제 차단해야 합니다.",
);
assert.doesNotMatch(
  workspace,
  /name="is_active"/,
  "일반 저장 폼은 직원 상태 필드를 전송하면 안 됩니다.",
);

const emptyStateStart = dashboard.indexOf("오늘 예정된 업무가 없습니다.");
assert.ok(emptyStateStart >= 0, "오늘 업무 빈 화면이 필요합니다.");
const emptyState = dashboard.slice(emptyStateStart);
for (const label of ["새 견적", "새 고객", "내부 할 일 등록"]) {
  const buttonMatch = emptyState.match(
    new RegExp(`className="([^"]+)"[^>]*>\\s*${label}\\s*<`),
  );
  assert.ok(buttonMatch, `${label} 버튼이 필요합니다.`);
  const className = buttonMatch[1];
  assert.match(className, /bg-white/, `${label}: 흰 배경을 명시해야 합니다.`);
  assert.match(className, /text-slate-900/, `${label}: 어두운 글자색을 명시해야 합니다.`);
  assert.match(className, /border-slate-400/, `${label}: 보이는 테두리를 명시해야 합니다.`);
}

console.log("PASS: 직원 안전 보관/복원 UX와 빈 화면 버튼 대비 계약");
