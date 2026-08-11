/**
 * LX 본사 창호견적 .xlsx 파서·변환기 (클라이언트 순수 로직).
 * 금액은 엑셀 저장값을 재사용하며 새 가격식을 만들지 않는다.
 */

import * as XLSX from "xlsx";
import {
  encodeLxWindowRemark,
  formatQuantitySetDisplay,
  LX_WINDOW_TRADE_NAME,
  type LxWindowEditorItemKind,
  type LxWindowItemMeta,
} from "@/lib/crm/lx-window-meta";

export type LxImportCategory =
  | "창호제품"
  | "추가부자재"
  | "부가시공비"
  | "표준시공비"
  | "프로모션할인"
  | "기타";

export type LxImportRowStatus = "ok" | "warn" | "error";

export type LxImportPreviewRow = {
  id: string;
  selected: boolean;
  /** 사용자가 선택할 수 있는지 (오류·요약 행은 false) */
  selectable: boolean;
  /** detail=합계 대상, summary/reference=합계 제외 */
  kind: "detail" | "summary" | "reference";
  category: LxImportCategory;
  location: string;
  product: string;
  spec: string;
  glassSpec: string;
  color: string;
  quantity: number | null;
  quantityRaw: string;
  unit: string;
  unitPrice: number | null;
  amount: number | null;
  mosquitoNet: "포함" | "미포함" | "";
  status: LxImportRowStatus;
  statusReasons: string[];
  /** 미리보기 수량 칸 표시 (1 SET / 1 식 / -) */
  quantityDisplay: string;
  /** 원본 엑셀 행 힌트 */
  sourceHint: string;
  /** 엑셀 원본 행 번호 (1-based) */
  excelRow: number | null;
  /** 원본 구분·품명 요약 */
  sourceLabel: string;
  /** 확인 필요 시 수정할 필드 */
  fixFields: string[];
  /**
   * 합계 포함 여부.
   * 결합 완료 유리·보증/에너지·소계 행은 false.
   */
  includeInSum: boolean;
};

export type LxImportHeader = {
  quoteNumber: string | null;
  quoteDate: string | null;
  siteName: string | null;
  manager: string | null;
  finalAmount: number | null;
  vatIncluded: boolean | null;
  demolitionAmount: number | null;
  liftAmount: number | null;
  standardLaborAmount: number | null;
  promotionDiscount: number | null;
};

export type LxImportParseResult = {
  header: LxImportHeader;
  rows: LxImportPreviewRow[];
  /** 반영 차단 여부 */
  blocked: boolean;
  blockReasons: string[];
  convertedSum: number;
  warnings: string[];
};

type RawSheetRow = {
  no: string;
  category: string;
  name: string;
  spec: string;
  color: string;
  unitPrice: number | null;
  qty: number | null;
  qtyRaw: string;
  amount: number | null;
  /** HQ 양식: 같은 행의 유리 사양 텍스트 */
  glassSpecInline: string;
  mosquito: string;
  location: string;
  unit: string;
  excelRow: number;
  /** HQ 양식: 행별 표준시공비(합산용) */
  laborAmount: number | null;
  auxNote: string;
};

type HeaderColMap = Record<string, number>;

const WINDOW_TRADE = LX_WINDOW_TRADE_NAME;

/** 값으로 쓰면 안 되는 라벨(회사 카드·표 헤더 등) */
const VALUE_LABEL_BLOCKLIST = new Set(
  [
    "대표자",
    "상호",
    "사업자번호",
    "주소",
    "전화",
    "담당",
    "담당자",
    "견적번호",
    "견적일자",
    "견적일",
    "거래처",
    "현장",
    "현장명",
    "금액",
    "수량",
    "합계",
    "모델명",
    "품명",
    "규격",
    "방충망",
    "색상",
    "구분",
    "창",
    "단위",
    "단가",
    "no",
    "번호",
    "완성창총금액",
    "유리총금액",
    "표준시공총금액",
    "부가세별도",
    "부가세포함",
  ].map((s) => s.replace(/\s+/g, "").toLowerCase()),
);

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return String(value).replace(/[\s\u00a0]+/g, " ").trim();
}

function parseMoneyCell(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  const raw = String(value)
    .replace(/[원₩,\s\u00a0]/g, "")
    .replace(/^\((.*)\)$/, "-$1")
    .trim();
  if (!raw || raw === "-" || raw === "—" || raw === "재협의") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

/** 워크시트 셀: 표시값(w) 우선, 없으면 저장값(v) */
function moneyFromSheetCell(
  sheet: XLSX.WorkSheet,
  rowIndex: number,
  colIndex: number,
): number | null {
  const addr = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
  const cell = sheet[addr] as XLSX.CellObject | undefined;
  if (!cell) return null;
  if (cell.w != null && String(cell.w).trim() !== "") {
    const fromW = parseMoneyCell(cell.w);
    if (fromW != null) return fromW;
  }
  return parseMoneyCell(cell.v);
}

function parseQtyCell(value: unknown): { qty: number | null; raw: string } {
  if (value == null || value === "") return { qty: null, raw: "" };
  if (typeof value === "number" && Number.isFinite(value)) {
    return { qty: value, raw: String(value) };
  }
  const raw = String(value).trim();
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.-]/g, "");
  if (!cleaned) return { qty: null, raw };
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return { qty: null, raw };
  return { qty: n, raw };
}

/** 라벨 비교용: 공백·NBSP·괄호·콜론 제거 */
function normalizeHeader(text: string): string {
  return text
    .replace(/[\s\[\]\(\)　\u00a0]/g, "")
    .replace(/[:：]/g, "")
    .toLowerCase();
}

function matchHeader(cell: string, aliases: string[]): boolean {
  const n = normalizeHeader(cell);
  if (!n) return false;
  return aliases.some((a) => {
    const al = normalizeHeader(a);
    return n === al || n.startsWith(al) || al.startsWith(n);
  });
}

function isBlockedValueText(text: string): boolean {
  const n = normalizeHeader(text);
  if (!n) return true;
  if (VALUE_LABEL_BLOCKLIST.has(n)) return true;
  // 표 헤더성 문구
  if (/총금액$/.test(n) && n !== "총금액") return true;
  return false;
}

/** 금액 열: '완성창/유리/표준시공 총금액'은 제외하고 합계·금액만 */
function isLineTotalAmountHeader(text: string): boolean {
  const n = normalizeHeader(text);
  if (!n) return false;
  if (/완성창|유리총|표준시공|시공총|창호계|시공계/.test(n)) return false;
  return (
    n === "합계" ||
    n === "금액" ||
    n === "합계금액" ||
    n === "공급가" ||
    n === "공급가액" ||
    n.endsWith("합계")
  );
}

function isProductNameHeader(text: string): boolean {
  const n = normalizeHeader(text);
  return (
    n === "모델명" ||
    n === "품명" ||
    n === "품목" ||
    n === "제품명" ||
    n === "제품" ||
    n.includes("모델명")
  );
}

