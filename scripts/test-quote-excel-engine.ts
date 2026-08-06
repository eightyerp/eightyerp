import assert from "node:assert/strict";
import fs from "node:fs";
import * as XLSX from "xlsx";
import { parseInteriorQuoteWorkbook } from "../lib/crm/interior-quote-excel";
import { parseLxWindowExcelBuffer } from "../lib/crm/lx-window-excel";
import { fingerprintWorkbook, genericInteriorAdapter, lxWindowAdapter, readQuoteWorkbook, recognizeQuoteWorkbook, scanWorkbookSecurity } from "../lib/excel-engine";

function make(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "견적서");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const rows = (name: string, phone: string, address: string, price: number) => [
  ["고객명", name, "연락처", phone], ["주소", address], [],
  ["공종", "품목", "규격", "수량", "단위", "단가", "금액", "비고"],
  ["목공사", "천장", "석고", 1, "식", price, price, ""],
  ["총금액", "", "", "", "", "", price],
];
const first = make(rows("홍길동", "010-1234-5678", "서울 강남구", 100000));
const second = make(rows("김영희", "010-9999-0000", "부산 해운대구", 987654));
const different = make([["공종", "품목", "수량"], ["도장", "벽", 2], ["합계", 200]]);

assert.deepEqual(genericInteriorAdapter.parse(first), parseInteriorQuoteWorkbook(first), "인테리어 adapter 출력 완전 동일");
function withStableRandom<T>(run: () => T): T {
  const original = Math.random;
  let state = 123456789;
  Math.random = () => ((state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 0x100000000);
  try { return run(); } finally { Math.random = original; }
}
for (const fixture of ["lx-hq-yongin.xlsx", "lx-window-sample.xlsx", "lx-yeongdeungpo-prugio.xlsx"]) {
  const data = fs.readFileSync(`public/samples/${fixture}`);
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const adapted = withStableRandom(() => lxWindowAdapter.parse(buffer));
  const legacy = withStableRandom(() => parseLxWindowExcelBuffer(buffer));
  assert.deepEqual(adapted, legacy, `${fixture} LX adapter 출력 완전 동일`);
}

const fp1 = fingerprintWorkbook(readQuoteWorkbook(first));
const fp2 = fingerprintWorkbook(readQuoteWorkbook(second));
const fp3 = fingerprintWorkbook(readQuoteWorkbook(different));
assert.equal(fp1.hash, fp2.hash, "같은 양식은 고객·금액이 달라도 동일 fingerprint");
assert.notEqual(fp1.hash, fp3.hash, "다른 구조는 다른 fingerprint");
for (const secret of ["홍길동", "01012345678", "서울강남구", "100000"]) assert.ok(!fp1.descriptor.replace(/[-\s]/g, "").includes(secret), `fingerprint 개인정보/금액 제외: ${secret}`);
const recognition = recognizeQuoteWorkbook(first);
assert.equal(recognition.adapterId, "generic-interior");
assert.ok(recognition.confidence >= 70);
assert.ok(recognition.reasons.length > 0);

const malicious = XLSX.utils.book_new();
const maliciousSheet = XLSX.utils.aoa_to_sheet([["금액", 1]]);
maliciousSheet.B1 = { t: "n", v: 1, f: "[evil.xlsx]Sheet1!A1" };
XLSX.utils.book_append_sheet(malicious, maliciousSheet, "견적");
assert.ok(scanWorkbookSecurity(malicious).some((finding) => finding.code === "DANGEROUS_FORMULA"));
(malicious as XLSX.WorkBook & { vbaraw?: Uint8Array }).vbaraw = new Uint8Array([1]);
assert.ok(scanWorkbookSecurity(malicious).some((finding) => finding.code === "MACRO"));

console.log("PASS: common Excel engine adapters, recognition, privacy fingerprint and security scanner");
