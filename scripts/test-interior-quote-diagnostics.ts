import assert from "node:assert/strict";
import fs from "node:fs";
import {
  applyInteriorResolution,
  diagnoseInteriorItem,
  diagnoseInteriorWorkbook,
  isUnresolvedDiagnostic,
  type InteriorResolutionRecord,
} from "../lib/crm/interior-quote-diagnostics";
import { getInteriorImportBlockingReason, parseInteriorQuoteWorkbook, type InteriorExcelItem, type InteriorExcelParseResult } from "../lib/crm/interior-quote-excel";

function item(patch: Partial<InteriorExcelItem> = {}): InteriorExcelItem {
  return {
    id: "row-1",
    sourceRow: 10,
    tradeName: "목공",
    itemName: "테스트 품목",
    specification: "설명",
    quantity: 1,
    unit: "식",
    materialUnitPrice: 100000,
    materialAmount: 100000,
    laborUnitPrice: 50000,
    laborAmount: 50000,
    unitPrice: 150000,
    amount: 150000,
    remark: "",
    errors: [],
    excelOriginal: {
      quantity: 1,
      materialUnitPrice: 100000,
      materialAmount: 100000,
      laborUnitPrice: 50000,
      laborAmount: 50000,
      amount: 150000,
      invalidFields: [],
    },
    ...patch,
  };
}

const mismatch = item({
  excelOriginal: {
    quantity: 1,
    materialUnitPrice: 100000,
    materialAmount: 100000,
    laborUnitPrice: 50000,
    laborAmount: 50000,
    amount: 106000,
    invalidFields: [],
  },
});
const mismatchIssue = diagnoseInteriorItem(mismatch).find((issue) => issue.code === "excel_amount_mismatch");
assert.equal(mismatchIssue?.excelAmount, 106000, "Excel 원본금액");
assert.equal(mismatchIssue?.erpAmount, 150000, "ERP 계산금액");
assert.equal(mismatchIssue?.difference, -44000, "44,000원 차이 진단");

assert.ok(diagnoseInteriorItem(item({ excelOriginal: { ...item().excelOriginal, quantity: null } })).some((issue) => issue.code === "missing_quantity"));
assert.ok(diagnoseInteriorItem(item({ excelOriginal: { ...item().excelOriginal, materialUnitPrice: null } })).some((issue) => issue.code === "missing_material_unit_price"));
assert.ok(diagnoseInteriorItem(item({ excelOriginal: { ...item().excelOriginal, laborUnitPrice: null } })).some((issue) => issue.code === "missing_labor_unit_price"));
assert.ok(diagnoseInteriorItem(item({ excelOriginal: { ...item().excelOriginal, materialAmount: null, laborAmount: null, amount: null } })).some((issue) => issue.code === "missing_amount"));
assert.ok(diagnoseInteriorItem(item({ excelOriginal: { ...item().excelOriginal, invalidFields: ["수량"] } })).some((issue) => issue.code === "invalid_number"));
assert.ok(diagnoseInteriorItem(item({ amount: 140000 })).some((issue) => issue.code === "calculated_amount_mismatch"));
assert.ok(diagnoseInteriorItem(item({ quantity: 0, materialUnitPrice: 0, materialAmount: 0, laborUnitPrice: 0, laborAmount: 0, unitPrice: 0, amount: 0 })).some((issue) => issue.code === "zero_value_reference_item"));

const parsed: InteriorExcelParseResult = {
  sheetName: "견적",
  customerHints: { name: "", phone: "", address: "", siteName: "" },
  items: [mismatch],
  totals: { tradeSubtotals: { 목공: 194000 }, supplyAmount: 194000, vatAmount: 0, totalAmount: 194000, discountAmount: 0, vatMode: "inclusive" },
  warnings: [],
};
const aggregate = diagnoseInteriorWorkbook([mismatch], parsed, 150000);
assert.ok(aggregate.some((issue) => issue.code === "trade_subtotal_mismatch"));
assert.ok(aggregate.some((issue) => issue.code === "quote_total_mismatch"));