function classifyByText(name: string, category: string): LxImportCategory {
  const catOnly = category.replace(/\s+/g, "").toLowerCase();
  const nameOnly = name.replace(/\s+/g, "").toLowerCase();
  const hay = `${catOnly} ${nameOnly}`;

  if (
    /프로모션|프로로션|특별할인|할인액|할인금액|행사할인|단수정리|가격조정|기타부품할인|할인적용/.test(
      catOnly,
    ) ||
    /^(프로모션|프로로션|프로모션할인|특별할인|행사할인|할인|단수정리)/.test(
      nameOnly,
    ) ||
    /할인적용/.test(nameOnly)
  ) {
    return "프로모션할인";
  }
  if (/표준시공|시공비(?!·)|시공료/.test(hay)) return "표준시공비";
  if (/철거|폐기|양중|사다리|운반|폐기물|장비\/양중|외부코킹/.test(hay)) {
    return "부가시공비";
  }
  if (/마감통바|부자재|부속|실리콘|샷시캡|문풍지|몰딩|통바|랩핑/.test(hay)) {
    return "추가부자재";
  }
  if (/유리|글라스|로이|아르곤|슈퍼더블|수퍼더블|복층/.test(hay)) {
    return "창호제품";
  }
  if (
    /창호|이중창|시스템|터닝|도어|중문|슬라이딩|평창|케이스먼트|방화문|f-\d|lx\s*f/i.test(
      hay,
    )
  ) {
    return "창호제품";
  }
  return "기타";
}

function isGlassRow(name: string, category: string, no = ""): boolean {
  if (/^\d+-\d+$/.test(no.trim())) return true;
  const hay = `${category} ${name}`.replace(/\s+/g, "");
  if (/^(복층)?유리|로이유리|아르곤|슈퍼더블로이|수퍼더블로이|글라스/.test(hay)) {
    return true;
  }
  if (/유리/.test(hay) && !/창|도어|중문|시스템|터닝|이중/.test(hay)) {
    return true;
  }
  return /구분\s*[:：]?\s*유리|품명\s*[:：]?\s*유리/.test(hay);
}

/** 10년 보증·에너지등급 등 보조정보 행 */
function isAuxInfoRow(name: string, category: string): boolean {
  const hay = `${category} ${name}`.replace(/\s+/g, "");
  return /10년|품질보증|보증|에너지|소비효율|등급표기|효율등급/.test(hay);
}

/** 푸터·소계·합계·부가세 등 요약/메타 라벨 (어느 열에 있어도) */
function isSummaryOrMetaLabel(text: string): boolean {
  const n = normalizeHeader(text);
  if (!n) return false;
  // 모델명(…_프로모션)과 구분: 라벨 자체이거나 짧은 푸터 문구만
  if (
    /^(창호계|기타항목계|기타부품할인|표준시공비|표준시공|시공계|단수정리|가격조정)$/.test(
      n,
    )
  ) {
    return true;
  }
  if (
    /^(프로모션|프로로션|프로모션할인|프로로션할인|할인적용)$/.test(n) ||
    (/할인적용$/.test(n) && n.length <= 24)
  ) {
    return true;
  }
  if (/^(합계|총계|최종금액|총금액|견적금액|공급가|공급가액)$/.test(n)) {
    return true;
  }
  if (/^부가세/.test(n) && n.length <= 12) return true;
  if (/견적조건|안내사항|下記|하기와여히/.test(n)) return true;
  return false;
}

function isMetaOrTotalRow(name: string, category: string, no = ""): boolean {
  if (
    isSummaryOrMetaLabel(name) ||
    isSummaryOrMetaLabel(category) ||
    isSummaryOrMetaLabel(no)
  ) {
    return true;
  }
  const cat = category.replace(/[\s\[\]]/g, "");
  const nm = name.replace(/[\s\[\]]/g, "");
  // 구분 열만 요약 키워드로 판별 (품명에 '_프로모션' 포함된 창호는 제외)
  if (
    /^(창호계|표준시공비|시공계|기타부품할인|가격조정|단수정리|총계|최종금액|총금액|기타항목계|합계)$/.test(
      cat,
    )
  ) {
    return true;
  }
  if (
    /^(합계|총계|최종|최종금액|총금액|견적금액|공급가|공급가액|부가세|VAT|세금|비고)$/i.test(
      cat,
    )
  ) {
    return true;
  }
  if (/^(합계|총계|최종|최종금액|총금액|견적금액|공급가|부가세)$/i.test(nm)) {
    return true;
  }
  if (/최종|총금액|견적금액|합계|총계/.test(cat) && /^[\d,.-]+$/.test(nm)) {
    return true;
  }
  if (
    /부가세|VAT/i.test(cat) ||
    (/부가세|VAT/i.test(nm) && /별도|포함/.test(`${cat}${nm}`))
  ) {
    return true;
  }
  return false;
}

