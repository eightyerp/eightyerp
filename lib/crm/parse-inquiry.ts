import type {
  ConsultationType,
  CustomerStatus,
  InquirySourceType,
  ParsedInquiryData,
} from "@/types/database";
import { CONSULTATION_TYPES } from "@/lib/crm/constants";

function extractLabeledValue(text: string, labels: string[]): string {
  for (const label of labels) {
    const pattern = new RegExp(
      `${label}\\s*[:：]\\s*(.+?)(?=\\r?\\n|$)`,
      "im",
    );
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return "";
}

function extractPhone(text: string): string {
  const labeled = extractLabeledValue(text, ["연락처", "전화번호", "휴대폰"]);
  if (labeled) {
    return normalizePhone(labeled);
  }

  const match = text.match(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/);
  return match ? normalizePhone(match[0]) : "";
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return value.trim();
}

function parseInterestItems(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split(/[,/，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function detectConsultationType(
  text: string,
  interestItems: string[],
): ConsultationType {
  const haystack = `${text} ${interestItems.join(" ")}`;
  if (/창호|샷시|시스템창호|LX/.test(haystack)) return "창호";
  if (/욕실|화장실/.test(haystack)) return "욕실";
  if (/주방|싱크|아일랜드/.test(haystack)) return "주방";
  if (/도배|벽지/.test(haystack)) return "도배";
  if (/바닥|마루|장판/.test(haystack)) return "바닥재";
  if (/도어|중문/.test(haystack)) return "도어/중문";
  if (/부분\s*인테리어/.test(haystack)) return "부분인테리어";
  if (/종합\s*인테리어|리모델링|인테리어/.test(haystack)) return "종합인테리어";
  for (const type of CONSULTATION_TYPES) {
    if (haystack.includes(type)) return type;
  }
  return "기타";
}

function detectSourceType(text: string): InquirySourceType {
  if (text.includes("LX하우시스 고객상담실") || /LX하우시스/.test(text)) {
    return "lx_headquarters";
  }
  if (/카카오톡|카톡/.test(text)) return "kakao";
  if (/문자|SMS|mms/i.test(text)) return "sms";
  if (/홈페이지|온라인 문의|웹문의/.test(text)) return "online";
  return "other";
}

function detectLeadSourceName(
  text: string,
  sourceType: InquirySourceType,
): string {
  if (
    sourceType === "lx_headquarters" ||
    text.includes("LX하우시스 고객상담실")
  ) {
    return "LX하우시스 본사";
  }
  if (/카카오톡|카톡/.test(text)) return "카카오톡";
  if (/문자문의|문자 문의|SMS/i.test(text)) return "문자문의";
  if (/네이버\s*검색|검색광고/.test(text)) return "네이버 검색광고";
  if (/네이버\s*블로그/.test(text)) return "네이버 블로그";
  if (/인스타/.test(text)) return "인스타그램";
  if (/공동구매/.test(text)) return "공동구매";
  if (/단지행사/.test(text)) return "단지행사";
  if (/재계약/.test(text)) return "재계약";
  if (/홈페이지/.test(text)) return "홈페이지";
  if (/소개/.test(text)) return "소개";
  return "기타";
}

export function parseInquiryText(rawText: string): {
  sourceType: InquirySourceType;
  parsed: ParsedInquiryData;
} {
  const text = rawText.trim();
  const sourceType = detectSourceType(text);
  const isLx = text.includes("LX하우시스 고객상담실") || sourceType === "lx_headquarters";

  const interestRaw =
    extractLabeledValue(text, ["관심 공종", "관심공종", "공종"]) ||
    extractLabeledValue(text, ["상담내용"]);
  const interest_items = parseInterestItems(interestRaw);

  const name =
    extractLabeledValue(text, ["고객명", "성함", "이름"]) ||
    "";
  const phone = extractPhone(text);
  const address = extractLabeledValue(text, [
    "공사주소",
    "주소",
    "현장주소",
  ]);
  const orderNo = extractLabeledValue(text, [
    "고객주문번호",
    "주문번호",
  ]);
  const channelRound = extractLabeledValue(text, ["채널/차수", "채널"]);
  const special_notes = extractLabeledValue(text, [
    "고객특이사항",
    "특이사항",
  ]);
  const event_memo = extractLabeledValue(text, [
    "메모\\(이벤트 등\\)",
    "메모\\(이벤트\\)",
    "메모",
    "이벤트",
  ]);
  const desired_timing = extractLabeledValue(text, [
    "희망 공사시기",
    "희망공사시기",
    "공사시기",
  ]);
  const baseNotes =
    extractLabeledValue(text, ["상담내용", "문의내용"]) || text;
  const metaLines = [
    orderNo ? `주문번호: ${orderNo}` : "",
    channelRound ? `채널/차수: ${channelRound}` : "",
  ].filter(Boolean);
  const consultation_notes = metaLines.length
    ? `${baseNotes}\n\n${metaLines.join("\n")}`
    : baseNotes;

  const consultation_type = detectConsultationType(text, interest_items);
  const lead_source_name = detectLeadSourceName(text, sourceType);

  const status: CustomerStatus = isLx ? "미연락" : "신규";

  const parsed: ParsedInquiryData = {
    name,
    phone,
    address,
    lead_source_name,
    consultation_type,
    interest_items,
    desired_timing,
    special_notes,
    event_memo,
    consultation_notes,
    status,
    next_contact_at: null,
    assigned_employee_id: null,
    happy_call_required: isLx,
  };

  return { sourceType, parsed };
}

export function interestItemsToInput(items: string[] | undefined): string {
  return (items ?? []).join(", ");
}

export function parseInterestItemsInput(value: string): string[] {
  return parseInterestItems(value);
}