const excelApplied = applyInteriorResolution(mismatch, { kind: "excel_amount", allocation: "material" });
assert.equal(excelApplied.item.amount, 106000, "Excel 금액 기준 적용");
const calculated = applyInteriorResolution(mismatch, { kind: "keep_calculated" });
assert.equal(calculated.item.amount, 150000, "현재 계산값 유지");
const manual = applyInteriorResolution(mismatch, { kind: "manual_prices", materialUnitPrice: 120000, laborUnitPrice: 60000 });
assert.equal(manual.item.amount, 180000, "직접 단가 수정 후 합계");
const reference = applyInteriorResolution(mismatch, { kind: "reference" });
assert.equal(reference.item.amount, 0, "참고항목 전환");
const adjustmentBase = item({ excelOriginal: { ...item().excelOriginal, amount: 194000 } });
const adjustment = applyInteriorResolution(adjustmentBase, { kind: "adjustment", reason: "현장 협의 조정" });
assert.equal(adjustment.adjustment?.amount, 44000, "44,000원 차액 조정행");
assert.equal(adjustment.adjustment?.tradeName, "목공", "동일 공종 조정행");
assert.throws(() => applyInteriorResolution(mismatch, { kind: "adjustment", reason: "감액" }), /감액 조정/);

const issue = diagnoseInteriorItem(mismatch).find((candidate) => candidate.code === "excel_amount_mismatch")!;
assert.equal(isUnresolvedDiagnostic(issue, {}, {}), true, "미검토 오류 저장 차단");
const resolution: InteriorResolutionRecord = { kind: "keep_calculated", reason: "", confirmedAt: new Date().toISOString() };
assert.equal(isUnresolvedDiagnostic(issue, { [mismatch.id]: resolution }, {}), false, "개별 승인 후 오류 해제");
assert.match(getInteriorImportBlockingReason({ customerId: "c", employeeId: "e", fileReady: true, items: [mismatch], excelDifference: 44000, unresolvedDiagnosticCount: 1 }) ?? "", /해결되지 않은 필수 오류/);
assert.equal(getInteriorImportBlockingReason({ customerId: "c", employeeId: "e", fileReady: true, items: [mismatch], excelDifference: 44000, unresolvedDiagnosticCount: 0, totalMismatchConfirmed: true }), null, "계산값 유지 확인 후 저장 허용");

const fixturePath = "fixtures/interior/양평삼성래미안103동1101호 견적서_251206.xlsx";
if (fs.existsSync(fixturePath)) {
  const bytes = fs.readFileSync(fixturePath);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const fixture = parseInteriorQuoteWorkbook(buffer);
  const fixtureDiagnostics = diagnoseInteriorWorkbook(fixture.items, fixture, fixture.totals.totalAmount ?? 0);
  const actual = fixtureDiagnostics.find((candidate) => Math.abs(candidate.difference) === 44000);
  assert.equal(actual?.code, "excel_amount_mismatch", "실제 양평 44,000원 차이 유형");
  assert.equal(actual?.excelAmount, 2935000, "실제 양평 Excel 원본금액");
  assert.equal(actual?.erpAmount, 2979000, "실제 양평 ERP 계산금액");
}

const uiSource = fs.readFileSync("components/quotes/InteriorQuoteExcelImportModal.tsx", "utf8");
const panelSource = fs.readFileSync("components/quotes/InteriorQuoteErrorReviewPanel.tsx", "utf8");
for (const label of ["전체", "정상", "참고항목", "오류", "다음 오류", "오류 일괄검토", "오류수정"]) assert.ok(uiSource.includes(label), `진단 UI: ${label}`);
for (const label of ["Excel 원본 값", "변경 전", "변경 후", "수정 적용", "Excel 금액 기준 적용", "현재 계산값 유지", "차액 조정항목 생성", "참고항목 전환"]) assert.ok(panelSource.includes(label), `수정 패널: ${label}`);

console.log("PASS: interior quote diagnostics, explicit review, adjustment and save blocking tests");
