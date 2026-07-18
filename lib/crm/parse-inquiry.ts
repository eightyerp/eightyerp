import type {
  ConsultationType,
  CustomerStatus,
  InquirySourceType,
  ParsedInquiryData,
} from "@/types/database";
import { CONSULTATION_TYPES, INTEREST_ITEMS } from "@/lib/crm/constants";

export type InquiryMissingField =
  | "name"
  | "phone"
  | "address"
  | "source_order_no"
  | "source_channel"
  | "source_round"
  | "interest_items"
  | "desired_timing";

export type ParseInquiryResult = {
  sourceType: InquirySourceType;
  parsed: ParsedInquiryData;
  missingFields: InquiryMissingField[];
};

/** 라벨 뒤 값 추출 — 콜론/공백/줄바꿈 변형 허용 */
function extractLabeledValue(text: string, labels: string[]): string {
  for (const label of labels) {
    const escaped = label
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s*");
    const patterns = [
      new RegExp(
        `${escaped}\\s*[:：/]\\s*(.+?)(?=\\r?\\n[\\s]*[가-힣A-Za-z0-9(][^\\n]{0,20}\\s*[:：]|\\r?\\n\\s*$|$)`,
        "ims",
      ),
      new RegExp(`${escaped}\\s*[:：]\\s*(.+?)(?=\\r?\\n|$)`, "im"),
      new RegExp(`${escaped}\\s+(.+?)(?=\\r?\\n|$)`, "im"),
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]?.trim()) {
        return match[1].replace(/\s+/g, " ").trim();
      }
    }
  }
  return "";
}

