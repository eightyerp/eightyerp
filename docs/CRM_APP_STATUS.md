# EIGHTY CRM APP — CURRENT STATUS / SOURCE OF TRUTH

> 이 문서는 EIGHTY CRM 개발의 단일 진행상황 기준이다. 채팅보다 이 문서를 우선한다.
> 새 채팅/새 Agent는 `AGENTS.md` → 이 문서 → `docs/CRM_APP_MISSION_AND_PUSH_POLICY.md` → `docs/CRM_PUSH_RELEASE_AND_ROLLBACK.md` → PR #70 순으로 확인한다.

## 1. 최상위 임무

EIGHTY CRM은 ERP 모바일 복제품이 아니다.

직원이 휴대폰에서 `신규등록 → 연락 → 상담기록 → 다음 행동 → 일정 → 견적 → 계약/수금 확인`을 최소 터치로 처리하고 고객을 놓치지 않게 만드는 설치형 직원 영업앱(PWA)이다.

우선순위는 `직원 사용성 → 고객 누락 방지 → 속도 → 데이터 일관성 → 기능 확장`이다.

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

## 3. 직원 앱 현재 구현

### PWA / 모바일
- `/crm` 독립 App Shell
- 하단 메뉴: 홈 / 고객 / 일정 / 견적 / 더보기
- manifest + service worker + standalone
- `viewport-fit=cover`, iPhone 상·하단 safe-area 대응
- Android/iPhone 설치 안내 `/crm/install`
- 설치 후 홈화면 아이콘 재실행 → `알림`에서 PUSH 활성화 안내
- PUSH deep link는 `/crm...` 범위만 허용
- 고객 개인정보 Service Worker 캐시 금지

### CRM 홈
- 신규 문의 / 오늘 연락 / 오늘 일정 / 미처리 / 다음 행동 없음 / 우선 처리
- 전용 경량 `getCrmMobileHomeBundle`
- 기존 ERP 전체 Today Work 로딩 제거
- 일정 800건 / 견적 500건 선로딩 제거
- 오늘·미처리·후속 대상만 제한 조회
- `다음 행동 없음`도 DB에서 `next_contact_at 없음/경과`만 조회
- 열린 일정은 `customer_id`만 조회하고 완료/취소 일정 제외
- 관리자라도 직원연결 계정은 본인 담당 범위 유지

### 고객
- 카드형 목록, 검색, 접수기간, 접수 D+, 모바일 파이프라인
- 고객카드: 전화 / 문자 / 상담기록 / 일정잡기 / 상태변경
- `/crm/customers/new` 간편 신규고객 등록
- 연락처 입력 시 기존 고객 중복검사 → 기존 CRM 고객 바로 열기
- 중복 확인 상태에서는 신규등록 차단
- `/crm/customers/[id]/status` 모바일 단계변경
- 레거시 `계약` 상태 안전보존
- `/crm/customers/[id]/assignee` 관리자 간편 담당자 배정
- 계약·수금 읽기 요약
- Window Lab 창호 전문상담 연결

### 고객 조회 정확성 / 속도
- 운영 PostgreSQL TimeZone = `UTC` 확인
- 모바일 고객목록 전용 `listCrmMobileCustomers`
- 접수기간은 한국 업무일 기준 `+09:00`
  - 시작 `T00:00:00+09:00`
  - 종료 `T23:59:59.999+09:00`
- 오늘 연락도 `Asia/Seoul` 기준
- 필요한 컬럼만 조회
- pageSize 기본 30 / 최대 50
- 파이프라인: 단계별 count-only + 선택단계 최대 50건

### 상담 / 다음 행동
- 상담기록 저장
- 다음 연락시간 입력 → 실제 `재연락` 일정 생성
- 신규/미연락 첫 상담 자동 전진
  - 방문 → `상담중`
  - 기타 → `1차 연락완료`
- 이미 뒤 단계인 고객은 되돌리지 않음
- 열린 일정이 있으면 `다음 행동 없음` 중복 경고 안 함

### 일정
- `/crm/schedules`, `/crm/schedules/[id]`
- 일정 처리: 전화 → 결과 → 다음 연락 → 완료/재예약
- `/crm/customers/[id]/schedule/new`
- 전화상담 / 방문상담 / 실측 / 견적작성 / 견적발송 / 계약상담 / 재연락 / 해피콜 / 기타
- 담당자 일정 1시간 기준 충돌검사 → 충돌 시 저장차단
- 일정별 자동 단계전진, 현재보다 뒤 단계일 때만 적용
  - 방문상담 → `방문예약`
  - 실측 → `실측예약`
  - 견적작성 → `견적작성중`
  - 계약상담 → `계약협의`
- 정확한 일정시간 Source of Truth = `customer_schedules.start_at`

### 견적
- 직원 범위 견적목록
- `/crm/quotes/[id]` 모바일 요약
- 금액/VAT/상태/발행·발송·유효기간
- 복잡한 편집은 기존 ERP 견적 재사용

### 통합 알림함
- `/crm/notifications`
- OS PUSH가 꺼져도 앱 안에서 이력 확인
- 신규고객 배분 / 배분+30분 미연락 / 10분 미배정 / 일정등록·변경 / 1시간전 / +30분 미처리 / 3일·7일 방치
- 본인이 만든 자기 일정 즉시 `schedule_changed` PUSH는 skipped + Inbox 숨김
- 미배정 관리자 알림은 CRM 내부 담당자 배정 화면으로 연결

## 4. 고객 누락 방지 PUSH 계약

