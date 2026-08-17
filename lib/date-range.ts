export const ERP_DATE_TIME_ZONE = "Asia/Seoul";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DateRangeValue = {
  from: string;
  to: string;
};

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "recent7"
  | "recent30"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "all";

export type DateRangeResolution = DateRangeValue & {
  error: string | null;
};

export type KstDateTimeBounds = DateRangeResolution & {
  fromInclusiveUtc: string | null;
  toExclusiveUtc: string | null;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function isRealDate(value: string): boolean {
  const match = value.match(ISO_DATE_RE);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function normalizeDateToken(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  let normalized = raw;
  if (/^\d{6}$/.test(raw)) {
    normalized = `20${raw.slice(0, 2)}-${raw.slice(2, 4)}-${raw.slice(4, 6)}`;
  } else if (/^\d{8}$/.test(raw)) {
    normalized = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }

  return isRealDate(normalized) ? normalized : null;
}

export function normalizeDateRange(
  fromValue: string | null | undefined,
  toValue: string | null | undefined,
): DateRangeResolution {
  const fromRaw = String(fromValue ?? "").trim();
  const toRaw = String(toValue ?? "").trim();
  const from = fromRaw ? normalizeDateToken(fromRaw) : null;
  const to = toRaw ? normalizeDateToken(toRaw) : null;

  if (fromRaw && !from) {
    return { from: "", to: to ?? "", error: "시작일 형식을 확인해 주세요." };
  }
  if (toRaw && !to) {
    return { from: from ?? "", to: "", error: "종료일 형식을 확인해 주세요." };
  }
  if (from && to && from > to) {
    return { from, to, error: "종료일은 시작일보다 빠를 수 없습니다." };
  }
  return { from: from ?? "", to: to ?? "", error: null };
}

export function parseDateRangeQuickInput(value: string): DateRangeResolution {
  const raw = value.trim();
  if (!raw) return { from: "", to: "", error: null };

  let left = "";
  let right = "";

  if (raw.includes("~")) {
    const parts = raw.split("~");
    if (parts.length === 2) [left, right] = parts;
  } else {
    const compact = raw.match(/^\s*(\d{6}|\d{8})\s*-\s*(\d{6}|\d{8})\s*$/);
    const iso = raw.match(
      /^\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})\s*$/,
    );
    if (compact) {
      left = compact[1];
      right = compact[2];
    } else if (iso) {
      left = iso[1];
      right = iso[2];
    }
  }

  if (!left || !right) {
    return {
      from: "",
      to: "",
      error: "예: 260801~260817 또는 2026-08-01~2026-08-17 형식으로 입력해 주세요.",
    };
  }

  return normalizeDateRange(left, right);
}

function dateParts(value: string): { year: number; month: number; day: number } {
  const match = value.match(ISO_DATE_RE);
  if (!match) throw new Error(`Invalid ISO date: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function shiftDate(value: string, days: number): string {
  const { year, month, day } = dateParts(value);
  return formatUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

export function getKstToday(now = new Date()): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return formatUtcDate(kst);
}

export function getDateRangePreset(
  preset: DateRangePreset,
  now = new Date(),
): DateRangeValue {
  const today = getKstToday(now);
  const { year, month } = dateParts(today);

  if (preset === "all") return { from: "", to: "" };
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") {
    const yesterday = shiftDate(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (preset === "recent7") return { from: shiftDate(today, -6), to: today };
  if (preset === "recent30") return { from: shiftDate(today, -29), to: today };
  if (preset === "thisMonth") {
    return { from: `${year}-${pad2(month)}-01`, to: today };
  }
  if (preset === "thisYear") return { from: `${year}-01-01`, to: today };

  const firstThisMonth = new Date(Date.UTC(year, month - 1, 1));
  const lastMonthEnd = new Date(firstThisMonth.getTime() - 24 * 60 * 60 * 1000);
  const lastMonthYear = lastMonthEnd.getUTCFullYear();
  const lastMonth = lastMonthEnd.getUTCMonth() + 1;
  return {
    from: `${lastMonthYear}-${pad2(lastMonth)}-01`,
    to: formatUtcDate(lastMonthEnd),
  };
}

function kstMidnightUtc(value: string): string {
  const { year, month, day } = dateParts(value);
  return new Date(Date.UTC(year, month - 1, day) - KST_OFFSET_MS).toISOString();
}

export function buildKstDateTimeBounds(
  fromValue: string | null | undefined,
  toValue: string | null | undefined,
): KstDateTimeBounds {
  const normalized = normalizeDateRange(fromValue, toValue);
  if (normalized.error) {
    return {
      ...normalized,
      fromInclusiveUtc: null,
      toExclusiveUtc: null,
    };
  }

  return {
    ...normalized,
    fromInclusiveUtc: normalized.from ? kstMidnightUtc(normalized.from) : null,
    toExclusiveUtc: normalized.to ? kstMidnightUtc(shiftDate(normalized.to, 1)) : null,
  };
}

export function formatDateRangeQuickInput(range: DateRangeValue): string {
  if (!range.from || !range.to) return "";
  return `${range.from.slice(2).replaceAll("-", "")}~${range.to.slice(2).replaceAll("-", "")}`;
}

export function formatDateRangeLabel(range: DateRangeValue): string {
  if (!range.from && !range.to) return "전체 기간";
  if (range.from && range.to) return `${range.from.replaceAll("-", ".")} ~ ${range.to.replaceAll("-", ".")}`;
  if (range.from) return `${range.from.replaceAll("-", ".")} 이후`;
  return `${range.to.replaceAll("-", ".")} 이전`;
}
