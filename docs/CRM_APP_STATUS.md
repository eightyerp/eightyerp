# EIGHTY CRM APP — CURRENT STATUS / SOURCE OF TRUTH

> 이 문서는 EIGHTY CRM 개발의 단일 진행상황 기준 문서다. 채팅보다 이 문서를 우선한다.
> 새 채팅/새 Agent는 `AGENTS.md` → 이 문서 → `docs/CRM_APP_MISSION_AND_PUSH_POLICY.md` → PR #70 최신 상태 순으로 확인한다.

## 1. 최상위 임무

EIGHTY CRM은 ERP 모바일 복제품이 아니다.

직원이 휴대폰에서 `신규등록 → 연락 → 상담기록 → 다음 행동 → 일정 → 견적 → 계약/수금 확인`을 최소 터치로 처리하고 고객을 놓치지 않게 만드는 설치형 직원 영업앱(PWA)이다.

우선순위:
1. 직원 사용성
2. 고객 누락 방지
3. 속도
4. 데이터 일관성
5. 기능 확장

역할 경계:
- ERP = 관리자/사무/회계/상세업무
- CRM = 직원 영업 실행
- Window Lab = 창호 전문상담
- Window Check = 현장 점검
- 고객/직원/현장/견적/계약 데이터는 기존 ERP/Supabase를 Single Source of Truth로 사용

## 2. 현재 개발 기준

- Repository: `eightyerp/eightyerp`
- Branch: `feat/crm-mobile-pwa-push-foundation`
- PR: #70 `feat: 직원용 EIGHTY CRM 모바일 PWA 기반`
- PR 상태: Draft / main 미병합
- 운영 PUSH migration: 미적용
- Edge Function/scheduler: 운영 미배포
- VAPID/Worker Secret: 운영 미등록
- Production 배포: 미적용

## 3. 직원 앱 구현 완료

### PWA/App Shell
- `/crm` 독립 App Shell
- 하단 메뉴: 홈 / 고객 / 일정 / 견적 / 더보기
- manifest + service worker + standalone + viewport-fit cover
- Android/iPhone 설치 안내 `/crm/install`
- 고객 개인정보 Service Worker 캐시 금지
- 헤더 `+ 고객` → `/crm/customers/new`

### 홈
- 신규 문의 / 오늘 연락 / 오늘 일정 / 미처리 / 우선처리
- `다음 행동 없음` 고객 자동 탐지
- Today Work 날짜 계산은 `Asia/Seoul` 기준

### 고객
- 카드형 고객목록
- 이름/전화/주소 검색
- 접수기간 시작일~종료일
- 접수일 + D+ 경과일
- 모바일 파이프라인
- 전화 / 문자 / 상담기록 / 일정 잡기 / 상태변경
- `/crm/customers/new` 간편 신규고객 등록
- `/crm/customers/[id]/status` 모바일 단계변경
- 레거시 `계약` 상태 안전보존
- `/crm/customers/[id]/assignee` 관리자 간편 담당자 배정
- 계약금액·확정수금·미수금 읽기 요약
- Window Lab 연결

### 고객 조회 정확성/속도
- 운영 PostgreSQL TimeZone = `UTC` 직접 확인
- 모바일 고객목록은 전용 `listCrmMobileCustomers` 사용
- 접수기간은 한국 업무일 경계 명시
  - 시작 `T00:00:00+09:00`
  - 종료 `T23:59:59.999+09:00`
- 오늘 연락도 `Asia/Seoul` 기준
- 카드에 필요한 컬럼만 조회
- pageSize 기본 30 / 최대 50
- 파이프라인도 기존부터 +09:00 기간필터 사용

### 상담/다음 행동
- 상담기록 저장
- 다음 연락시간 입력 시 실제 `재연락` 일정 생성
- 신규/미연락 첫 상담 시 자동 단계전진
  - 방문 → `상담중`
  - 기타 첫 상담 → `1차 연락완료`
- 이미 뒤 단계인 고객은 되돌리지 않음

### 일정
- `/crm/schedules`
- `/crm/schedules/[id]`: 전화 → 결과 → 다음 연락 → 완료/재예약
- `/crm/customers/[id]/schedule/new`
  - 전화상담 / 방문상담 / 실측 / 견적작성 / 견적발송 / 계약상담 / 재연락 / 해피콜 / 기타
