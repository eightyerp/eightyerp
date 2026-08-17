import assert from "node:assert/strict";
import {
  buildKstDateTimeBounds,
  getDateRangePreset,
  getKstToday,
  normalizeDateToken,
  parseDateRangeQuickInput,
} from "../lib/date-range";

function okRange(input: string, from: string, to: string) {
  const result = parseDateRangeQuickInput(input);
  assert.equal(result.error, null, `${input} should parse`);
  assert.equal(result.from, from);
  assert.equal(result.to, to);
}

okRange("260801~260817", "2026-08-01", "2026-08-17");
okRange("260801-260817", "2026-08-01", "2026-08-17");
okRange("20260801~20260817", "2026-08-01", "2026-08-17");
okRange("2026-08-01 ~ 2026-08-17", "2026-08-01", "2026-08-17");

assert.equal(normalizeDateToken("240229"), "2024-02-29");
assert.equal(normalizeDateToken("250229"), null);
assert.equal(normalizeDateToken("260231"), null);
assert.equal(normalizeDateToken("261332"), null);

const reversed = parseDateRangeQuickInput("260817~260801");
assert.match(reversed.error ?? "", /종료일/);

const badFormat = parseDateRangeQuickInput("2026/08/01~2026/08/17");
assert.ok(badFormat.error);

const bounds = buildKstDateTimeBounds("2026-08-01", "2026-08-17");
assert.equal(bounds.error, null);
assert.equal(bounds.fromInclusiveUtc, "2026-07-31T15:00:00.000Z");
assert.equal(bounds.toExclusiveUtc, "2026-08-17T15:00:00.000Z");

const leapBounds = buildKstDateTimeBounds("2024-02-29", "2024-02-29");
assert.equal(leapBounds.fromInclusiveUtc, "2024-02-28T15:00:00.000Z");
assert.equal(leapBounds.toExclusiveUtc, "2024-02-29T15:00:00.000Z");

const fixedNow = new Date("2026-08-16T15:30:00.000Z"); // 2026-08-17 00:30 KST
assert.equal(getKstToday(fixedNow), "2026-08-17");
assert.deepEqual(getDateRangePreset("today", fixedNow), {
  from: "2026-08-17",
  to: "2026-08-17",
});
assert.deepEqual(getDateRangePreset("recent7", fixedNow), {
  from: "2026-08-11",
  to: "2026-08-17",
});
assert.deepEqual(getDateRangePreset("thisMonth", fixedNow), {
  from: "2026-08-01",
  to: "2026-08-17",
});
assert.deepEqual(getDateRangePreset("thisYear", fixedNow), {
  from: "2026-01-01",
  to: "2026-08-17",
});

const january = new Date("2026-01-15T03:00:00.000Z");
assert.deepEqual(getDateRangePreset("lastMonth", january), {
  from: "2025-12-01",
  to: "2025-12-31",
});

console.log("ERP DateRange contract PASS");
