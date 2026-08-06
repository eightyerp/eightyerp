import assert from "node:assert/strict";
import fs from "node:fs";
import * as XLSX from "xlsx";
import { INTERIOR_EXCEL_EXTENSIONS, parseInteriorQuoteWorkbook } from "../lib/crm/interior-quote-excel";

function workbookBuffer(rows: unknown[][], options?: { extraSheet?: boolean; merge?: XLSX.Range }) {
  const workbook = XLSX.utils.book_new();
  if (options?.extraSheet) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["안내"], ["견적 내역은 다음 시트"]]), "안내");
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  if (options?.merge) sheet["!merges"] = [options.merge];
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
assert.ok(missingPrice.items[0].errors.includes("단가·금액 누락"), "단가 누락 강조");

const mismatchRows = rows.map((row) => [...row]);
mismatchRows[4][6] = 250000;
const mismatch = parseInteriorQuoteWorkbook(workbookBuffer(mismatchRows));
assert.ok(mismatch.items[0].errors.some((error) => error.includes("불일치")), "행 금액 불일치");
assert.ok(mismatch.warnings.some((warning) => warning.includes("다릅니다")), "총액 불일치");

assert.deepEqual(INTERIOR_EXCEL_EXTENSIONS, ["xlsx", "xls"], "잘못된 확장자 제외");

const migration = fs.readFileSync("supabase/migrations/20260806000001_interior_quote_excel_import.sql", "utf8");
assert.match(migration, /create_interior_quote_from_excel/, "전용 원자 저장 RPC");
assert.match(migration, /create_quote_with_items/, "기존 견적 저장 RPC 재사용");
assert.match(migration, /current_company_id\(\)/, "회사 경계");
assert.match(migration, /can_access_customer/, "고객 접근 범위");
assert.match(migration, /source_file_hash/, "중복 파일 해시 기록");

const action = fs.readFileSync("app/actions/interior-quote-import.ts", "utf8");
assert.match(action, /storage\.from\(QUOTE_FILES_BUCKET\)\.remove/, "DB 저장 실패 시 원본 정리");
assert.match(action, /needsDuplicateConfirmation/, "중복 자동 차단 대신 확인");
assert.match(action, /validateSignature/, "확장자·파일 시그니처 검증");

console.log("PASS: interior quote Excel parser, validation, duplicate warning, rollback and company guard tests");