- 담당자 기존 일정과 1시간 기준 충돌검사
- 충돌 시 저장 차단 + 사용자 안내
- 일정 종류별 자동 단계전진, 현재보다 뒤 단계일 때만 적용
  - 방문상담 → `방문예약`
  - 실측 → `실측예약`
  - 견적작성 → `견적작성중`
  - 계약상담 → `계약협의`
- 정확한 일정시간 Source of Truth = `customer_schedules.start_at`
- 연락 성격 일정은 `customers.next_contact_at` 날짜요약도 동기화

### 견적
- 직원 범위 견적목록
- `/crm/quotes/[id]` 모바일 요약
- 금액/VAT/상태/발행·발송·유효기간
- 복잡한 수정은 기존 ERP 견적 재사용

### 통합 알림함
- `/crm/notifications`
- 신규고객 배분
- 배분 +30분 첫 연락 없음
- 관리자용 신규문의 10분 미배정
- 일정 등록/변경
- 예약 1시간 전
- 일정 +30분 미처리
- 3일/7일 장기방치
- OS PUSH가 꺼져도 앱 안에서 이력 확인
- 본인이 만든 자기 일정의 즉시 `schedule_changed` 알림은 Worker에서 skipped 및 Inbox 숨김
- 미배정 관리자 알림은 `/crm/customers/[id]/assignee`로 연결되어 PWA 범위를 벗어나지 않음

## 4. 고객 누락 방지 PUSH 계약

1. 회사/관리자 신규고객 배분 즉시 담당자 1회
2. 서버 자동유입/service_role 자동배분도 대상
3. 직원 본인 직접등록은 불필요한 자기 배분 PUSH 제외
4. 배분 후 30분 첫 연락·상담·예약 없음 → 담당자 1회
5. 신규문의 10분 이상 미배정 → 같은 회사 admin/super_admin 1회
6. 일정 등록/변경 → 담당자 1회, 단 자기 일정 즉시 자기 PUSH 억제
7. 예약 1시간 전 → 담당자 1회
8. 예정시간 +30분 미처리 → 담당자 1회
9. 3일 후속 없음 → 담당자 1차
10. 7일 장기방치 → 담당자 2차 + 관리자 표시
11. 14일은 반복 PUSH보다 CRM/ERP 강한 경고 방향

공통:
- dedupe key
- 완료/취소/재예약/상담/후속일정 발생 시 조건 해제
- 장기방치 매일 반복 금지
- 일정 알림은 `/crm/schedules/[id]` deep link
- 미배정 알림은 `/crm/customers/[id]/assignee` deep link

실사용 후 결정:
- 21:00~08:00 Quiet Hours
- 견적 발송 후 후속 없음 PUSH
- 약속 입금일/계약 확인일 PUSH
- 알림 읽음/안읽음

## 5. PUSH 운영 preflight

운영 DB 변경 없이 read-only 검증 완료:
- 운영 project: `eighty-erp` / `zhihbyarqpkudqyomcxv`
- `customers`, `employees`, `customer_schedules`, `customer_activities`
- `notification_events`, `schedule_alert_events`
- `current_employee_id`, `current_company_id`, `is_erp_user`, `is_admin`
- 멀티회사 company_id 기본값/RLS
- 상담기록 → `customer_activities` mirror → 방치 타이머 reset 가능
- `notification_events.event_type`의 `customer_assigned` 허용
- `schedule_alert_events` event_type CHECK 없음
- 운영 DB TimeZone = UTC

준비 migration:
- `20260816090000_crm_mobile_push_foundation.sql`
- `20260816093000_crm_push_policy_completion.sql`
- `20260816110000_crm_assignment_followup.sql`
- `20260816111500_crm_unassigned_customer_alert.sql`

운영 미적용:
- `crm_push_subscriptions`
- `schedule_alert_events.dedupe_key`
- VAPID/Worker Secret
- `crm-push-delivery` Edge Function
- scheduler

## 6. 성능 / 회귀 방지

- 모바일 고객목록: 30건 단위, 필요한 컬럼만 조회
- 모바일 파이프라인: 단계별 count-only + 선택단계 최대 50건
- `다음 행동 없음`: 담당 고객 최대 100 + 관련 일정 최대 500
- 알림함 최근 최대 50건
- 고객상세 병렬조회
- 견적 pagination 재사용
- 전체 고객 Client 다운로드 금지
- PUSH Worker idempotent