1. 회사/관리자 신규고객 배분 즉시 담당자 1회
2. 서버 자동유입/service_role 자동배분도 대상
3. 직원 본인 직접등록은 자기 배분 PUSH 제외
4. 배분 후 30분 첫 연락·상담·예약 없음 → 담당자 1회
5. 신규문의 10분 이상 미배정 → 같은 회사 admin/super_admin 1회
6. 일정 등록/변경 → 담당자 1회, 단 자기 일정 즉시 자기 PUSH 억제
7. 예약 1시간 전 → 담당자 1회
8. 예정시간 +30분 미처리 → 담당자 1회
9. 3일 후속 없음 → 담당자 1차
10. 7일 장기방치 → 담당자 2차
11. 14일은 반복 PUSH보다 CRM/ERP 강한 경고 방향

중복/피로 방지:
- dedupe key
- 배분 이후 일정이 등록되면 배분 +30분 재촉 없음
- 열린 일정이 있으면 3/7일 stale PUSH 없음
- 완료 일정 `completed_at`은 stale 타이머 reset
- 상담/후속일정 발생 시 관련 조건 reset
- 장기방치 매일 반복 금지

실사용 후 결정: Quiet Hours, 견적 후속 PUSH, 약속 입금일 PUSH, 알림 읽음/안읽음.

## 5. PUSH Worker 신뢰성

- pending → processing 조건부 선점
- Worker 중복실행 이중발송 방지
- 10분 이상 멈춘 CRM processing만 복구
- 일시 오류 최대 3회 재시도
- retry 횟수 payload 저장
- 404/410 subscription 자동 비활성화
- 성공 sent / 구독없음 skipped / 최종실패 failed
- deep link는 `/crm` 내부만 허용

준비 migration:
- `20260816090000_crm_mobile_push_foundation.sql`
- `20260816093000_crm_push_policy_completion.sql`
- `20260816110000_crm_assignment_followup.sql`
- `20260816111500_crm_unassigned_customer_alert.sql`

Rollback: `docs/CRM_PUSH_RELEASE_AND_ROLLBACK.md`

## 6. CI / 속도

CI:
1. Window workflow lifecycle guard
2. CRM mobile contract guard
3. CRM mobile layout guard
4. CRM home performance guard
5. ESLint
6. Production Build

동일 PR 새 커밋 시 이전 CI는 concurrency로 자동 취소한다.

최신 기능 코드 체크포인트:
- commit `b685c97a490f174d7063d2e3cb64a12b6544326e`
- ERP CI run #157 `31944374363`: SUCCESS
- Window Lifecycle Guard: PASS
- CRM Mobile Contract Guard: PASS
- CRM Mobile Layout Guard: PASS
- CRM Home Performance Guard: PASS
- ESLint: PASS — **0 errors / 0 warnings**
- Production Build: PASS
- Compile **9.3s**
- TypeScript **16.0s**
- Static generation **43 pages / 562ms**

정상 CRM routes:
`/crm`, `/crm/customers`, `/crm/customers/new`, `/crm/customers/[id]`, `/crm/customers/[id]/assignee`, `/crm/customers/[id]/status`, `/crm/customers/[id]/schedule/new`, `/crm/install`, `/crm/notifications`, `/crm/quotes`, `/crm/quotes/[id]`, `/crm/schedules`, `/crm/schedules/[id]`.

## 7. 배포 / 실제 모바일 QA

- Vercel 결제수단 등록 확인
- 팀이 여전히 Hobby로 보여 일부 Preview가 build-rate-limit 발생
- GitHub CI 개발/검증은 정상
- 코드 기반 모바일 Layout Guard 완료
- 실제 로그인 상태의 360/390/430px 시각 QA는 아직 필요
- Android Chrome PWA 설치/E2E 아직 필요
- iPhone Safari PWA 설치/E2E 아직 필요

## 8. Release Gate

완료:
- [x] ERP Lifecycle Guard
- [x] CRM Contract/Layout/Home Performance Guard
- [x] ESLint 0 errors / 0 warnings
- [x] Production Build
- [x] KST 접수기간/오늘 연락 정합성
- [x] PWA 내부 신규고객 등록 + 중복방지
- [x] PWA 내부 관리자 담당자 배정
- [x] 모바일 상태변경 / 일정등록 / 충돌방지 / 자동단계전진
- [x] PUSH 운영 스키마 read-only preflight
- [x] PUSH 중복방지/재시도/복구 코드
- [x] PUSH Release/Rollback runbook
- [x] 통합 CRM Inbox
- [x] CRM 홈 대량조회 제거

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
1. Preview 제한 해제 즉시 실제 360/390/430px 화면 QA
2. Android/iPhone PWA 설치 E2E
3. 실제 직원 1명 기준 `신규등록 → 상담 → 일정 → 견적` E2E
4. 운영 PUSH 적용 승인 직전 최종 점검

### 승인 이후
5. migration 순차 적용
6. VAPID/Worker Secret 등록
7. Edge Function 수동 테스트
8. 테스트 직원 1명 → 2명 PUSH E2E
9. scheduler 마지막 활성화
10. 대표 승인 후 main/Production

## 10. 금지

- 별도 CRM 고객 DB 생성 금지
- ERP 전체 기능 CRM 복제 금지
- 회계/지출결의/정산 CRM 핵심 확장 금지
- 승인 없이 운영 DB migration 금지
- 승인 없이 Production Secret 등록 금지
- 승인 없이 main merge/Production 배포 금지
- 유료 서비스 임의 추가결제 금지

## 11. 새 채팅 시작 문구

`EIGHTY CRM 개발 계속. AGENTS.md, docs/CRM_APP_STATUS.md, docs/CRM_APP_MISSION_AND_PUSH_POLICY.md, docs/CRM_PUSH_RELEASE_AND_ROLLBACK.md와 PR #70 최신 상태를 먼저 확인하고, 중복 구현 없이 NOW 작업부터 계속 진행. 속도와 임무 항상 체크.`