function sanitizeDisplayText(text: string): string {
  return text
    .replace(/\uFFFD/g, "")
    .replace(/[◈]/g, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isWindowProductRow(name: string, category: string, no = ""): boolean {
  if (isGlassRow(name, category, no)) return false;
  if (isAuxInfoRow(name, category)) return false;
  if (isMetaOrTotalRow(name, category, no)) return false;
  const cat = classifyByText(name, category);
  if (cat === "창호제품") return true;
  const catNorm = category.replace(/\s+/g, "");
  if (/^(창호|샷시|창)$/i.test(catNorm) || /^창호/.test(catNorm)) {
    return cat === "기타";
  }
  // No가 정수이면 창호 본행 후보
  if (/^\d+$/.test(no.trim()) && name) return true;
  return false;
}

function parentNoOf(childNo: string): string | null {
  const m = childNo.trim().match(/^(\d+)-\d+$/);
  return m?.[1] ?? null;
}

/**
 * 라벨 셀을 찾아 오른쪽(또는 같은 셀 콜론 뒤) 값을 반환.
 * 고정 행 번호에 의존하지 않는다.
 */
function findLabelValue(
  matrix: unknown[][],
  labels: string[],
  options?: {
    /** 부분일치 허용 (기본 true). false면 정규화 후 완전일치만 */
    loose?: boolean;
    maxRow?: number;
  },
): string | null {
  const loose = options?.loose !== false;
  const maxRow = options?.maxRow ?? Math.min(matrix.length, 80);
  const labelNorms = labels.map((l) => normalizeHeader(l)).filter(Boolean);

  for (let r = 0; r < maxRow; r++) {
    const row = matrix[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const text = cellText(row[c]);
      if (!text) continue;
      const n = normalizeHeader(text);
      if (!n) continue;

      const matched = labelNorms.some((l) => {
        if (n === l) return true;
        if (!loose) return false;
        // "현장방문후재결정"처럼 라벨+서술 문장은 제외
        if (n.startsWith(l) && (n.length === l.length || n.length <= l.length + 2)) {
          return true;
        }
        return false;
      });
      if (!matched) continue;

      // 같은 셀 "견적번호: TE…"
      const m = text.match(/[:：]\s*(.+)$/);
      if (m?.[1]) {
        const inline = m[1].trim();
        if (inline && !isBlockedValueText(inline)) {
          const inorm = normalizeHeader(inline);
          if (!labelNorms.some((l) => inorm === l || inorm.startsWith(l))) {
            return inline;
          }
        }
      }

      for (let k = c + 1; k < Math.min(row.length, c + 10); k++) {
        const right = cellText(row[k]);
        if (!right) continue;
        if (isBlockedValueText(right)) continue;
        const rn = normalizeHeader(right);
        if (labelNorms.some((l) => rn === l || rn.startsWith(l))) continue;
        return right;
      }

      // 병합으로 아래 행에 값이 있는 경우
      const below = cellText(matrix[r + 1]?.[c + 1] ?? matrix[r + 1]?.[c] ?? "");
      if (below && !isBlockedValueText(below)) {
        return below;
      }
    }
  }
  return null;
}

type FooterKind =
  | "total"
  | "labor"
  | "demolition"
  | "promo"
  | "windowSubtotal"
  | "adjustment";

function footerKindMatch(compact: string, kind: FooterKind): boolean {
  if (kind === "total") {
    return /^(총계|합계|최종금액|총금액|견적금액)$/.test(compact);
  }
  if (kind === "labor") return /^(표준시공비|표준시공)$/.test(compact);
  if (kind === "demolition") {
    return /^(철거|폐기물|철거폐기|철거비|폐기)$/.test(compact);
  }
  if (kind === "windowSubtotal") return /^(창호계)$/.test(compact);
  if (kind === "adjustment") {
    return /^(단수정리|가격조정)$/.test(compact);
  }
  // 프로로션(오타) · 할인적용 포함
  return /프로모션|프로로션|행사할인|기타부품할인|할인적용/.test(compact);
}

/** 푸터 [총계] / [표준시공비] 등에서 금액 추출 (데이터 행 오인 방지) */
function findBracketFooterAmount(
  matrix: unknown[][],
  sheet: XLSX.WorkSheet,
  kind: FooterKind,
): number | null {
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const text = cellText(row[c]);
      if (!text) continue;
      const compact = normalizeHeader(text);
      if (!footerKindMatch(compact, kind)) continue;

      const hasBracket = /\[[\s\u00a0]*[^\]]+[\s\u00a0]*\]/.test(text);
      // 총계/최종금액은 괄호 없이도 허용. 그 외는 [표준시공비]처럼 괄호 푸터만.
      if (kind !== "total" && !hasBracket) continue;

      for (let k = row.length - 1; k > c; k--) {
        const amt = moneyFromSheetCell(sheet, r, k) ?? parseMoneyCell(row[k]);
        if (amt != null) return amt;
      }
      const inline = parseMoneyCell(
        text.replace(
          /[\[\]총계최종금액표준시공비철거폐기프로모션행사할인부품단수정리가격조정창호계]/g,
          "",
        ),
      );
      if (inline != null) return inline;
    }
  }
  return null;
}

function findHeaderRow(matrix: unknown[][]): {
  rowIndex: number;
  map: HeaderColMap;
  hqFormat: boolean;
} | null {
  for (let r = 0; r < Math.min(matrix.length, 80); r++) {
    const row = matrix[r] ?? [];
    const map: HeaderColMap = {};
    for (let c = 0; c < row.length; c++) {
      const text = cellText(row[c]);
      if (!text) continue;
      if (map.name == null && isProductNameHeader(text)) map.name = c;
      if (map.spec == null && matchHeader(text, ["규격", "사이즈"])) map.spec = c;
      if (map.qty == null && normalizeHeader(text) === "수량") map.qty = c;
      if (map.amount == null && isLineTotalAmountHeader(text)) map.amount = c;
      if (map.category == null && matchHeader(text, ["구분", "분류"])) {
        map.category = c;
      }
      if (map.color == null && matchHeader(text, ["색상", "칼라", "컬러"])) {
        map.color = c;
      }
      if (map.unitPrice == null && normalizeHeader(text) === "단가") {
        map.unitPrice = c;
      }
      if (map.mosquito == null && matchHeader(text, ["방충망"])) map.mosquito = c;
      if (map.location == null && matchHeader(text, ["위치", "설치위치", "호실"])) {
        map.location = c;
      }
      if (map.unit == null && normalizeHeader(text) === "단위") map.unit = c;
      if (
        map.no == null &&
        (normalizeHeader(text) === "no" ||
          normalizeHeader(text) === "번호" ||
          normalizeHeader(text) === "구분번호")
      ) {
        map.no = c;
      }
      if (map.glassSpec == null && /유리/.test(normalizeHeader(text))) {
        if (!/총금액|금액|단가/.test(normalizeHeader(text))) {
          map.glassSpec = c;
        }
      }
      if (
        map.windowAmount == null &&
        /완성창/.test(normalizeHeader(text)) &&
        /금액|합계/.test(normalizeHeader(text))
      ) {
        map.windowAmount = c;
      }
      if (
        map.glassAmount == null &&
        /유리/.test(normalizeHeader(text)) &&
        /총금액|금액/.test(normalizeHeader(text))
      ) {
        map.glassAmount = c;
      }
      if (
        map.laborAmount == null &&
        /표준시공/.test(normalizeHeader(text)) &&
        /금액|합계/.test(normalizeHeader(text))
      ) {
        map.laborAmount = c;
      }
      if (map.windowType == null && normalizeHeader(text) === "창") {
        map.windowType = c;
      }
    }

    const hqFormat =
      map.name != null &&
      (map.windowAmount != null || map.glassSpec != null) &&
      (map.amount != null || map.windowAmount != null);

    const simpleOk =
      map.name != null &&
      map.amount != null &&
      (map.qty != null || map.spec != null);

    if (hqFormat || simpleOk) {
      if (map.amount == null && map.windowAmount != null) {
        map.amount = map.windowAmount;
      }
      return { rowIndex: r, map, hqFormat };
    }
  }
  return null;
}

function matrixFromSheet(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];
}