CI:
- Window workflow lifecycle guard
- `scripts/test-crm-mobile-contract.mjs`
  - PWA scope
  - 신규고객/상담/상태/담당자배정
  - 레거시 계약 상태
  - 일정등록/충돌방지/자동 단계전진
  - KST 고객 조회기간/오늘 연락
  - 신규배분/30분미연락/10분미배정/일정/1시간/+30분/3일/7일 PUSH
  - 자동 시스템배분/deep link/self-PUSH 억제/통합 Inbox
- ESLint
- Production Build

최신 검증 체크포인트:
- commit `417d1161d58c0aa589e713cfddce268c64b935f1`
- ERP CI run #133 `31943099208`: SUCCESS
- Window Lifecycle Guard: PASS
- CRM Mobile Contract Guard: PASS
- ESLint: PASS
- Production Build: PASS
- Compile 11.0s
- TypeScript 17.8s
- Static generation 43 pages / 618ms
- 정상 신규 route 포함: `/crm/customers/[id]/assignee`

## 7. 배포/모바일 QA 상태

- Vercel 결제수단 등록 확인
- 팀은 여전히 Hobby 상태로 보이며 최신 체크포인트도 Vercel `build-rate-limit` 발생
- GitHub CI 개발/검증은 정상 진행 가능
- Preview는 제한 해제 후 체크포인트 위주로 사용
- 컨테이너 로컬 브라우저 QA는 외부 GitHub DNS 제한 때문에 repository clone 불가
- 코드 기반 360px 위험요소 점검 진행 중
- 실제 로그인 직원계정 360/390/430px 및 Android/iPhone PWA 실기기 QA는 아직 필요

## 8. Release Gate

완료:
- [x] ERP Lifecycle Guard
- [x] CRM Mobile Contract Guard
- [x] Lint / Production Build
- [x] KST 접수기간/오늘 연락 기준 정합성
- [x] PWA 내부 신규고객 등록
- [x] PWA 내부 관리자 담당자 배정
- [x] 모바일 상태변경
- [x] 모바일 일정등록
- [x] 일정 충돌방지 / 자동 단계전진
- [x] PUSH 운영 스키마 read-only preflight
- [x] 신규배분 / 30분미연락 / 10분미배정 / 일정 / 3일·7일 코드
- [x] 통합 CRM Inbox

남음:
- [ ] 모바일 360/390/430px 실제 렌더 QA
- [ ] Android Chrome PWA 설치/E2E
- [ ] iPhone Safari PWA 설치/E2E
- [ ] VAPID/Worker Secret 등록 승인
- [ ] 운영 migration 적용 승인
- [ ] Edge Function 운영 배포 + scheduler 연결
- [ ] 직원 1~2명 PUSH E2E
- [ ] 대표 최종 승인
- [ ] main 병합 / Production 배포

## 9. 다음 작업

### NOW
1. 코드 기반 모바일 레이아웃 QA 마감
2. PWA 설치/Service Worker 요건 재점검
3. 고객 신규등록 → 상담 → 일정 → 상태 → 견적 흐름 회귀점검
4. 운영 PUSH 적용 전 rollback/RLS 최종 체크

### 승인 이후
5. PUSH migration 적용
6. VAPID/Worker Secret 등록
7. Edge Function + scheduler 연결
8. 직원 1~2명 실제 PUSH/PWA E2E
9. 대표 승인 후 main/Production

## 10. 하지 말 것

- 별도 CRM 고객 DB 생성 금지
- ERP 전체 기능을 CRM에 복제 금지
- 회계/지출결의/정산을 CRM 핵심으로 확장 금지
- 승인 없이 운영 DB migration 금지
- 승인 없이 Production Secret 등록 금지
- 승인 없이 main merge/Production 배포 금지
- 유료 서비스 임의 추가결제 금지

## 11. 채팅 관리

새 채팅 시작 문구:

`EIGHTY CRM 개발 계속. AGENTS.md, docs/CRM_APP_STATUS.md, docs/CRM_APP_MISSION_AND_PUSH_POLICY.md와 PR #70 최신 상태를 먼저 확인하고, 중복 구현 없이 NEXT 작업부터 계속 진행. 속도와 임무 항상 체크.`
