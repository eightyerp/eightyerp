# EIGHTY CRM — Core Gate A

## 목적
직원이 휴대폰에서 `신규고객 → 연락 → 상담기록 → 다음 행동 → 일정 → 견적 → 계약/수금 확인`을 최소 터치로 처리하는 영업 실행앱을 제공한다.

CRM은 ERP 모바일 복제품이 아니다. 광고분석·경영분석·회계·복잡한 관리자 통계는 Gate A 범위에서 제외한다. 유입경로와 행사코드는 고객 원천 데이터로만 유지하고 분석은 ERP가 담당한다.

## Gate A 포함
- `/crm` 독립 모바일 App Shell
- Android/iPhone 설치형 PWA manifest + 최소 Service Worker
- 홈: 신규문의 / 오늘 연락 / 오늘 일정 / 미처리 / 다음 행동 없음 / 우선처리
- 홈 데이터 Suspense streaming 및 경량 조회
- 고객목록 30건 pagination / 검색 / 접수기간 / 파이프라인
- 신규고객 간편등록 + 전화번호 중복 사전검사
- 고객상세 + 전화 / 문자 / 상담 / 다음 연락 / 상태변경
- 담당자 배정
- 모바일 일정등록 / 충돌방지 / 완료 / 재예약
- 일정 종류별 파이프라인 자동전진
- 견적 모바일 목록/요약 + 상세 편집은 ERP 재사용
- 계약금액 / 수금 / 미수금 read-only 요약
- 앱 내부 CRM 업무 알림함

## Gate A 제외
- 운영 Supabase migration
- Web Push subscription RPC
- PUSH delivery Edge Function
- scheduler
- VAPID / Worker Secret
- Android TWA/APK 빌드 파이프라인
- 광고성과/ROAS/경영분석/손익/회계 기능

위 항목은 Gate B(PUSH) / Gate C(Android·iPhone 배포/E2E)에서 별도 검증한다.

## 속도 원칙
- App Shell을 먼저 렌더하고 느린 홈 데이터는 Suspense로 스트리밍한다.
- 전체 고객/견적 다운로드 금지.
- 고객목록 기본 30건, 최대 50건.
- 필요한 컬럼만 조회하고 독립 요청은 병렬화한다.
- 불필요한 prefetch / polling / Service Worker PII cache 금지.
- 홈 → 고객 → 고객상세 → 일정 → 견적 순으로 체감속도를 우선 관리한다.

## 권한/데이터
- 기존 ERP/Supabase Auth/RLS와 단일 고객·견적·계약·수금 원장을 재사용한다.
- 직원은 담당 고객 범위, 관리자는 회사 범위를 유지한다.
- 별도 CRM DB를 만들지 않는다.

## 완료 기준
- CI / Lint / Production Build PASS
- 360 / 390 / 430px 실기기 QA
- Android/iPhone 로그인 유지
- 직원 1명 `신규등록 → 연락 → 상담 → 다음 행동 → 일정 → 견적` E2E

대표 승인 전 main merge / Production 배포 / 운영 DB 변경 금지.
