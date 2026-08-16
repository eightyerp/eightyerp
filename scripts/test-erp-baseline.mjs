import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const failures = [];

async function text(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

const [baseline, agents, productionDoc, notificationAction, notificationBell] =
  await Promise.all([
    text("docs/ERP_MASTER_BASELINE.md"),
    text("AGENTS.md"),
    text("docs/operations/production-environment.md"),
    text("app/actions/erp-notifications.ts"),
    text("components/dashboard/ErpNotificationBell.tsx"),
  ]);

check(
  baseline.includes("Eighty ERP Master Baseline") &&
    baseline.includes("제품 경계 — 기능 중복 금지") &&
    baseline.includes("P0 안정화 우선순위"),
  "ERP Master Baseline 문서의 필수 섹션이 없습니다.",
);

check(
  agents.includes("BEGIN:EIGHTY_ERP_GUARDRAILS") &&
    agents.includes("docs/ERP_MASTER_BASELINE.md"),
  "AGENTS.md에 ERP 충돌방지 규칙이 없습니다.",
);

check(
  productionDoc.includes("public.employee_tasks`는 운영 DB에 **존재한다**") &&
    !productionDoc.includes("앱 코드가 `public.employee_tasks`를 조회하지만 운영 DB에는 테이블이 없다"),
  "운영환경 문서의 employee_tasks 상태가 현재 운영 DB와 맞지 않습니다.",
);

const notificationQueryCount =
  notificationAction.match(/\.from\("notification_events"\)/g)?.length ?? 0;
check(
  notificationQueryCount === 1,
  `ERP 상단 알림 notification_events 조회는 1회여야 합니다. 현재 ${notificationQueryCount}회입니다.`,
);
check(
  !notificationAction.includes("listMyCustomerPushes") &&
    !notificationAction.includes("listMyCollectionNotifications") &&
    !notificationAction.includes("listMyExpenseNotifications"),
  "ERP 상단 알림이 카테고리별 별도 조회 함수로 회귀했습니다.",
);

check(
  notificationBell.includes("ERP_NOTIFICATION_POLL_MS = 60_000") &&
    notificationBell.includes('document.visibilityState === "hidden"') &&
    notificationBell.includes('document.addEventListener("visibilitychange"'),
  "ERP 알림 polling의 숨김 탭 중지/저빈도 정책이 없습니다.",
);

if (failures.length) {
  console.error("ERP baseline guard: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("ERP baseline guard: PASS");
console.log("- Master Baseline present");
console.log("- Agent guardrails present");
console.log("- Production schema note current");
console.log("- Notification bundle query count: 1");
console.log("- Hidden-tab polling guard present");
