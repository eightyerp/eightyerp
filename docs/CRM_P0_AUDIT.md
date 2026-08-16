# EIGHTY CRM P0 구조 감사

기준일: 2026-08-16
기준 저장소: `eightyerp/eightyerp`
기준 브랜치: `main`

## 결론

직원용 CRM은 신규 백엔드/신규 데이터베이스를 만들지 않고 기존 ERP 저장소 안의 `/crm` 전용 App Shell로 우선 구현한다.

- ERP: 관리자/사무/회계 전체 기능
- CRM: 직원 모바일 영업 업무
- 데이터: 기존 Supabase 단일 원본
- 인증/권한: 기존 ERP 권한 재사용
- Window Check / Window Lab: 기존 customer/project 식별자를 재사용해 연결

별도 `eighty-crm` 저장소는 현재 단계에서는 만들지 않는다. 코드 중복, 인증 중복, 배포/타입 동기화 비용이 현재 이점보다 크다.

## 재사용 가능한 기존 자산

### 고객 파이프라인

- `/customers/pipeline`
- 6단계 파이프라인
- 담당자 권한 범위
- 연락 지연 분류
- 미배정 고객 집계

PC Kanban은 유지하고 CRM 모바일에서는 단계 탭 + 세로 카드로 재표현한다.

### 오늘 할 일

`lib/crm/today-work.ts`와 `lib/crm/today-work-shared.ts`를 재사용한다.

이미 다음 업무 분류가 존재한다.

- 상담
- 실측
- 견적 작성
- 견적 발송
- 계약 상담
- 지난 미처리
- 다음 연락

ERP용 `TodayWorkDashboard`는 관리자 기능이 많으므로 데이터 로직만 재사용하고 모바일 UI는 별도 구현한다.

### 일정 / 재연락

`customer_schedules`는 `start_at timestamptz`를 사용하므로 정확한 시각 알림의 기준으로 사용한다.

반면 `customers.next_contact_at`은 운영 DB에서 `date`이므로 날짜 기반 요약/필터에는 유지하되 정확한 푸시 시각에는 사용하지 않는다.

CRM에서 다음 연락 시간을 잡을 때 `재연락` customer schedule을 생성하고 고객의 `next_contact_at` 날짜를 동기화하는 방향을 사용한다.

### 알림 이벤트

이미 다음 기반이 존재한다.

- `notification_events`
- `schedule_alert_events`
- `customer_assigned`
- `consult_remind_1h`
- `consult_remind_1d`
- `consult_unhandled`
- `schedule_changed`

현재는 실제 OS Web Push 전송기가 없고 ERP 상단 알림이 약 30초 polling으로 이벤트를 조회한다.

기존 이벤트 큐는 유지하고 Web Push를 추가 배송 채널로 확장한다.

### PWA

기존 `/customer` 자재승인 PWA가 별도로 존재한다.

- `public/customer-manifest.webmanifest`
- `public/sw-customer.js`

직원 CRM은 이를 덮어쓰지 않고 `/crm` 전용 manifest/service worker를 별도로 둔다.

## CRM 알림 제품 규칙

### 1. 회사 배분 고객

조건:
- 관리자/회사 측에서 담당자가 새로 지정되거나 변경됨

동작:
- 담당 직원에게 즉시 1회 알림
- CRM 고객 상세로 deep link
- 동일 변경에 중복 발송 금지

### 2. 예약/상담 고객

조건:
- 활성 `customer_schedules.start_at` 기준

기본 규칙:
- 예정 1시간 전 1회

향후 설정으로 1일 전 알림을 켤 수 있도록 타입은 유지하되 기본 반복 알림은 최소화한다.

### 3. 미연락

조건:
- 예정시간이 30분 이상 지남
- 완료/취소/연기 처리되지 않음
- 후속 재예약 일정이 없음

동작:
- 담당 직원에게 1회 알림
- 같은 미처리 상태에서 반복 발송하지 않음
- 완료/연기/재예약 시 조건 해제

### 4. 관리자 에스컬레이션

P0/P1에서는 구현하지 않는다. 직원 알림 효과를 확인한 후 장기 미연락(예: 24시간) 관리자 알림을 별도 검토한다.

## 성능 감사

현재 확인된 좋은 기준:

- 고객목록 page size 50
- 검색 debounce 300ms
- 목록 `select('*')` 금지 테스트
- 고객상세 독립 데이터 병렬 로딩
- 파이프라인 필요한 컬럼만 조회

주의점:

- 파이프라인 최대 500건 단위 조회
- 일정 목록 일부 경로 최대 800건 조회
- 모바일 CRM에서는 관리자용 전체 목록을 그대로 호출하지 않고 본인 담당 + 오늘/근접 일정 중심으로 더 좁은 query를 우선한다.

운영 DB Performance Advisor에서 `customer_schedules` 및 `schedule_alert_events` 관련 일부 RLS init-plan/외래키 인덱스 경고가 확인됐다. 현재 데이터 규모에서는 즉시 장애 요인은 아니지만 CRM 사용량 증가 전에 관련 query/index를 측정하고 필요한 것만 보완한다.

## 보안 감사

- 기존 RLS/담당자 범위를 유지한다.
- CRM PWA에 전체 고객 데이터를 오프라인 캐시하지 않는다.
- Service Worker는 앱 shell 정적 자산 외 고객 응답을 캐시하지 않는다.
- Push subscription은 로그인 사용자 소유로 저장한다.
- VAPID private key를 client에 노출하지 않는다.
- 운영 DB DDL 및 Secret 반영은 별도 승인 전 실행하지 않는다.

운영 DB Security Advisor에 기존 프로젝트 전반의 SECURITY DEFINER/권한 관련 경고가 다수 존재한다. CRM 신규 기능에서 이 패턴을 확대하지 않으며, 별도 안정화 과제로 분리한다.

## 구현 순서

1. `/crm` 독립 App Shell
2. CRM 홈 - 오늘 할 일
3. 모바일 고객 카드/검색
4. CRM 고객 상세 빠른 행동
5. `/crm` PWA manifest + service worker
6. Web Push subscription 저장 기반
7. 배분 고객 자동 이벤트
8. 예약 1시간 전 / 미연락 30분 이벤트 생성기
9. Web Push delivery worker
10. 직원 테스트 후 알림 빈도 조정

## Release Gate

- ERP 기존 화면 회귀 없음
- TypeScript PASS
- ESLint PASS
- Next production build PASS
- 고객목록 성능 contract PASS
- CRM 모바일 360/390/430px 확인
- 담당자 RLS 확인
- 알림 dedupe 확인
- 운영 DB migration은 승인 전 미적용
- Production merge/deploy는 승인 전 금지
