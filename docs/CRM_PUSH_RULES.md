# EIGHTY CRM Push Rules

## 목표

직원이 회사 배분 고객, 예약/재연락 고객을 놓치지 않게 하되 반복 알림으로 피로하게 만들지 않는다.

## 이벤트

### customer_assigned
- 회사/관리자가 고객 담당자를 새로 배정하거나 변경했을 때
- 새 담당 직원에게 즉시 1회
- 동일 assignee 전환에 중복 금지
- deep link: `/crm/customers/{customer_id}`

### crm_schedule_remind_1h
- `customer_schedules.start_at` 1시간 전
- 활성 상태(`예정`, `진행중`)만
- 일정당 1회

### crm_schedule_unhandled_30m
- `customer_schedules.start_at` 30분 후에도 활성/미처리일 때
- 일정당 1회
- 완료/취소/연기 후 후속 일정이 있으면 보내지 않음

## 시간 원본

정확한 시각 알림은 `customer_schedules.start_at timestamptz`가 원본이다.
`customers.next_contact_at`은 날짜 기반 검색/요약용으로만 사용한다.

CRM 상담 저장에서 다음 연락시각을 입력하면:
1. 상담로그 저장
2. 고객 `next_contact_at` 날짜 동기화
3. `재연락` customer schedule 생성

## 중복방지

알림 delivery 전에 `(event_type, schedule_id, assigned_employee_id)` 기준의 idempotency/dedupe를 보장한다.
배분고객은 실제 담당자 변경 시에만 이벤트를 생성한다.

## 알림 피로 방지

P0/P1 기본값:
- 배분 즉시 1회
- 일정 1시간 전 1회
- 미처리 +30분 1회

1일 전 알림, 관리자 에스컬레이션, 반복 재촉은 직원 테스트 후 판단한다.
