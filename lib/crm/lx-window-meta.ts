/**
 * LX 창호 가져오기 항목 메타 — remark에 저장 (DB migration 없음).
 * 고객용 창호 표·미리보기에서 파싱해 표시한다.
 */

export type LxWindowItemMeta = {
  location?: string;
  glassSpec?: string;
  mosquitoNet?: "포함" | "미포함" | "";
  color?: string;
};

const BEGIN = "@@LXW";
const END = "@@";

export function encodeLxWindowRemark(
  meta: LxWindowItemMeta,
  extraRemark?: string | null,
): string {
  const lines: string[] = [BEGIN];
  if (meta.location?.trim()) lines.push(`위치: ${meta.location.trim()}`);
  if (meta.glassSpec?.trim()) lines.push(`유리: ${meta.glassSpec.trim()}`);
  if (meta.mosquitoNet === "포함" || meta.mosquitoNet === "미포함") {
    lines.push(`방충망: ${meta.mosquitoNet}`);
  }
  if (meta.color?.trim()) lines.push(`색상: ${meta.color.trim()}`);
  lines.push(END);
  const block = lines.join("\n");
  const extra = String(extraRemark ?? "").trim();
  if (!extra) return block;
  // 기존 비고에서 LX 블록 제거 후 합침
  const cleaned = stripLxWindowRemarkBlock(extra).trim();
  return cleaned ? `${block}\n${cleaned}` : block;
}

export function stripLxWindowRemarkBlock(remark: string): string {
  const text = String(remark ?? "");
  const start = text.indexOf(BEGIN);
  if (start < 0) return text;
  const end = text.indexOf(END, start + BEGIN.length);
  if (end < 0) return text.slice(0, start).trim();
  return `${text.slice(0, start)}${text.slice(end + END.length)}`.trim();
}

export function parseLxWindowRemark(
  remark?: string | null,
): LxWindowItemMeta | null {
  const text = String(remark ?? "");
  const start = text.indexOf(BEGIN);
  if (start < 0) return null;
  const end = text.indexOf(END, start + BEGIN.length);
  const block =
    end >= 0 ? text.slice(start + BEGIN.length, end) : text.slice(start + BEGIN.length);
  const meta: LxWindowItemMeta = {};
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^(위치|유리|유리\s*사양|방충망|색상)\s*[:：]\s*(.+)$/);
    if (!m) continue;
    const key = m[1]!.replace(/\s+/g, "");
    const value = m[2]!.trim();
    if (key === "위치") meta.location = value;
    else if (key.startsWith("유리")) meta.glassSpec = value;
    else if (key === "방충망") {
      meta.mosquitoNet =
        value.includes("미포함") || value === "N" || value === "없음"
          ? "미포함"
          : value.includes("포함") || value === "Y" || value === "있음"
            ? "포함"
            : "";
    } else if (key === "색상") meta.color = value;
  }
  if (
    !meta.location &&
    !meta.glassSpec &&
    !meta.mosquitoNet &&
    !meta.color
  ) {
    return null;
  }
  return meta;
}

/** 창호 제품 행 여부 (고객용 창호 표 대상) */
export function isLxWindowProductLine(input: {
  unit?: string | null;
  remark?: string | null;
  trade_name?: string | null;
}): boolean {
  const unit = String(input.unit ?? "").trim().toUpperCase();
  if (unit === "SET") return true;
  return Boolean(parseLxWindowRemark(input.remark));
}

/** 수량 + SET 한 칸 표시 (저장값은 분리 유지) */
export function formatQuantitySetDisplay(
  quantity: number | null | undefined,
): string {
  if (quantity == null || !Number.isFinite(Number(quantity))) return "-";
  const n = Number(quantity);
  const rounded = Math.round(n * 1000) / 1000;
  const qtyText = Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded)
        .replace(/(\.\d*?[1-9])0+$/, "$1")
        .replace(/\.0+$/, "");
  return `${qtyText} SET`;
}
