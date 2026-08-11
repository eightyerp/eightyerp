import assert from "node:assert/strict";
import fs from "node:fs";
import * as XLSX from "xlsx";
import {
  INTERIOR_EXCEL_EXTENSIONS,
  buildInteriorQuoteItemsPayload,
  getInteriorImportBlockingReason,
  isInteriorReferenceItem,
  parseInteriorQuoteWorkbook,
  recalculateInteriorCostItem,
} from "../lib/crm/interior-quote-excel";
import { INTERIOR_IMPORT_CUSTOMER_SELECT } from "../lib/crm/interior-quote-import";

function workbookBuffer(rows: unknown[][], options?: { extraSheet?: boolean; merge?: XLSX.Range; merges?: XLSX.Range[] }) {
  const workbook = XLSX.utils.book_new();
  if (options?.extraSheet) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["안내"], ["견적 내역은 다음 시트"]]), "안내");
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  if (options?.merge || options?.merges) sheet["!merges"] = [...(options.merges ?? []), ...(options.merge ? [options.merge] : [])];
  XLSX.utils.book_append_sheet(workbook, sheet, "인테리어 견적서");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const rows = [
  ["고객명", "홍길동", "연락처", "010-1234-5678"],
  ["현장명", "강남 현장", "주소", "서울 강남구"],
  [],
  ["공종", "품목", "규격", "수량", "단위", "단가", "금액", "비고"],
  ["철거공사", "기존 바닥 철거", "30평", 2, "식", 100000, 200000, "폐기물 포함"],
  ["목공사", "천장 목공", "석고 2P", 1, "식", 300000, 300000, ""],
  ["공급가", "", "", "", "", "", 500000],
  ["부가세", "", "", "", "", "", 50000],
  ["총금액", "", "", "", "", "", 550000],
];

const normal = parseInteriorQuoteWorkbook(workbookBuffer(rows));
assert.equal(normal.items.length, 2, "정상 견적 항목 수");
assert.equal(normal.items[0].amount, 200000, "수량×단가 계산");
assert.equal(normal.totals.supplyAmount, 500000, "공급가");
assert.equal(normal.totals.vatAmount, 50000, "VAT 별도");
assert.equal(normal.totals.totalAmount, 550000, "총금액");
assert.equal(normal.customerHints.name, "홍길동", "Excel 고객정보 힌트");