function extractPhone(text: string): string {
  const labeled = extractLabeledValue(text, [
    "연락처",
    "전화번호",
    "휴대폰",
    "핸드폰",
  ]);
  if (labeled) return normalizePhone(labeled);

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

const INTEREST_ALIASES: Array<{ pattern: RegExp; value: (typeof INTEREST_ITEMS)[number] }> =
  [
    { pattern: /샷시|샤시|시스템\s*창호|창호/, value: "창호" },
    { pattern: /주방|싱크|아일랜드/, value: "주방" },
    { pattern: /욕실|화장실|비데/, value: "욕실" },
    { pattern: /도배|벽지/, value: "도배" },
    { pattern: /바닥|마루|장판|강마루/, value: "바닥재" },
    { pattern: /중문/, value: "중문" },
    { pattern: /도어|방문|현관문/, value: "도어" },
    { pattern: /인테리어\s*필름|필름/, value: "인테리어필름" },
    { pattern: /빌트인/, value: "빌트인 시스템" },
    { pattern: /확장/, value: "확장" },
    { pattern: /전기/, value: "전기" },
    { pattern: /조명|LED/, value: "조명" },
    { pattern: /목공|가구/, value: "목공" },
    { pattern: /타일/, value: "타일" },
  ];

export function mapInterestToken(token: string): string | null {
  const t = token.trim();
  if (!t) return null;
  if ((INTEREST_ITEMS as readonly string[]).includes(t)) return t;
  for (const { pattern, value } of INTEREST_ALIASES) {
    if (pattern.test(t)) return value;
  }
  if (/기타/.test(t)) return "기타";
  return null;
}

export function normalizeInterestItems(raw: string): string[] {
  if (!raw.trim()) return [];
  const parts = raw.split(/[,/，、·|]|\s{2,}|\n/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const mapped = mapInterestToken(part);
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  // 통짜 문자열에서 키워드 스캔
  if (out.length === 0) {
    for (const { pattern, value } of INTEREST_ALIASES) {
      if (pattern.test(raw) && !out.includes(value)) out.push(value);
    }
  }
  return out;
}

function analyzeSpecialNotes(specialRaw: string): {
  received_at: string | null;
  interest_items: string[];
  desired_timing: string;
  special_notes: string;
} {
  if (!specialRaw.trim()) {
    return {
      received_at: null,
      interest_items: [],
      desired_timing: "",
      special_notes: "",
    };
  }

  let rest = specialRaw;
  let received_at: string | null = null;
  let interestFromNotes: string[] = [];
  let desired_timing = "";
  const leftover: string[] = [];

  // 슬래시·줄바꿈으로 나뉜 조각별 분류 (LX 특이사항 관례)
  const chunks = rest
    .split(/\s*(?:\/|\r?\n)\s*/)
    .map((c) => c.trim())
    .filter(Boolean);

  for (const chunk of chunks.length ? chunks : [rest]) {
    const dateMatch = chunk.match(
      /^(?:접수일|요청일|접수\s*일자|요청\s*일자)\s*[:：]?\s*(.+)$/i,
    );
    if (dateMatch?.[1]) {
      received_at = dateMatch[1].trim();
      continue;
    }

    const interestMatch = chunk.match(
      /^(?:관심\s*공종|관심공종|공종)\s*[:：]?\s*(.+)$/i,
    );
    if (interestMatch?.[1]) {
      for (const item of normalizeInterestItems(interestMatch[1])) {
        if (!interestFromNotes.includes(item)) interestFromNotes.push(item);
      }
      continue;
    }

    const timingMatch = chunk.match(
      /^(?:상담|공사)?\s*(?:희망\s*시기|희망시기|희망\s*공사시기|공사시기)\s*[:：]?\s*(.+)$/i,
    );
    if (timingMatch?.[1]) {
      desired_timing = timingMatch[1].trim();
      continue;
    }

    const looseTiming = chunk.match(
      /^(\d+\s*개월\s*(?:이내|이후|후)|빠른\s*시일|입주\s*전|즉시)$/i,
    );
    if (looseTiming && !desired_timing) {
      desired_timing = looseTiming[1].trim();
      continue;
    }

    leftover.push(chunk);
  }

  rest = leftover.join(" / ");
  if (interestFromNotes.length === 0) {
    interestFromNotes = normalizeInterestItems(rest);
    for (const item of interestFromNotes) {
      rest = rest.replace(new RegExp(item.replace(/\s+/g, "\\s*"), "gi"), " ");
    }
  }

  if (!desired_timing) {
    const loose = rest.match(
      /(\d+\s*개월\s*(?:이내|이후|후)|빠른\s*시일|입주\s*전|즉시|ASAP|[0-9]{1,2}\s*월)/i,
    );
    if (loose) {
      desired_timing = loose[0].trim();
      rest = rest.replace(loose[0], " ");
    }
  }

  rest = rest
    .replace(/관심\s*공종|관심공종/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,./·|-]+|[\s,./·|-]+$/g, "")
    .trim();

  return {
    received_at,
    interest_items: interestFromNotes,
    desired_timing,
    special_notes: rest,
  };
}

function parseChannelRound(raw: string): {
  source_channel: string;
  source_round: string;
} {
  if (!raw.trim()) return { source_channel: "", source_round: "" };
  // "지인몰/기타 / 2607" | "지인몰/기타/2607" | "지인몰 / 2607"
  const parts = raw
    .split(/\s*\/\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { source_channel: "", source_round: "" };
  if (parts.length === 1) {
    if (/^\d{3,}$/.test(parts[0])) {
      return { source_channel: "", source_round: parts[0] };
    }
    return { source_channel: parts[0], source_round: "" };
  }
  const last = parts[parts.length - 1];
  if (/^\d{3,}$/.test(last)) {
    return {
      source_channel: parts.slice(0, -1).join("/"),
      source_round: last,
    };
  }
  return { source_channel: parts.join("/"), source_round: "" };
}

function detectConsultationType(
  text: string,
  interestItems: string[],
): ConsultationType {
  const haystack = `${text} ${interestItems.join(" ")}`;
  if (/창호|샷시|시스템창호/.test(haystack)) return "창호";
  if (/욕실|화장실/.test(haystack)) return "욕실";
  if (/주방|싱크|아일랜드/.test(haystack)) return "주방";
  if (/도배|벽지/.test(haystack)) return "도배";
  if (/바닥|마루|장판/.test(haystack)) return "바닥재";
  if (/도어|중문/.test(haystack)) return "도어/중문";
  if (/부분\s*인테리어/.test(haystack)) return "부분인테리어";
  if (/종합\s*인테리어|리모델링/.test(haystack)) return "종합인테리어";
  for (const type of CONSULTATION_TYPES) {
    if (haystack.includes(type)) return type;
  }
  return "기타";
}

function detectSourceType(text: string): InquirySourceType {
  if (
    text.includes("LX하우시스 고객상담실") ||
    /LX\s*하우시스/.test(text) ||
    /고객상담실/.test(text)
  ) {
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
    /LX\s*하우시스|고객상담실/.test(text)
  ) {
    // UI 표기명 — DB resolve 시 본사/고객상담실 별칭 매칭
    return "LX하우시스 고객상담실";
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

function collectMissing(parsed: ParsedInquiryData): InquiryMissingField[] {
  const missing: InquiryMissingField[] = [];
  if (!parsed.name?.trim()) missing.push("name");
  if (!parsed.phone?.trim()) missing.push("phone");
  if (!parsed.address?.trim()) missing.push("address");
  if (!parsed.source_order_no?.trim()) missing.push("source_order_no");
  if (!parsed.source_channel?.trim()) missing.push("source_channel");
  if (!parsed.source_round?.trim()) missing.push("source_round");
  if (!parsed.interest_items?.length) missing.push("interest_items");
  if (!parsed.desired_timing?.trim()) missing.push("desired_timing");
  return missing;
}

export function parseInquiryText(rawText: string): ParseInquiryResult {
  const text = rawText.trim();
  const sourceType = detectSourceType(text);

  const name = extractLabeledValue(text, ["고객명", "성함", "이름"]);
  const phone = extractPhone(text);
  const address = extractLabeledValue(text, [
    "공사주소",
    "주소",
    "현장주소",
  ]);
  const orderNo = extractLabeledValue(text, [
    "고객주문번호",
    "주문번호",
    "주문 번호",
  ]);
  const channelRoundRaw = extractLabeledValue(text, [
    "채널 / 차수",
    "채널/차수",
    "채널 차수",
    "채널",
  ]);
  const { source_channel, source_round } = parseChannelRound(channelRoundRaw);

  const specialRaw = extractLabeledValue(text, [
    "고객특이사항",
    "특이사항",
  ]);
  const event_memo = extractLabeledValue(text, [
    "메모(이벤트 등)",
    "메모(이벤트)",
    "메모 (이벤트 등)",
    "메모",
  ]);
  const consultPhone = extractLabeledValue(text, [
    "상담실 전화번호",
    "상담실전화번호",
  ]);
  const reception = extractLabeledValue(text, [
    "상담 접수처",
    "상담접수처",
    "접수처",
  ]);

  const interestLabeled =
    extractLabeledValue(text, ["관심 공종", "관심공종", "공종"]) || "";
  let interest_items = normalizeInterestItems(interestLabeled);

  const timingLabeled = extractLabeledValue(text, [
    "희망 공사시기",
    "희망공사시기",
    "공사시기",
    "상담 희망시기",
    "희망시기",
  ]);

  const analyzed = analyzeSpecialNotes(specialRaw);
  if (interest_items.length === 0) {
    interest_items = analyzed.interest_items;
  } else {
    for (const item of analyzed.interest_items) {
      if (!interest_items.includes(item)) interest_items.push(item);
    }
  }
  const desired_timing =
    timingLabeled || analyzed.desired_timing || "";

  const metaLines = [
    orderNo ? `주문번호: ${orderNo}` : "",
    source_channel || source_round
      ? `채널/차수: ${[source_channel, source_round].filter(Boolean).join(" / ")}`
      : "",
    consultPhone ? `상담실 전화: ${consultPhone}` : "",
    reception ? `상담 접수처: ${reception}` : "",
    analyzed.received_at ? `접수/요청일: ${analyzed.received_at}` : "",
  ].filter(Boolean);

  const consultation_notes = [
    "【외부문의 원문】",
    text,
    metaLines.length ? `\n【추출 메타】\n${metaLines.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const consultation_type = detectConsultationType(text, interest_items);
  const lead_source_name = detectLeadSourceName(text, sourceType);

  const parsed: ParsedInquiryData = {
    name,
    phone,
    address,
    lead_source_name,
    consultation_type,
    interest_items,
    desired_timing,
    special_notes: analyzed.special_notes,
    event_memo,
    consultation_notes,
    source_order_no: orderNo,
    source_channel,
    source_round,
    received_at_text: analyzed.received_at,
    consult_room_phone: consultPhone || undefined,
    reception_place: reception || undefined,
    status: "신규",
    next_contact_at: null,
    assigned_employee_id: null,
    happy_call_required: true,
  };

  return {
    sourceType,
    parsed,
    missingFields: collectMissing(parsed),
  };
}

export function interestItemsToInput(items: string[] | undefined): string {
  return (items ?? []).join(", ");
}

export function parseInterestItemsInput(value: string): string[] {
  return normalizeInterestItems(value);
}
