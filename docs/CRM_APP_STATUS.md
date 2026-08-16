# EIGHTY CRM APP — CURRENT STATUS / SOURCE OF TRUTH

> 이 문서는 EIGHTY CRM 개발의 단일 진행상황 기준 문서다. 채팅보다 이 문서를 우선한다.
> 새 채팅/새 Agent는 `AGENTS.md` → 이 문서 → `docs/CRM_APP_MISSION_AND_PUSH_POLICY.md` → PR #70 최신 상태 순으로 확인한다.

## 1. 최상위 임무

EIGHTY CRM은 ERP 모바일 복제품이 아니다.

직원이 휴대폰에서 `고객 → 연락 → 상담기록 → 다음 행동 → 일정 → 견적 → 계약/수금 확인`을 빠르게 처리하고 고객을 놓치지 않게 만드는 설치형 직원 영업앱(PWA)이다.

우선순위:
1. 직원 사용성
2. 고객 누락 방지
3. 속도
4. 데이터 일관성
5. 기능 확장

역할 경계:
- ERP = 관리자/사무/회계/상세업무
- CRM = 직원 현장 영업 실행
- Window Lab = 창호 전문상담
- Window Check = 현장 점검
- 공통 고객/직원/현장/견적/계약 데이터는 기존 ERP/Supabase를 Single Source of Truth로 사용

## 2. 현재 개발 기준

- Repository: `eightyerp/eightyerp`
- Branch: `feat/crm-mobile-pwa-push-foundation`
- PR: #70 `feat: 직원용 EIGHTY CRM 모바일 PWA 기반`
- PR 상태: Draft / main 미병합
- 운영 DB PUSH migration: 미적용
- PUSH Edge Function: 운영 미배포
- Production Secret/VAPID: 미등록
- Production 배포: 미적용

## 3. 현재 구현 완료

### 앱/PWA
- `/crm` 독립 App Shell
- 하단 메뉴: 홈 / 고객 / 일정 / 견적 / 더보기
- manifest + service worker + standalone 설치
- Android/iPhone 설치 안내 `/crm/install`
- 고객 개인정보 Service Worker 캐시 금지
- 헤더 `+ 고객` → `/crm/customers/new`로 PWA 범위 안에서 신규등록

### CRM 홈
- 신규 문의 / 오늘 연락 / 오늘 일정 / 미처리 / 우선 처리
- `다음 행동 없음` 고객 자동 탐지

### 고객
- 카드형 목록 / 이름·전화·주소 검색
- 접수기간 시작일~종료일 서버 조회
- 접수일 + D+ 경과일
- 모바일 파이프라인
- 고객상세
- 카드 빠른행동: 전화 / 문자 / 상담기록 / 일정 잡기 / 상태 변경
- `/crm/customers/new` 간편 신규고객 등록
  - 고객명 / 연락처 / 주소 / 상담유형 / 유입경로 / 담당자 / 접수메모
  - 기존 `customers`, `createCustomer` 재사용
  - 직원은 본인 담당, 관리자는 담당자 선택
- `/crm/customers/[id]/status` 상태 변경
- 레거시 `계약`은 `계약 (기존)`으로 안전 보존
- 계약금액·확정수금·미수금·확인대기 읽기 전용 요약
- Window Lab 창호 전문상담 연결

### 상담/다음 행동
- 상담기록 저장
- 다음 연락시간 입력 시 실제 `재연락` 일정 생성
- 신규/미연락 고객 첫 상담기록 자동 단계전진
  - 방문 → `상담중`
  - 그 외 → `1차 연락완료`
- 이미 뒤 단계인 고객은 되돌리지 않음

### 일정
- 모바일 일정 목록 `/crm/schedules`
- 일정 처리 `/crm/schedules/[id]`: 전화 → 결과 → 다음 연락 → 완료/재예약
- `/crm/customers/[id]/schedule/new` 고객 일정 등록
  - 전화상담 / 방문상담 / 실측 / 견적작성 / 견적발송 / 계약상담 / 재연락 / 해피콜 / 기타
  - 시간 / 장소 / 메모
  - 실제 `customer_schedules` 사용
- 일정등록 전 담당직원 기존 일정과 1시간 기준 충돌 검사
  - 겹치면 저장하지 않고 직원에게 `담당자 일정이 겹칩니다` 표시
- 일정종류에 따른 고객 파이프라인 자동 단계전진. 현재보다 뒤 단계일 때만 적용
  - 방문상담 예약 → `방문예약`
  - 실측 예약 → `실측예약`
  - 견적작성 일정 → `견적작성중`
  - 계약상담 일정 → `계약협의`
