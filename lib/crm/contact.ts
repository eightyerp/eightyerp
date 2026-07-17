import type { ContactBucket } from "@/types/database";

function toDateOnly(value: string | Date): Date {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function getContactBucket(
  nextContactAt: string | null | undefined,
): ContactBucket {
  if (!nextContactAt) return "none";

  const today = toDateOnly(new Date());
  const next = toDateOnly(nextContactAt);
  const diffDays = Math.round(
    (next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays <= 3) return "soon";

  const endOfWeek = new Date(today);
  const day = today.getDay(); // 0 Sun
  const daysToSunday = day === 0 ? 0 : 7 - day;
  endOfWeek.setDate(today.getDate() + daysToSunday);
  if (next <= endOfWeek) return "this_week";

  return "later";
}

export function contactBucketClass(bucket: ContactBucket): string {
  switch (bucket) {
    case "overdue":
      return "bg-red-100 text-red-700 ring-1 ring-red-200";
    case "today":
      return "bg-gold-500/15 text-navy-800 ring-1 ring-gold-500/40 font-semibold";
    case "soon":
      return "bg-orange-100 text-orange-700 ring-1 ring-orange-200";
    case "this_week":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
    case "none":
      return "bg-gray-100 text-gray-500 ring-1 ring-gray-200";
    default:
      return "bg-slate-50 text-slate-600 ring-1 ring-slate-200";
  }
}

export function contactBucketLabel(bucket: ContactBucket): string {
  switch (bucket) {
    case "overdue":
      return "기한 경과";
    case "today":
      return "오늘 연락";
    case "soon":
      return "3일 이내";
    case "this_week":
      return "이번 주";
    case "none":
      return "일정 없음";
    default:
      return "예정";
  }
}

export function formatPhoneForTel(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

export function buildSmsLink(phone: string, body?: string): string {
  const number = formatPhoneForTel(phone);
  const encoded = body ? `?body=${encodeURIComponent(body)}` : "";
  return `sms:${number}${encoded}`;
}

export function buildKakaoLink(phone: string): string {
  // Placeholder for future Kakao Business API integration.
  // Currently opens a searchable deep-link style URL / records activity only.
  return `https://open.kakao.com/o/search?q=${encodeURIComponent(phone)}`;
}
