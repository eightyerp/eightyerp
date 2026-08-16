import { toKoreaDateKey } from "@/lib/crm/korea-date";

const DAY_MS = 24 * 60 * 60 * 1000;

function dateKeyToUtcMs(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/**
 * 고객 최초 접수일부터 오늘까지의 한국시간 기준 경과일.
 * CRM 카드의 `접수 08.05 · D+11` 표시에 사용한다.
 */
export function getCustomerAgeDays(
  createdAt: string,
  reference = new Date(),
): number {
  const createdKey = toKoreaDateKey(createdAt);
  const todayKey = toKoreaDateKey(reference);
  const diff = Math.floor(
    (dateKeyToUtcMs(todayKey) - dateKeyToUtcMs(createdKey)) / DAY_MS,
  );
  return Math.max(0, diff);
}
