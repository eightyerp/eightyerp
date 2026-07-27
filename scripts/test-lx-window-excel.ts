/**
 * LX 창호 엑셀 파서 회귀 테스트
 * 실행: npm run test:lx-window-excel
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  buildQuoteLinesFromLxImport,
  parseLxWindowExcelBuffer,
  sumLxImportRows,
} from "../lib/crm/lx-window-excel";
import {
  composeLxWindowEditorRemark,
  parseLxWindowEditorRemark,
} from "../lib/crm/lx-window-meta";
import { resolveQuoteVatDisplayAmounts } from "../lib/crm/quote-constants";

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

function testWindowVatIncluded() {
  const vat = resolveQuoteVatDisplayAmounts({
    discountedAmount: 15_300_000,
    quoteType: "창호",
    vatMode: "exclusive",
    vatRate: 10,
    supplyAmount: 15_300_000,
    vatAmount: 1_530_000,
    customerTotalAmount: 16_830_000,
  });
  assertEq("창호 고객 최종금액", vat.customer_total_amount, 15_300_000);
  assertEq("창호 공급가액", vat.supply_amount, 13_909_091);
  assertEq("창호 부가세", vat.vat_amount, 1_390_909);
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

  const built = buildQuoteLinesFromLxImport(parsed.rows);
  const windowBars = built.lines.filter((line) =>
    /통바/.test(line.item_name),
  );
  assertEq("통바 창호자재 분류 수", windowBars.length, 3);
  for (const bar of windowBars) {
    assertEq("통바 편집 분류", bar.window_item_kind, "material");
    assertEq("통바 위치 보존", bar.window_location, "PL내창");
  }

  const editedBar = windowBars[0]!;
  const editedRemark = composeLxWindowEditorRemark({
    kind: "material",
    currentRemark: editedBar.remark,
    location: "PL외창",
    extraRemark: "현장 확인",
  });
  const reopened = parseLxWindowEditorRemark(editedRemark, "material");
  assertEq("통바 수정 위치 재초기화", reopened.location, "PL외창");
  assertEq("통바 수정 비고 재초기화", reopened.extraRemark, "현장 확인");
  assertEq("통바 수량×단가 즉시 합계", 3 * 40_000, 120_000);
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
  testWindowVatIncluded();
  testYeongdeungpo();
  testYonginHq();
  testSample();
  console.log("PASS: all lx-window-excel regressions");
}

main();