/** 데이터·총계가 있는 시트를 우선 선택 (LX 본사 다중 시트 대응) */
function pickWorkbookSheet(workbook: XLSX.WorkBook): {
  sheetName: string;
  sheet: XLSX.WorkSheet;
  matrix: unknown[][];
} | null {
  let best: {
    sheetName: string;
    sheet: XLSX.WorkSheet;
    matrix: unknown[][];
    score: number;
  } | null = null;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = matrixFromSheet(sheet);
    const found = findHeaderRow(matrix);
    if (!found) continue;
    let dataRows = 0;
    for (let r = found.rowIndex + 1; r < matrix.length; r++) {
      const row = matrix[r] ?? [];
      const name = cellText(
        found.map.name != null ? row[found.map.name] : "",
      );
      if (name && !isMetaOrTotalRow(name, "")) dataRows += 1;
    }
    const blob = matrix
      .slice(0, 25)
      .map((row) => row.map((c) => cellText(c)).join(" "))
      .join(" ");
    const compactBlob = blob.replace(/[\s\u00a0]+/g, "");
    const hasTe = /TE\d{6,}/i.test(compactBlob);
    const hasTotal =
      findBracketFooterAmount(matrix, sheet, "total") != null ||
      findLabelValue(matrix, ["최종금액"], { loose: false }) != null ||
      findLabelValue(matrix, ["금액"], { loose: false }) != null;
    const hasSite = findLabelValue(matrix, ["현장명", "현장"], { loose: false }) != null;
    const score =
      dataRows * 10 +
      (hasTe ? 80 : 0) +
      (hasTotal ? 30 : 0) +
      (hasSite ? 20 : 0) +
      (found.hqFormat ? 20 : 0);
    if (!best || score > best.score) {
      best = { sheetName, sheet, matrix, score };
    }
  }

  if (!best) return null;
  return {
    sheetName: best.sheetName,
    sheet: best.sheet,
    matrix: best.matrix,
  };
}

function mosquitoFromText(raw: string): "포함" | "미포함" | "" {
  const t = raw.replace(/\s+/g, "");
  if (!t) return "";
  if (/미포함|없음|무|x|×|n/i.test(t)) return "미포함";
  if (/포함|유|o|○|y|있음/i.test(t)) return "포함";
  return "";
}

function buildGlassSpec(name: string, spec: string): string {
  const parts = [name, spec].map((s) => s.trim()).filter(Boolean);
  if (parts[0] && /^(복층)?유리$/.test(parts[0]) && parts[1]) {
    return parts[1];
  }
  return parts.join(" · ");
}

function qtyDisplayForCategory(
  category: LxImportCategory,
  qty: number | null,
  unit: string,
): string {
  if (category === "프로모션할인") return "-";
  if (qty == null) return "-";
  if (
    category === "창호제품" &&
    (unit === "SET" || !unit || unit === "세트" || unit === "틀")
  ) {
    return formatQuantitySetDisplay(qty);
  }
  const unitLabel = unit || "식";
  const n = Math.round(qty * 1000) / 1000;
  const q = Number.isInteger(n)
    ? String(n)
    : String(n)
        .replace(/(\.\d*?[1-9])0+$/, "$1")
        .replace(/\.0+$/, "");
  return `${q} ${unitLabel}`;
}