- 연락 성격 일정은 `customers.next_contact_at` 날짜 요약도 동기화하되 정확한 시간 Source of Truth는 `customer_schedules`
- 일정 PUSH 클릭 → `/crm/schedules/[id]` 처리화면 deep link

### 견적
- 직원 범위 견적 목록
- `/crm/quotes/[id]` CRM 견적 요약
- 금액/VAT/상태/발행·발송·유효기간 확인
- 복잡한 수정은 기존 ERP 견적 상세 재사용

### 통합 알림함
- `/crm/notifications`
- 신규 고객 배분
- 배분 후 30분 첫 연락 없음
- 관리자용 10분 이상 담당자 미배정 신규문의
- 일정 등록/변경
- 예약 1시간 전
- 일정 +30분 미처리
- 3일/7일 장기방치
- OS PUSH를 꺼도 앱에서 알림 이력 확인
- 본인이 만든 자기 일정의 즉시 `schedule_changed` 알림은 Worker에서 skipped, Inbox에서도 숨김

## 4. 고객 누락 방지 PUSH 계약

1. 회사/관리자 신규고객 배분 즉시 담당자 1회
2. 서버 자동유입/service_role 담당자 지정 고객도 배분 PUSH 대상
3. 직원 본인 직접등록은 불필요한 자기 배분 PUSH 제외
4. 배분 후 30분 첫 연락·상담·예약 없음 → 담당자 1회
5. 신규문의 10분 이상 담당자 미배정 → 같은 회사 admin/super_admin 1회
6. 일정 등록/변경 → 담당자 1회. 단 본인이 자기 일정을 만든 즉시 자기 PUSH 억제
7. 예약 1시간 전 → 담당자 1회
8. 예정시간 +30분 미처리 → 담당자 1회
9. 3일 후속 없음 → 담당자 1차
10. 7일 장기방치 → 담당자 2차 + 관리자 경고
11. 14일은 반복 PUSH 대신 CRM/ERP 강한 경고 방향

PUSH 피로 방지:
- dedupe key
- 완료/취소/재예약/상담/후속일정 발생 시 관련 조건 해제
- 장기방치 매일 반복 금지
- 일정 1시간 전/+30분 리마인드는 본인이 만든 일정도 정상 발송
- 허용 deep link는 `/crm...` 및 관리자용 same-origin `/customers/...`

실사용 후 판단:
- 비긴급 21:00~08:00 Quiet Hours
- 견적 발송 후 후속 없음 PUSH
- 약속 입금일/계약 확인일 PUSH
- 알림 읽음/안읽음

## 5. PUSH 운영 preflight

운영 DB에는 아직 적용하지 않았다.

읽기 전용 운영 Supabase `eighty-erp` (`zhihbyarqpkudqyomcxv`) 확인:
- `customers`, `employees`, `customer_schedules`, `customer_activities`
- `notification_events`, `schedule_alert_events`
- `current_employee_id`, `current_company_id`, `is_erp_user`, `is_admin`
- 멀티회사 company_id 기본값/RLS
- 상담기록 → `customer_activities` mirror로 방치 타이머 reset 가능
- `notification_events.event_type`에 `customer_assigned` 허용
- `schedule_alert_events` event_type CHECK 없음
- `crm_push_subscriptions`, `schedule_alert_events.dedupe_key`는 운영 미적용

준비 migration:
- `20260816090000_crm_mobile_push_foundation.sql`
- `20260816093000_crm_push_policy_completion.sql`
- `20260816110000_crm_assignment_followup.sql`
- `20260816111500_crm_unassigned_customer_alert.sql`

preflight 후 수정:
- service_role scheduler company_id 명시
- 과거 배분 이벤트 30분 알림 일괄 재생 방지
- 서버 자동유입 담당자 배정도 배분 이벤트 처리
- 일정 PUSH → 일정 처리화면 deep link
- 미배정 관리자 PUSH → 고객 담당자 편집화면 deep link
- 본인 일정 생성/수정 즉시 자기 PUSH 억제

## 6. 성능 / CI

성능 원칙:
- 고객목록 pageSize 30
- 모바일 파이프라인 count-only + 선택 단계만 조회
- `다음 행동 없음`: 담당 고객 최대 100 + 일정 최대 500
- 견적 pagination 재사용
- 고객상세 병렬조회
- 알림함 최근 최대 50건
- PUSH worker idempotent
- 전체 고객 Client 다운로드 금지

CI:
- 기존 Window workflow lifecycle guard
- `scripts/test-crm-mobile-contract.mjs`
  - PWA / 신규고객 / 상담 / 상태 / 레거시 계약상태
  - 모바일 일정등록 / 일정충돌 방지 / 일정별 단계전진
  - 신규배분 / 30분미연락 / 10분미배정 / 일정 / 1시간 / +30분 / 3일 / 7일 PUSH
  - 자동 시스템배분 / deep link / self-PUSH 억제 / 통합 Inbox

