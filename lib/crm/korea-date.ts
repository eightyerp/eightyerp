export const KOREA_TIME_ZONE = "Asia/Seoul";

const koreaDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: KOREA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toKoreaDateKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const parts = koreaDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return year && month && day ? `${year}-${month}-${day}` : "";
}

export function koreaDayBounds(now = new Date()) {
  const key = toKoreaDateKey(now);
  if (!key) {
    throw new Error("한국시간 날짜를 계산하지 못했습니다.");
  }
  return {
    key,
    start: new Date(`${key}T00:00:00.000+09:00`),
    end: new Date(`${key}T23:59:59.999+09:00`),
  };
}
