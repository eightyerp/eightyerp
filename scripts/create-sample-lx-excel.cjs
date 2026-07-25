/**
 * 샘플 LX 본사 창호견적 xlsx 생성 (로컬 검증용)
 * 실행: node scripts/create-sample-lx-excel.mjs
 */
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const rows = [
  ["LX 본사 창호 견적서"],
  ["견적번호", "LX-2026-0718-001"],
  ["견적일", "2026-07-18"],
  ["현장명", "당산 샘플 아파트 204동 702호"],
  ["담당자", "홍인표"],
  [],
  ["구분", "품명", "규격", "색상", "단가", "수량", "금액", "방충망", "위치"],
  [
    "창호",
    "LX F-250 이중창",
    "2480×2220",
    "화이트",
    450000,
    1,
    450000,
    "포함",
    "입구 우측방 확장",
  ],
  ["유리", "수퍼더블로이", "아르곤", "", 120000, 1, 120000, "", ""],
  [
    "창호",
    "LX 터닝도어",
    "900×2100",
    "화이트",
    680000,
    2,
    1360000,
    "미포함",
    "거실 발코니",
  ],
  ["부자재", "마감통바", "2.4m", "", 15000, 4, 60000, "", ""],
  ["시공", "철거·폐기물", "", "", 80000, 1, 80000, "", ""],
  ["시공", "양중·사다리차", "", "", 120000, 1, 120000, "", ""],
  ["시공", "표준시공비", "", "", 250000, 1, 250000, "", ""],
  ["할인", "프로모션 할인", "", "", "", "", 100000, "", ""],
  [],
  ["최종금액", 2340000],
  ["부가세", "별도"],
];

// 합계: 450k+120k + 1360k + 60k + 80k + 120k + 250k - 100k = 2,340,000
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, ws, "견적");
const outDir = path.join(__dirname, "..", "public", "samples");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "lx-window-sample.xlsx");
XLSX.writeFile(wb, out);
console.log("Wrote", out);