최신 앱 코드 체크포인트:
- commit `a7f330b6e97ba263c6d11f51e187ac94cfc0df4f`
- ERP CI run #123 `31942065075`: SUCCESS
- Window lifecycle guard: PASS
- CRM mobile contract guard: PASS
- ESLint: PASS
- Production Build: PASS
- Compile: 10.0s
- TypeScript: 16.4s
- Static generation: 43 pages / 609ms
- 정상 CRM routes:
  - `/crm`
  - `/crm/customers`, `/crm/customers/new`, `/crm/customers/[id]`
  - `/crm/customers/[id]/status`
  - `/crm/customers/[id]/schedule/new`
  - `/crm/install`, `/crm/notifications`
  - `/crm/quotes`, `/crm/quotes/[id]`
  - `/crm/schedules`, `/crm/schedules/[id]`

## 7. 현재 배포/테스트 상태

- Vercel 결제수단 등록 확인: 2026-08-16
- 팀 UI는 여전히 Hobby로 보여 일부 커밋 Preview가 build rate limit에 걸릴 수 있음
- 개발은 GitHub CI로 계속 가능
- Preview는 체크포인트 위주 사용
- 직전 정상 Preview: `https://eightyerp-git-feat-crm-mobile-pwa-push-foundation-eighty-erp.vercel.app`
- 실제 로그인 직원 계정의 모바일 360/390/430px QA 필요
- Android Chrome / iPhone Safari PWA 실기기 설치 확인 필요

## 8. Release Gate

완료:
- [x] ERP Lifecycle Guard
- [x] CRM Mobile Contract Guard
- [x] Lint / Production Build
- [x] PUSH 운영 스키마 read-only preflight
- [x] 멀티회사 company_id 보존
- [x] 신규배분 / 30분미연락 / 10분미배정 / 일정 / 3일·7일 알림 코드
- [x] 통합 CRM Inbox
- [x] PWA 내부 신규고객 등록
- [x] 모바일 고객 상태 변경
- [x] 모바일 고객 일정 등록
- [x] 일정 중복예약 방지
- [x] 일정별 파이프라인 자동 단계전진

남음:
- [ ] 모바일 360/390/430px 실기기/Preview QA
- [ ] Android Chrome PWA 설치/E2E
- [ ] iPhone Safari PWA 설치/E2E
- [ ] VAPID public/private + Worker Secret 등록
- [ ] 운영 migration 적용 승인
- [ ] Edge Function 운영 배포 + scheduler 연결
- [ ] 직원 1~2명 PUSH E2E
- [ ] 대표 최종 승인
- [ ] main 병합 / Production 배포

## 9. 다음 작업

### NOW
1. 모바일/PWA 실기기 QA
2. `+ 고객 → 고객상세 → 전화 → 상담 → 자동상태전환 → 일정등록 → 충돌방지 → 일정완료/재예약 → 견적확인` E2E
3. 360/390/430px 가독성·터치·키보드·뒤로가기 문제 수정

### NEXT — 운영 변경 승인 필요
4. VAPID/Worker Secret 준비 및 등록
5. 4개 PUSH migration 운영 적용
6. `crm-push-delivery` Edge Function 배포
7. scheduler 연결
8. 테스트 직원 1~2명 PUSH E2E

### AFTER
9. 견적 후속 PUSH 필요성 실사용 검증
10. 계약/수금 모바일 읽기 UX 보완
11. Window Lab / Window Check 연결 UX 마감
12. 직원 피드백 기반 최소 수정

## 10. 하지 말 것

- 별도 CRM 고객 DB 생성 금지
- ERP 전체 기능을 CRM에 복제 금지
- 회계/지출결의/정산을 CRM 핵심 메뉴로 확장 금지
- 승인 없이 운영 DB migration 금지
- 승인 없이 VAPID/Secret/Edge Function 운영 활성화 금지
- 승인 없이 main merge/Production 배포 금지
- 유료 서비스 임의 결제 금지

## 11. 새 채팅 시작문구

`EIGHTY CRM 개발 계속. AGENTS.md, docs/CRM_APP_STATUS.md, docs/CRM_APP_MISSION_AND_PUSH_POLICY.md와 PR #70 최신 상태를 먼저 확인하고, 중복 구현 없이 NEXT 작업부터 계속 진행. 속도와 임무 항상 체크.`

이 문서를 읽은 Agent는 과거 채팅 전체를 다시 읽으라고 사용자에게 요구하지 않는다.
