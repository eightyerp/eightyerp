import assert from "node:assert/strict";
import { parseInquiryText } from "../lib/crm/parse-inquiry";

/** 사용자 제공 LX 상담문 형식 샘플 (원윤나) */
const SAMPLE = `
LX하우시스 고객상담실

채널 / 차수 : 지인몰/기타 / 2607
고객주문번호 : 81734
고객명 : 원윤나
연락처 : 010-7473-9881
공사주소 : 경기도 성남시 분당구 테스트로 1
고객특이사항 : 접수일:2026.07.10 / 관심공종:창호,주방,욕실,도배,바닥재,도어,중문,인테리어필름,빌트인 / 희망시기:4개월 이후
메모(이벤트 등) : 지인몰 이벤트
상담실 전화번호 : 02-1234-5678
상담 접수처 : LX하우시스 고객상담실
`.trim();

const { sourceType, parsed, missingFields } = parseInquiryText(SAMPLE);

assert.equal(sourceType, "lx_headquarters");
assert.equal(parsed.name, "원윤나");
assert.equal(parsed.phone, "010-7473-9881");
assert.equal(parsed.source_order_no, "81734");
assert.equal(parsed.source_channel, "지인몰/기타");
assert.equal(parsed.source_round, "2607");
assert.equal(parsed.desired_timing, "4개월 이후");
assert.equal(parsed.status, "신규");
assert.equal(parsed.happy_call_required, true);
assert.equal(parsed.lead_source_name, "LX하우시스 고객상담실");
assert.ok(parsed.consultation_notes?.includes("【외부문의 원문】"));

const expectedInterests = [
  "창호",
  "주방",
  "욕실",
  "도배",
  "바닥재",
  "도어",
  "중문",
  "인테리어필름",
  "빌트인 시스템",
];
assert.deepEqual(parsed.interest_items, expectedInterests);
assert.equal(parsed.interest_items?.length, 9);

assert.ok(!missingFields.includes("name"));
assert.ok(!missingFields.includes("phone"));
assert.ok(!missingFields.includes("source_order_no"));
assert.ok(!missingFields.includes("interest_items"));
assert.ok(!missingFields.includes("desired_timing"));

// 별칭 매핑
const alias = parseInquiryText(`
고객명: 테스트
연락처: 010-1111-2222
고객특이사항: 관심공종:샷시,벽지,필름,빌트인
`);
assert.deepEqual(alias.parsed.interest_items, [
  "창호",
  "도배",
  "인테리어필름",
  "빌트인 시스템",
]);

console.log("parse-inquiry tests passed");