const formulaWorkbook = XLSX.utils.book_new();
const formulaSheet = XLSX.utils.aoa_to_sheet(rows);
formulaSheet.G5 = { t: "n", f: "D5*F5", v: 200000 };
XLSX.utils.book_append_sheet(formulaWorkbook, formulaSheet, "견적");
const formulaParsed = parseInteriorQuoteWorkbook(XLSX.write(formulaWorkbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
assert.equal(formulaParsed.items[0].amount, 200000, "수식은 캐시된 계산값 사용");

const multi = parseInteriorQuoteWorkbook(workbookBuffer(rows, { extraSheet: true }));
assert.equal(multi.sheetName, "인테리어 견적서", "여러 시트 자동 탐색");

const mergedRows = rows.map((row) => [...row]);
const merged = parseInteriorQuoteWorkbook(workbookBuffer(mergedRows, { merge: { s: { r: 4, c: 0 }, e: { r: 4, c: 0 } } }));
assert.equal(merged.items.length, 2, "병합셀 포함 파싱");

const inclusiveRows = rows.slice(0, 6).concat([["총금액", "", "", "", "", "", 500000]]);
const inclusive = parseInteriorQuoteWorkbook(workbookBuffer(inclusiveRows));
assert.equal(inclusive.totals.vatMode, "inclusive", "VAT 포함");

const discountRows = rows.slice(0, 6).concat([["할인", "", "", "", "", "", 50000], ["총금액", "", "", "", "", "", 500000]]);
const discounted = parseInteriorQuoteWorkbook(workbookBuffer(discountRows));
assert.equal(discounted.totals.discountAmount, 50000, "할인/조정금액");

const missingPriceRows = rows.map((row) => [...row]);
missingPriceRows[4][5] = ""; missingPriceRows[4][6] = "";
const missingPrice = parseInteriorQuoteWorkbook(workbookBuffer(missingPriceRows));
assert.equal(missingPrice.items[0].errors.length, 0, "0원 참고항목은 오류가 아님");
assert.equal(isInteriorReferenceItem(missingPrice.items[0]), true, "0원 참고항목 분류");
const referencePayload = buildInteriorQuoteItemsPayload([missingPrice.items[0]])[0];
assert.equal(referencePayload.amount, 0, "0원 참고항목 저장 허용");
assert.match(referencePayload.description ?? "", /30평/, "참고항목 설명 보존");
const convertedPaid = recalculateInteriorCostItem(missingPrice.items[0], { quantity: 2, materialUnitPrice: 100000 });
assert.equal(isInteriorReferenceItem(convertedPaid), false, "단가 입력 시 유상항목 전환");
assert.equal(convertedPaid.amount, 200000, "유상항목 전환 금액 계산");

const mismatchRows = rows.map((row) => [...row]);
mismatchRows[4][6] = 250000;
const mismatch = parseInteriorQuoteWorkbook(workbookBuffer(mismatchRows));
assert.ok(mismatch.items[0].errors.some((error) => error.includes("불일치")), "행 금액 불일치");
assert.ok(mismatch.warnings.some((warning) => warning.includes("다릅니다")), "총액 불일치");

assert.deepEqual(INTERIOR_EXCEL_EXTENSIONS, ["xlsx", "xls"], "잘못된 확장자 제외");

const standardRows = [
  ["공종", "품목", "설명", "수량", "단위", "자재단가", "자재금액", "인건비단가", "인건비금액", "비고"],
  ["목공사", "천장", "석고 2P", 2, "식", 100000, 200000, 50000, 100000, ""],
  ["공급가", "", "", "", "", "", 300000], ["부가세", "", "", "", "", "", 30000], ["합계", "", "", "", "", "", 330000],
];
const standard = parseInteriorQuoteWorkbook(workbookBuffer(standardRows));
assert.equal(standard.items[0].materialUnitPrice, 100000, "표준 양식 자재단가");
assert.equal(standard.items[0].laborUnitPrice, 50000, "표준 양식 인건비단가");
assert.equal(standard.items[0].unitPrice, 150000, "DB 저장용 합산단가");
assert.equal(standard.items[0].amount, 300000, "DB 저장용 합산금액");

const layeredRows = [
  ["01 준비 공사", null, null, null, null, null, null, null, null, null, null],
  ["내 용", "품 목", "설명", "수량", "단위", "견적가", null, null, null, "총 금액", "비고"],
  [null, null, null, null, null, "자재비", null, "인건비", null, null, null],
  [null, null, null, null, null, "단가", "금액", "단가", "금액", null, null],
  ["혼합", "자재+인건비", "모두 존재", 2, "식", "100,000원", 200000, 50000, 100000, 300000, ""],
  ["자재", "자재만", "금액 없음", 2, "식", 120000, null, null, null, 240000, ""],
  ["노무", "인건비만", "단가 없음", 3, "식", null, null, null, 300000, 300000, ""],
  ["금액", "금액만", "양쪽 금액", 2, "식", null, 400000, null, 100000, 500000, ""],
  ["영원", "명시적 0", "0과 빈값 구분", 2, "식", 100000, 0, 50000, null, 100000, ""],
  ["경고", "합계 불일치", "비교 경고", 1, "식", 100, 100, 50, 50, 999, ""],
  ["소 계", null, null, null, null, null, 840100, null, 500150, 1340250, null],
];
const layered = parseInteriorQuoteWorkbook(workbookBuffer(layeredRows,{merges:[
  {s:{r:0,c:0},e:{r:0,c:10}}, {s:{r:1,c:0},e:{r:3,c:0}}, {s:{r:1,c:1},e:{r:3,c:1}},
  {s:{r:1,c:5},e:{r:1,c:8}}, {s:{r:2,c:5},e:{r:2,c:6}}, {s:{r:2,c:7},e:{r:2,c:8}},
]}));
assert.equal(layered.items.length,6,"3단 병합헤더 품목 수");
assert.deepEqual(layered.items[0],{...layered.items[0],materialUnitPrice:100000,materialAmount:200000,laborUnitPrice:50000,laborAmount:100000,unitPrice:150000,amount:300000},"자재+인건비");
assert.equal(layered.items[1].materialAmount,240000,"단가만 있으면 수량×자재단가");
assert.equal(layered.items[2].laborUnitPrice,100000,"금액만 있으면 수량으로 단가 역산");
assert.equal(layered.items[3].unitPrice,250000,"자재·인건비 금액만 있는 행 합산단가");
assert.equal(layered.items[4].materialAmount,0,"명시적 0은 단가 계산으로 덮지 않음");
assert.equal(layered.items[4].laborAmount,100000,"빈 금액은 수량×단가");
assert.ok(layered.items[5].errors.some((error)=>error.includes("Excel 합계금액")),"명시 합계 차이 경고");

assert.equal(getInteriorImportBlockingReason({customerId:"",employeeId:"employee",fileReady:true,items:normal.items,excelDifference:0}),"고객을 선택해 주세요.","고객 필수");
assert.equal(getInteriorImportBlockingReason({customerId:"customer",employeeId:"",fileReady:true,items:normal.items,excelDifference:0}),"담당 직원을 선택해 주세요.","담당자 필수");
assert.equal(getInteriorImportBlockingReason({customerId:"customer",employeeId:"employee",fileReady:true,items:[missingPrice.items[0]],excelDifference:0}),"유효한 유상 품목이 1개 이상 필요합니다.","유상 품목 필수");
assert.equal(getInteriorImportBlockingReason({customerId:"customer",employeeId:"employee",fileReady:true,items:normal.items,excelDifference:10}),"Excel 총액과 ERP 계산 총액이 일치하지 않습니다.","총액 불일치 차단");
assert.equal(getInteriorImportBlockingReason({customerId:"customer",employeeId:"employee",fileReady:true,items:normal.items,excelDifference:0}),null,"담당자 선택 후 저장 가능");

const fixturePath = "fixtures/interior/양평삼성래미안103동1101호 견적서_251206.xlsx";
if (fs.existsSync(fixturePath)) {
  const fixtureBytes = fs.readFileSync(fixturePath);
  const fixtureBuffer = fixtureBytes.buffer.slice(fixtureBytes.byteOffset, fixtureBytes.byteOffset + fixtureBytes.byteLength) as ArrayBuffer;
  const fixture = parseInteriorQuoteWorkbook(fixtureBuffer);
  for (const itemName of ["엘리베이터 이용료", "공사 예치금", "사용승인", "가스계량기 이동"]) {
    const item = fixture.items.find((candidate) => candidate.itemName === itemName);
    assert.ok(item, `양평 fixture 참고항목 보존: ${itemName}`);
    assert.equal(item.errors.length, 0, `양평 fixture 참고항목 오류 없음: ${itemName}`);
    assert.equal(isInteriorReferenceItem(item), true, `양평 fixture 참고항목 분류: ${itemName}`);
  }
  const fixturePayload = buildInteriorQuoteItemsPayload(fixture.items);
  assert.equal(fixturePayload.length, fixture.items.length, "양평 fixture 참고항목 포함 전체 payload");
  assert.equal(fixturePayload.reduce((sum, item) => sum + item.amount, 0), fixture.items.reduce((sum, item) => sum + item.amount, 0), "0원 참고항목 합계 제외");
}

const importActionSource = fs.readFileSync("app/actions/interior-quote-import.ts", "utf8");
assert.match(importActionSource, /await createQuote\(/, "기존 createQuote 저장 경로 재사용");
assert.doesNotMatch(importActionSource, /create_interior_quote_from_excel/, "미적용 전용 RPC 의존성 없음");
assert.match(importActionSource, /\[interior-quote-import\] save-failed/, "서버 오류 원문 관리자 로그");
assert.match(
  INTERIOR_IMPORT_CUSTOMER_SELECT,
  /projects:projects!projects_customer_id_fkey\s*\(/,
  "복수 projects→customers FK 환경에서 현장 관계를 명시해야 합니다.",
);
assert.doesNotMatch(
  INTERIOR_IMPORT_CUSTOMER_SELECT,
  /(^|[,(]\s*)projects\s*\(/m,
  "모호한 projects 자동 관계 선택을 다시 사용하면 안 됩니다.",
);
const importUiSource = fs.readFileSync("components/quotes/InteriorQuoteExcelImportModal.tsx", "utf8");
assert.match(importUiSource, /참고항목 · 금액 미반영/, "0원 참고항목 배지");
assert.match(importUiSource, /disabled=\{pending \|\| Boolean\(saveBlockReason\)\}/, "저장 사유별 버튼 차단");

console.log("PASS: interior quote Excel parser, design-eighty standard mapping, totals and validation tests");