function uid(prefix: string, i: number): string {
  return `${prefix}-${i}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 선택·정상·detail 행만 합산 (프로모션은 부호와 무관하게 차감) */
export function sumLxImportRows(
  rows: Array<
    Pick<
      LxImportPreviewRow,
      | "selected"
      | "selectable"
      | "kind"
      | "status"
      | "category"
      | "amount"
      | "includeInSum"
    >
  >,
): {
  windowGlass: number;
  extras: number;
  labor: number;
  materials: number;
  other: number;
  promo: number;
  net: number;
} {
  let windowGlass = 0;
  let extras = 0;
  let labor = 0;
  let materials = 0;
  let other = 0;
  let promo = 0;

  for (const r of rows) {
    if (r.selected !== true) continue;
    if (r.selectable === false) continue;
    if (r.kind != null && r.kind !== "detail") continue;
    if (r.status === "error") continue;
    if (r.includeInSum === false) continue;
    if (r.amount == null || !Number.isFinite(r.amount)) continue;

    if (r.category === "프로모션할인") {
      promo += Math.abs(r.amount);
      continue;
    }
    if (r.category === "창호제품") windowGlass += r.amount;
    else if (r.category === "부가시공비") extras += r.amount;
    else if (r.category === "표준시공비") labor += r.amount;
    else if (r.category === "추가부자재") materials += r.amount;
    else other += r.amount;
  }

  return {
    windowGlass,
    extras,
    labor,
    materials,
    other,
    promo,
    net: windowGlass + extras + labor + materials + other - promo,
  };
}

function fixFieldsForRow(
  status: LxImportRowStatus,
  reasons: string[],
  category: LxImportCategory,
): string[] {
  if (status === "ok") return [];
  const fields: string[] = [];
  for (const reason of reasons) {
    if (reason.includes("금액")) fields.push("금액");
    if (reason.includes("수량")) fields.push("수량");
    if (reason.includes("단위")) fields.push("단위");
    if (reason.includes("연결") || reason.includes("유리")) {
      fields.push("유리 사양", "분류");
    }
    if (reason.includes("분류")) fields.push("분류");
  }
  if (fields.length === 0 && category === "창호제품") fields.push("금액", "수량");
  if (fields.length === 0) fields.push("금액");
  return [...new Set(fields)];
}

function resolveFinalAmount(
  matrix: unknown[][],
  sheet: XLSX.WorkSheet,
  warnings: string[],
): number | null {
  const footerTotal = findBracketFooterAmount(matrix, sheet, "total");
  const windowSub = findBracketFooterAmount(matrix, sheet, "windowSubtotal");
  const labor = findBracketFooterAmount(matrix, sheet, "labor");
  const adjustment = findBracketFooterAmount(matrix, sheet, "adjustment");
  const promo = findBracketFooterAmount(matrix, sheet, "promo");

  const headerAmount = parseMoneyCell(
    findLabelValue(matrix, ["금액"], { loose: false }),
  );
  const labeledFinal = parseMoneyCell(
    findLabelValue(matrix, ["최종금액"], { loose: false }),
  );

  let componentSum: number | null = null;
  if (windowSub != null && labor != null) {
    componentSum =
      windowSub + labor + (adjustment ?? 0) + (promo ?? 0);
  }

  // HQ처럼 표시 총계만 수십 원 반올림된 경우에만 항목 합 사용
  if (
    footerTotal != null &&
    componentSum != null &&
    footerTotal !== componentSum &&
    Math.abs(footerTotal - componentSum) <= 200
  ) {
    warnings.push(
      `엑셀 총계 표시(${footerTotal.toLocaleString("ko-KR")}원)와 창호계·시공 합(${componentSum.toLocaleString("ko-KR")}원)이 달라, 항목 합 기준으로 검증합니다.`,
    );
    return componentSum;
  }

  if (labeledFinal != null) return labeledFinal;
  if (footerTotal != null) return footerTotal;
  if (headerAmount != null) return headerAmount;
  if (componentSum != null) return componentSum;
  return null;
}

function resolveSiteName(matrix: unknown[][]): string | null {
  // 거래처/고객명보다 현장 라벨을 우선. 대표자 등은 blocklist로 차단.
  return (
    findLabelValue(matrix, ["현장명", "현장"], { loose: false }) ||
    findLabelValue(matrix, ["공사명"], { loose: false })
  );
}

/**
 * ArrayBuffer(.xlsx) → 변환 미리보기 모델
 */
export function parseLxWindowExcelBuffer(
  buffer: ArrayBuffer,
): LxImportParseResult {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    cellNF: true,
  });
  const picked = pickWorkbookSheet(workbook);
  if (!picked) {
    return {
      header: emptyHeader(),
      rows: [],
      blocked: true,
      blockReasons: [
        "품명·수량·금액 열을 찾지 못했습니다. LX 본사 창호견적 양식(.xlsx)인지 확인해 주세요.",
      ],
      convertedSum: 0,
      warnings: [],
    };
  }
  const { matrix, sheet } = picked;
  const warnings: string[] = [];
  const blockReasons: string[] = [];

  const footerLabor = findBracketFooterAmount(matrix, sheet, "labor");
  const footerDemo = findBracketFooterAmount(matrix, sheet, "demolition");
  const footerPromo = findBracketFooterAmount(matrix, sheet, "promo");
  const footerAdj = findBracketFooterAmount(matrix, sheet, "adjustment");

  const header: LxImportHeader = {
    quoteNumber: findLabelValue(matrix, ["견적번호", "견적No", "견적no"], {
      loose: false,
    }),
    quoteDate: findLabelValue(matrix, ["견적일", "견적일자", "작성일"], {
      loose: false,
    }),
    siteName: resolveSiteName(matrix),
    manager: findLabelValue(matrix, ["담당자", "담당", "영업담당", "작성자"], {
      loose: false,
    }),
    finalAmount: resolveFinalAmount(matrix, sheet, warnings),
    vatIncluded: (() => {
      const blob = matrix
        .slice(0, 20)
        .map((row) => row.map((c) => cellText(c)).join(" "))
        .join(" ");
      if (/부가세\s*포함|세금포함/i.test(blob) && !/부가세\s*별도/i.test(blob)) {
        return true;
      }
      if (/부가세\s*별도|\(부가세별도\)/i.test(blob)) return false;
      const v = findLabelValue(matrix, ["부가세", "VAT", "세금"], { loose: false });
      if (!v) return null;
      if (/포함|별도\s*아님|includ/i.test(v)) return true;
      if (/별도|미포함|exclud/i.test(v)) return false;
      return null;
    })(),
    demolitionAmount:
      footerDemo ??
      parseMoneyCell(
        findLabelValue(matrix, ["철거", "철거비", "폐기", "철거·폐기"], {
          loose: false,
        }),
      ),
    liftAmount: parseMoneyCell(
      findLabelValue(matrix, ["양중", "양중비", "사다리차"], { loose: false }),
    ),
    standardLaborAmount:
      footerLabor ??
      parseMoneyCell(
        findLabelValue(matrix, ["표준시공비"], { loose: false }),
      ),
    promotionDiscount: (() => {
      const n =
        footerPromo ??
        footerAdj ??
        parseMoneyCell(
          findLabelValue(
            matrix,
            [
              "프로모션",
              "프로모션할인",
              "프로로션",
              "행사할인",
              "할인적용",
            ],
            { loose: false },
          ),
        );
      return n == null ? null : n;
    })(),
  };

  const found = findHeaderRow(matrix);
  if (!found) {
    return {
      header,
      rows: [],
      blocked: true,
      blockReasons: [
        "품명·수량·금액 열을 찾지 못했습니다. LX 본사 창호견적 양식(.xlsx)인지 확인해 주세요.",
      ],
      convertedSum: 0,
      warnings,
    };
  }

  const { rowIndex, map, hqFormat } = found;
  const rawRows: RawSheetRow[] = [];

  for (let r = rowIndex + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const name = cellText(map.name != null ? row[map.name] : "");
    const category = cellText(map.category != null ? row[map.category] : "");
    const no = cellText(map.no != null ? row[map.no] : "");
    const windowAmt =
      map.windowAmount != null
        ? moneyFromSheetCell(sheet, r, map.windowAmount)
        : null;
    const glassAmt =
      map.glassAmount != null
        ? moneyFromSheetCell(sheet, r, map.glassAmount)
        : null;
    const laborAmt =
      map.laborAmount != null
        ? moneyFromSheetCell(sheet, r, map.laborAmount)
        : null;
    let amount =
      map.amount != null ? moneyFromSheetCell(sheet, r, map.amount) : null;

    // HQ: 창호 금액 = 완성창+유리만. 합계열(시공 포함)은 쓰지 않아 이중합산 방지.
    // 부가세는 엑셀 저장값 그대로 사용하고 10%를 다시 더하지 않는다.
    if (hqFormat) {
      if (windowAmt != null || glassAmt != null) {
        amount = Math.round((windowAmt ?? 0) + (glassAmt ?? 0));
      } else {
        amount = null;
      }
    }

    if (!name && amount == null && !category && !no) continue;

    // 요약/메타 행: No·구분·품명 어디에 라벨이 있어도 항목으로 만들지 않음
    if (isMetaOrTotalRow(name, category, no)) {
      continue;
    }

    // 품명 없이 금액만 있는 행은 요약 셀로 보고 제외
    if (!sanitizeDisplayText(name)) {
      continue;
    }

    // HQ 푸터처럼 모델명 없이 금액만 있는 행 스킵
    if (!name && hqFormat) continue;

    // 금액 0·모델 없는 빈 행(예: 미기재 방화문) 스킵
    if (hqFormat && name && (amount == null || amount === 0) && !laborAmt) {
      const qtyCheck = parseQtyCell(map.qty != null ? row[map.qty] : "");
      if (qtyCheck.qty == null) continue;
    }

    const qtyParsed = parseQtyCell(map.qty != null ? row[map.qty] : "");
    const glassInline = cellText(
      map.glassSpec != null ? row[map.glassSpec] : "",
    );
    const windowType = cellText(
      map.windowType != null ? row[map.windowType] : "",
    );
    const locationCol = cellText(
      map.location != null ? row[map.location] : "",
    );
    const location =
      locationCol ||
      [category, windowType].filter(Boolean).join(" · ") ||
      "";

    rawRows.push({
      no,
      category: sanitizeDisplayText(category),
      name: sanitizeDisplayText(name),
      spec: sanitizeDisplayText(
        cellText(map.spec != null ? row[map.spec] : "").replace(/x/gi, "×"),
      ),
      color: cellText(map.color != null ? row[map.color] : ""),
      unitPrice:
        map.unitPrice != null
          ? moneyFromSheetCell(sheet, r, map.unitPrice)
          : null,
      qty: qtyParsed.qty,
      qtyRaw: qtyParsed.raw,
      amount,
      glassSpecInline: sanitizeDisplayText(glassInline),
      mosquito: cellText(map.mosquito != null ? row[map.mosquito] : ""),
      location: sanitizeDisplayText(location),
      unit: cellText(map.unit != null ? row[map.unit] : ""),
      excelRow: r + 1,
      laborAmount: laborAmt,
      auxNote: "",
    });
  }

  // 보조정보(보증·에너지)를 직전 창호에 붙이고 raw에서 제거
  const cleanedRaw: RawSheetRow[] = [];
  for (const cur of rawRows) {
    if (isAuxInfoRow(cur.name, cur.category)) {
      const prev = cleanedRaw[cleanedRaw.length - 1];
      if (prev && !isGlassRow(prev.name, prev.category, prev.no)) {
        const note = buildGlassSpec(cur.name, cur.spec);
        prev.auxNote = [prev.auxNote, note].filter(Boolean).join(" · ");
        continue;
      }
      // 연결 대상 없으면 스킵(별도 금액 행으로 만들지 않음)
      continue;
    }
    cleanedRaw.push(cur);
  }

  const previewRows: LxImportPreviewRow[] = [];
  let i = 0;
  let seq = 0;
  const used = new Set<number>();

  while (i < cleanedRaw.length) {
    if (used.has(i)) {
      i += 1;
      continue;
    }
    const cur = cleanedRaw[i]!;
    const cat = classifyByText(cur.name, cur.category);

    if (
      cat === "프로모션할인" ||
      cat === "표준시공비" ||
      cat === "부가시공비" ||
      cat === "추가부자재"
    ) {
      const reasons: string[] = [];
      let status: LxImportRowStatus = "ok";
      if (cur.amount == null) {
        status = "error";
        reasons.push("금액을 읽지 못했습니다.");
      }
      if (cat !== "프로모션할인" && cat !== "추가부자재" && cur.qty == null) {
        status = status === "error" ? "error" : "warn";
        reasons.push(
          "수량이 비어 있거나 숫자가 아닙니다. 반영 전 확인해 주세요.",
        );
      }
      const unit =
        cat === "프로모션할인"
          ? ""
          : cat === "추가부자재"
            ? cur.unit.trim() || "식"
            : "식";
      const qty =
        cat === "프로모션할인"
          ? null
          : cat === "추가부자재"
            ? (cur.qty ?? 1)
            : (cur.qty ?? 1);
      const sourceLabel = [cur.category, cur.name].filter(Boolean).join(" / ");
      const selectable = status !== "error";
      previewRows.push({
        id: uid("lx", seq++),
        selected: selectable,
        selectable,
        kind: "detail",
        category: cat,
        location: cur.location,
        product: cur.name,
        spec: cur.spec,
        glassSpec: "",
        color: cur.color,
        quantity: qty,
        quantityRaw: cur.qtyRaw,
        unit,
        unitPrice: cur.unitPrice,
        // 할인은 엑셀 부호 유지(음수)
        amount: cur.amount,
        mosquitoNet: "",
        status,
        statusReasons: reasons,
        quantityDisplay: qtyDisplayForCategory(cat, qty, unit),
        sourceHint: `행 ${cur.excelRow}`,
        excelRow: cur.excelRow,
        sourceLabel,
        fixFields: fixFieldsForRow(status, reasons, cat),
        includeInSum: selectable,
      });
      used.add(i);
      i += 1;
      continue;
    }

    // 창호 제품 (+ No 1/1-1 또는 다음 유리 행 결합, HQ 같은 행 유리)
    if (
      !isMetaOrTotalRow(cur.name, cur.category) &&
      (hqFormat ||
        isWindowProductRow(cur.name, cur.category, cur.no) ||
        cat === "창호제품")
    ) {
      const reasons: string[] = [];
      let status: LxImportRowStatus = "ok";
      let glassSpec = cur.glassSpecInline || "";
      let amount = cur.amount;
      let mosquito = mosquitoFromText(cur.mosquito);
      let linkedGlass = false;
      let linkedRowHint = "";

      // No 기반: 같은 부모번호의 1-1, 1-2… 유리/보조 행 결합
      if (!hqFormat && /^\d+$/.test(cur.no.trim())) {
        const parent = cur.no.trim();
        for (let j = i + 1; j < cleanedRaw.length; j++) {
          if (used.has(j)) continue;
          const child = cleanedRaw[j]!;
          const childParent = parentNoOf(child.no);
          const isChildNo = childParent === parent;
          const isNextGlass =
            j === i + 1 && isGlassRow(child.name, child.category, child.no);
          if (!isChildNo && !isNextGlass) {
            if (childParent && Number(childParent) > Number(parent)) break;
            if (/^\d+$/.test(child.no.trim())) break;
            if (!isGlassRow(child.name, child.category, child.no)) break;
          }
          if (
            !isChildNo &&
            !isGlassRow(child.name, child.category, child.no) &&
            !isAuxInfoRow(child.name, child.category)
          ) {
            break;
          }
          if (isAuxInfoRow(child.name, child.category)) {
            const note = buildGlassSpec(child.name, child.spec);
            glassSpec = [glassSpec, note].filter(Boolean).join(" · ");
            used.add(j);
            linkedRowHint += `+${child.excelRow}`;
            continue;
          }
          if (isGlassRow(child.name, child.category, child.no) || isChildNo) {
            linkedGlass = true;
            const g = buildGlassSpec(child.name, child.spec);
            glassSpec = [glassSpec, g].filter(Boolean).join(" · ");
            if (cur.amount != null && child.amount != null) {
              amount = cur.amount + child.amount;
            } else if (amount == null && child.amount != null) {
              amount = child.amount;
            }
            if (!mosquito) mosquito = mosquitoFromText(child.mosquito);
            if (
              cur.qty != null &&
              child.qty != null &&
              cur.qty !== child.qty
            ) {
              status = "error";
              reasons.push(
                `창호 수량(${cur.qty})과 유리 수량(${child.qty})이 달라 자동 확정할 수 없습니다.`,
              );
            }
            used.add(j);
            linkedRowHint += `+${child.excelRow}`;
            if (!isChildNo) break;
          }
        }
      } else if (
        !hqFormat &&
        cleanedRaw[i + 1] &&
        isGlassRow(
          cleanedRaw[i + 1]!.name,
          cleanedRaw[i + 1]!.category,
          cleanedRaw[i + 1]!.no,
        )
      ) {
        const next = cleanedRaw[i + 1]!;
        linkedGlass = true;
        glassSpec = buildGlassSpec(next.name, next.spec);
        if (cur.amount != null && next.amount != null) {
          amount = cur.amount + next.amount;
        } else if (amount == null && next.amount != null) {
          amount = next.amount;
        }
        if (!mosquito) mosquito = mosquitoFromText(next.mosquito);
        if (cur.qty != null && next.qty != null && cur.qty !== next.qty) {
          status = "error";
          reasons.push(
            `창호 수량(${cur.qty})과 유리 수량(${next.qty})이 달라 자동 확정할 수 없습니다.`,
          );
        }
        used.add(i + 1);
        linkedRowHint = `+${next.excelRow}`;
      } else if (!hqFormat && isGlassRow(cur.name, cur.category, cur.no)) {
        status = "error";
        reasons.push("창호 행과 연결되지 않은 유리입니다.");
        glassSpec = buildGlassSpec(cur.name, cur.spec);
      }

      if (cur.auxNote) {
        glassSpec = [glassSpec, cur.auxNote].filter(Boolean).join(" · ");
      }

      if (amount == null) {
        status = "error";
        reasons.push("금액을 읽지 못했습니다.");
      }
      if (cur.qty == null) {
        status = status === "error" ? "error" : "warn";
        reasons.push(
          "수량이 비어 있거나 숫자가 아닙니다. 반영 전 확인해 주세요.",
        );
      }

      const qty = cur.qty;
      const isOrphanGlass =
        !hqFormat && isGlassRow(cur.name, cur.category, cur.no) && !linkedGlass;
      const sourceLabel = [cur.category, cur.name].filter(Boolean).join(" / ");
      const selectable = status !== "error" && !isOrphanGlass;

      previewRows.push({
        id: uid("lx", seq++),
        selected: selectable,
        selectable,
        kind: "detail",
        category: "창호제품",
        location: cur.location,
        product: isOrphanGlass ? "" : cur.name,
        spec: isOrphanGlass ? "" : cur.spec,
        glassSpec,
        color: cur.color,
        quantity: qty,
        quantityRaw: cur.qtyRaw,
        unit: "SET",
        unitPrice: cur.unitPrice,
        amount,
        mosquitoNet: mosquito,
        status,
        statusReasons: reasons,
        quantityDisplay: qtyDisplayForCategory("창호제품", qty, "SET"),
        sourceHint: `행 ${cur.excelRow}${linkedRowHint}`,
        excelRow: cur.excelRow,
        sourceLabel,
        fixFields: fixFieldsForRow(status, reasons, "창호제품"),
        includeInSum: selectable,
      });
      used.add(i);
      i += 1;
      continue;
    }

    // 안내·재협의 문구 등 금액 없는 메모 행은 미리보기에서 제외
    {
      const noteHay = normalizeHeader(`${cur.category}${cur.name}${cur.spec}`);
      if (
        /현장방문|재결정|재협의|참조|안내사항|견적조건/.test(noteHay) &&
        (cur.amount == null || cur.amount === 0)
      ) {
        used.add(i);
        i += 1;
        continue;
      }
    }

    // 기타 — 할인율·단가 오인 값은 합계 제외
    {
      const reasons: string[] = [];
      let status: LxImportRowStatus = "warn";
      reasons.push("분류를 확인하세요.");
      if (cur.amount == null) {
        status = "error";
        reasons.push("금액을 읽지 못했습니다.");
      }
      const looksLikeRate =
        cur.amount != null &&
        Math.abs(cur.amount) > 0 &&
        Math.abs(cur.amount) <= 100 &&
        /율|%|할인율|vat/i.test(`${cur.name}${cur.category}`);
      const sourceLabel = [cur.category, cur.name].filter(Boolean).join(" / ");
      const rowStatus: LxImportRowStatus = looksLikeRate ? "warn" : status;
      const selectable = rowStatus !== "error" && !looksLikeRate;
      previewRows.push({
        id: uid("lx", seq++),
        selected: selectable,
        selectable,
        kind: looksLikeRate ? "reference" : "detail",
        category: "기타",
        location: cur.location,
        product: cur.name,
        spec: cur.spec,
        glassSpec: "",
        color: cur.color,
        quantity: cur.qty,
        quantityRaw: cur.qtyRaw,
        unit: cur.unit || "",
        unitPrice: cur.unitPrice,
        amount: cur.amount,
        mosquitoNet: mosquitoFromText(cur.mosquito),
        status: rowStatus,
        statusReasons: looksLikeRate
          ? [...reasons, "할인율·단가로 보여 합계에서 제외했습니다."]
          : reasons,
        quantityDisplay: qtyDisplayForCategory("기타", cur.qty, cur.unit || ""),
        sourceHint: `행 ${cur.excelRow}`,
        excelRow: cur.excelRow,
        sourceLabel,
        fixFields: fixFieldsForRow(rowStatus, reasons, "기타"),
        includeInSum: selectable,
      });
      used.add(i);
      i += 1;
    }
  }

  const ensureSummaryRow = (
    category: LxImportCategory,
    product: string,
    amount: number | null | undefined,
  ) => {
    if (amount == null || amount === 0) return;
    const exists = previewRows.some(
      (r) =>
        r.kind === "detail" &&
        r.includeInSum !== false &&
        r.category === category &&
        (r.product === product || Math.abs((r.amount ?? 0) - amount) < 1),
    );
    if (exists) return;
    previewRows.push({
      id: uid("sum", seq++),
      selected: true,
      selectable: true,
      kind: "detail",
      category,
      location: "",
      product,
      spec: "",
      glassSpec: "",
      color: "",
      quantity: category === "프로모션할인" ? null : 1,
      quantityRaw: "1",
      unit: category === "프로모션할인" ? "" : "식",
      unitPrice: category === "프로모션할인" ? null : Math.abs(amount),
      amount,
      mosquitoNet: "",
      status: "ok",
      statusReasons: [],
      quantityDisplay: qtyDisplayForCategory(
        category,
        category === "프로모션할인" ? null : 1,
        "식",
      ),
      sourceHint: "헤더 요약",
      excelRow: null,
      sourceLabel: product,
      fixFields: [],
      includeInSum: true,
    });
  };

  ensureSummaryRow("부가시공비", "철거·폐기", header.demolitionAmount);
  ensureSummaryRow("부가시공비", "양중·사다리차", header.liftAmount);

  if (hqFormat) {
    const laborFromLines = cleanedRaw.reduce(
      (s, r) => s + Math.max(0, r.laborAmount ?? 0),
      0,
    );
    const labor =
      header.standardLaborAmount != null && header.standardLaborAmount !== 0
        ? header.standardLaborAmount
        : laborFromLines > 0
          ? Math.round(laborFromLines)
          : null;
    if (labor != null && labor !== 0) {
      header.standardLaborAmount = labor;
      ensureSummaryRow("표준시공비", "표준시공비", labor);
    }
  } else {
    ensureSummaryRow("표준시공비", "표준시공비", header.standardLaborAmount);
  }

  // 프로모션/단수정리: 엑셀 부호 유지
  if (header.promotionDiscount != null && header.promotionDiscount !== 0) {
    ensureSummaryRow("프로모션할인", "프로모션 할인", header.promotionDiscount);
  }

  // 합계: detail + selectable + selected + non-error 만
  const convertedSum = sumLxImportRows(previewRows).net;

  if (header.finalAmount != null) {
    if (header.finalAmount !== convertedSum) {
      blockReasons.push(
        `원본 최종금액(${header.finalAmount.toLocaleString("ko-KR")}원)과 변환 합계(${convertedSum.toLocaleString("ko-KR")}원)가 다릅니다.`,
      );
    }
  } else {
    warnings.push(
      "원본 최종금액을 읽지 못했습니다. 합계를 수동으로 확인해 주세요.",
    );
    blockReasons.push("원본 최종금액을 읽지 못해 합계를 검증할 수 없습니다.");
  }

  const errorRows = previewRows.filter((r) => r.status === "error");
  const hasLinkError = errorRows.some((r) =>
    r.statusReasons.some((x) => x.includes("연결") || x.includes("수량이 달라")),
  );
  if (hasLinkError) {
    blockReasons.push("창호와 유리 연결을 확정할 수 없는 행이 있습니다.");
  }
  const amountErrors = errorRows.filter((r) =>
    r.statusReasons.some((x) => x.includes("금액을 읽지")),
  );
  if (amountErrors.length > 0) {
    const hints = amountErrors
      .slice(0, 5)
      .map((r) =>
        r.excelRow
          ? `행 ${r.excelRow}(${r.sourceLabel || r.product || "품명 없음"})`
          : r.sourceLabel || r.product || r.sourceHint,
      )
      .join(", ");
    blockReasons.push(
      `금액을 읽지 못한 행이 ${amountErrors.length}개 있습니다: ${hints}`,
    );
  }
  if (
    errorRows.some(
      (r) =>
        r.category === "창호제품" &&
        r.quantity == null &&
        r.statusReasons.some((x) => x.includes("수량")),
    )
  ) {
    blockReasons.push("수량이 숫자가 아닌 창호 행이 있습니다.");
  }

  const blocked = blockReasons.length > 0;

  return {
    header,
    rows: previewRows,
    blocked,
    blockReasons,
    convertedSum,
    warnings,
  };
}

function emptyHeader(): LxImportHeader {
  return {
    quoteNumber: null,
    quoteDate: null,
    siteName: null,
    manager: null,
    finalAmount: null,
    vatIncluded: null,
    demolitionAmount: null,
    liftAmount: null,
    standardLaborAmount: null,
    promotionDiscount: null,
  };
}

export type LxImportApplyLine = {
  trade_name: string;
  item_name: string;
  description: string;
  remark: string;
  quantity: string;
  unit: string;
  unit_price: string;
  amount: string;
  cost_type: "자재" | "시공" | "시공+자재" | "기타";
  is_lx_material: boolean;
  window_item_kind?: LxWindowEditorItemKind;
  window_location?: string;
  window_extra_remark?: string;
};

export type LxImportApplyResult = {
  lines: LxImportApplyLine[];
  promotionDiscount: number;
  promotionMemo: string;
};

/** 미리보기에서 선택된 행 → 견적 항목(폼 state용) */
export function buildQuoteLinesFromLxImport(
  rows: LxImportPreviewRow[],
): LxImportApplyResult {
  const lines: LxImportApplyLine[] = [];
  let promotionDiscount = 0;

  for (const row of rows) {
    if (!row.selected) continue;
    if (row.status === "error") continue;

    if (row.category === "프로모션할인") {
      // ERP 프로모션 할인 필드는 양수 금액으로 전달(기존 계산 유지)
      promotionDiscount += Math.abs(row.amount ?? 0);
      continue;
    }

    if (row.category === "창호제품") {
      const qty = row.quantity;
      const amount = Math.max(0, Math.round(row.amount ?? 0));
      const unitPrice =
        qty != null && qty > 0
          ? Math.round(amount / qty)
          : Math.max(0, Math.round(row.unitPrice ?? amount));
      const meta: LxWindowItemMeta = {
        location: row.location,
        glassSpec: row.glassSpec,
        mosquitoNet: row.mosquitoNet,
        color: row.color,
      };
      lines.push({
        trade_name: WINDOW_TRADE,
        item_name: row.product || "창호",
        description: row.spec,
        remark: encodeLxWindowRemark(meta),
        quantity: qty == null ? "" : String(qty),
        unit: "SET",
        unit_price: String(unitPrice),
        amount: String(amount),
        cost_type: "자재",
        is_lx_material: true,
        window_item_kind: "product",
        window_location: row.location,
        window_extra_remark: "",
      });
      continue;
    }

    if (row.category === "추가부자재") {
      const qty = row.quantity;
      const amount = Math.max(0, Math.round(row.amount ?? 0));
      const unitPrice =
        qty != null && qty > 0
          ? Math.round(amount / qty)
          : Math.max(0, Math.round(row.unitPrice ?? amount));
      const isWindowBar = /통바/.test(row.product);
      lines.push({
        trade_name: WINDOW_TRADE,
        item_name: row.product || "부자재",
        description: row.spec,
        remark: row.location ? `위치: ${row.location}` : "",
        quantity: qty == null ? "" : String(qty),
        unit: row.unit || "",
        unit_price: String(unitPrice),
        amount: String(amount),
        cost_type: "자재",
        is_lx_material: false,
        window_item_kind: isWindowBar ? "material" : undefined,
        window_location: isWindowBar ? row.location : undefined,
        window_extra_remark: isWindowBar ? "" : undefined,
      });
      continue;
    }

    if (row.category === "부가시공비" || row.category === "표준시공비") {
      const amount = Math.max(0, Math.round(row.amount ?? 0));
      const qty = row.quantity ?? 1;
      lines.push({
        trade_name: WINDOW_TRADE,
        item_name: row.product,
        description: row.spec,
        remark: "",
        quantity: String(qty),
        unit: "식",
        unit_price: String(amount),
        amount: String(amount),
        cost_type: "시공",
        is_lx_material: false,
      });
      continue;
    }

    {
      const amount = Math.max(0, Math.round(row.amount ?? 0));
      const qty = row.quantity;
      lines.push({
        trade_name: WINDOW_TRADE,
        item_name: row.product,
        description: row.spec,
        remark: "",
        quantity: qty == null ? "" : String(qty),
        unit: row.unit || "식",
        unit_price: String(
          qty != null && qty > 0 ? Math.round(amount / qty) : amount,
        ),
        amount: String(amount),
        cost_type: "기타",
        is_lx_material: false,
      });
    }
  }

  return {
    lines,
    promotionDiscount,
    promotionMemo: promotionDiscount > 0 ? "LX 프로모션 할인" : "",
  };
}

// 기존 import 경로 호환. 화면 코드는 경량 `lx-window-meta`에서 직접 가져온다.
export { LX_WINDOW_TRADE_NAME };
