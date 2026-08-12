import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260812114934_collection_receipts_v1.sql", "utf8");
const guard = fs.readFileSync("supabase/migrations/20260812115456_collection_receipts_overpayment_guard.sql", "utf8");
const navigation = fs.readFileSync("lib/modules/navigation.ts", "utf8");
const workspace = fs.readFileSync("components/finance/CollectionsWorkspace.tsx", "utf8");
const notifications = fs.readFileSync("lib/crm/notifications.ts", "utf8");

assert.match(migration, /create table if not exists public\.collection_receipts/);
assert.match(migration, /revoke insert, update, delete on table public\.collection_receipts from authenticated/);
assert.match(migration, /p_payment_method not in \('card','cash'\)/);
assert.match(migration, /v_status := 'pending'/);
assert.match(migration, /v_status := 'confirmed'/);
assert.match(guard, /확정 수금합계가 계약금액을 초과합니다/);
assert.match(navigation, /route: "\/finance\/collections"/);
assert.match(workspace, /직원 등록 → 관리자 확인/);
assert.match(workspace, /수금 확인 요청/);
assert.match(notifications, /collection_reported/);
assert.match(notifications, /collection_confirmed/);

console.log("PASS: collections v1 contract checks");
