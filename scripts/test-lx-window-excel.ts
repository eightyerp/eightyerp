/**
 * LX 창호 엑셀 파서 회귀 테스트
 * 실행: npm run test:lx-window-excel
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  parseLxWindowExcelBuffer,
  sumLxImportRows,
} from "../lib/crm/lx-window-excel";

function assertEq(
  label: string,
  actual: number | boolean | string | null | undefined,
  expected: number | boolean | string | null | undefined,
) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

function parseSample(relativePath: string) {
  const file = resolve(process.cwd(), relativePath);
  const buf = readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return parseLxWindowExcelBuffer(ab);
}

function testYeongdeungpo() {
  const parsed = parseSample("public/samples/lx-yeongdeungpo-prugio.xlsx");
  const sum = sumLxImportRows(parsed.rows);
  const errors = parsed.rows.filter((r) => r.status === "error");

  assertEq("창호·유리", sum.windowGlass, 12868800);
  assertEq("부가시공비", sum.extras, 1760000);
  assertEq("표준시공비", sum.labor, 2309660);
  assertEq("추가 부자재", sum.materials, 172200);
  assertEq("프로모션 할인(절대값)", sum.promo, 1810660);
  assertEq("기타 선택 합계", sum.other, 0);
  assertEq("선택 최종합계", sum.net, 15300000);
  assertEq("원본 최종금액", parsed.header.finalAmount, 15300000);
  assertEq("차이", sum.net - (parsed.header.finalAmount ?? 0), 0);
  assertEq("오류 행", errors.length, 0);
  assertEq("blocked", parsed.blocked, false);

  const materials = parsed.rows.filter((r) => r.category === "추가부자재");
  for (const m of materials) {
    assertEq("부자재 unit", m.unit, "식");
    if (m.statusReasons.some((x) => x.includes("단위"))) {
      throw new Error("부자재 단위 경고가 남아 있습니다.");
    }
  }
  console.log("PASS: lx-yeongdeungpo-prugio");
}

function testYonginHq() {
  const parsed = parseSample("public/samples/lx-hq-yongin.xlsx");
  const sum = sumLxImportRows(parsed.rows);
  const errors = parsed.rows.filter((r) => r.status === "error");
  assertEq("yongin final", parsed.header.finalAmount, 103455137);
  assertEq("yongin net", sum.net, 103455137);
  assertEq("yongin errors", errors.length, 0);
  assertEq("yongin blocked", parsed.blocked, false);
  console.log("PASS: lx-hq-yongin");
}

function testSample() {
  const parsed = parseSample("public/samples/lx-window-sample.xlsx");
  const sum = sumLxImportRows(parsed.rows);
  assertEq("sample final", parsed.header.finalAmount, 2340000);
  assertEq("sample net", sum.net, 2340000);
  assertEq("sample blocked", parsed.blocked, false);
  console.log("PASS: lx-window-sample");
}

function main() {
  testYeongdeungpo();
  testYonginHq();
  testSample();
  console.log("PASS: all lx-window-excel regressions");
}

main();
