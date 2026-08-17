# EIGHTY CRM PUSH — RELEASE / ROLLBACK RUNBOOK

> 운영 적용 전 준비 문서. 이 문서의 SQL/배포 작업은 대표 승인 전 실행하지 않는다.

## 1. 적용 목적

직원용 EIGHTY CRM에서 다음 고객 누락 방지 알림을 실제 Web Push로 활성화한다.

- 회사/관리자 신규고객 배분
- 자동 유입/자동 배분
- 배분 후 30분 첫 연락 없음
- 신규문의 10분 담당자 미배정 관리자 알림
- 일정 등록/변경
- 일정 1시간 전
- 일정 +30분 미처리
- 3일/7일 장기방치

## 2. 운영 적용 순서

한 번에 모두 켜지 않는다.

1. 최신 `main`/PR/CI 확인
2. 운영 DB backup/PITR 상태 확인
3. migration 4개 순서대로 적용
   - `20260816090000_crm_mobile_push_foundation.sql`
   - `20260816093000_crm_push_policy_completion.sql`
   - `20260816110000_crm_assignment_followup.sql`
   - `20260816111500_crm_unassigned_customer_alert.sql`
4. schema/RLS/index/functions 검증
5. VAPID public/private key 준비
6. `CRM_PUSH_WORKER_SECRET` 준비
7. Supabase Edge Function `crm-push-delivery` 배포
8. Secret 연결
9. 테스트 직원 1명만 Web Push 구독
10. Worker를 수동 1회 호출하여 빈 큐/테스트 이벤트 확인
11. 신규배분 1건 E2E
12. 일정등록/1시간전/+30분 E2E
13. 중복방지/완료/재예약 reset 확인
14. 테스트 직원 2명으로 확대
15. 문제 없을 때만 scheduler 활성화

## 3. 적용 직후 필수 검증

### DB

- `crm_push_subscriptions` RLS enabled
- authenticated 직접 insert/update 불가
- `register_my_crm_push_subscription` / `disable_my_crm_push_subscription` authenticated execute만 허용
- `schedule_alert_events.dedupe_key` unique partial index 존재
- 고객/직원/일정 기존 RLS 변경 없음
- `company_id`가 새 CRM 알림 이벤트에 존재

### 이벤트

- 같은 배분 이벤트의 30분 알림은 1회
- 배분 이후 일정이 생기면 30분 재촉 없음
- 열린 미처리 일정이 있으면 stale 3/7일 PUSH와 중복 없음
- 일정 완료 `completed_at`은 stale 타이머를 reset
- 자기 일정 등록/변경 즉시 자기 `schedule_changed` PUSH 없음
- 일정 1시간전/+30분 알림은 정상 유지

### Worker

- pending 이벤트를 `processing`으로 선점
- 중복 Worker 실행 시 같은 이벤트 중복발송 없음
- 10분 이상 멈춘 CRM processing 이벤트만 복구
- 일시적인 Web Push 오류는 최대 3회 재시도
- 404/410 subscription은 비활성화
- Push deep link는 `/crm...` 범위만 허용

## 4. 즉시 Rollback — 권장

문제가 생기면 DB 구조를 바로 삭제하지 말고 **발송부터 멈춘다.**

1. scheduler 비활성화/삭제
2. `crm-push-delivery` 호출 중단
3. 신규 고객 배분 trigger 중단
4. 아직 발송되지 않은 CRM 전용 pending/processing 이벤트를 skipped 처리
5. 원인 분석

### 고객 배분 자동 이벤트 중단

```sql
drop trigger if exists customers_crm_assignment_event on public.customers;
```

### CRM 전용 미발송 이벤트 안전 정리

실제 운영에서 수행하기 전 대상 건수를 SELECT로 먼저 확인한다.

```sql
-- notification_events: CRM 신규배분만
update public.notification_events
set status = 'skipped', processed_at = now()
where event_type = 'customer_assigned'
  and status in ('pending', 'processing')
  and coalesce(payload ->> 'source', '') in (
    'automatic_company_assignment',
    'automatic_system_assignment',
    'manual_customer_push'
  );

-- schedule_alert_events: CRM Push 전용 이벤트만
update public.schedule_alert_events
set status = 'skipped', processed_at = now()
where event_type in (
  'schedule_changed',
  'consult_remind_1h',
  'consult_unhandled',
  'customer_assignment_uncontacted_30m',
  'customer_unassigned_10m',
  'customer_stale_3d',
  'customer_stale_7d'
)
  and status in ('pending', 'processing');
```

이 단계에서는 고객/상담/일정/견적/계약 데이터는 변경하지 않는다.

## 5. 기능 Rollback

발송 기능을 장기간 중단해야 한다면 scheduler 중단 후 아래 CRM 생성 함수를 제거할 수 있다.

```sql
drop function if exists public.enqueue_due_crm_schedule_alerts(timestamptz);
drop function if exists public.enqueue_due_crm_stale_customer_alerts(timestamptz);
drop function if exists public.enqueue_due_crm_assignment_followups(timestamptz);
drop function if exists public.enqueue_due_crm_unassigned_customer_alerts(timestamptz);
drop function if exists public.enqueue_crm_customer_assignment_event();
```

Web Push 구독 데이터는 그대로 두어도 ERP/CRM 고객업무에 영향을 주지 않는다.

## 6. 완전 구조 제거 — 최후 수단

영구적으로 Web Push 기능을 폐기할 때만 수행한다.

```sql
drop function if exists public.register_my_crm_push_subscription(text, text, text, text);
drop function if exists public.disable_my_crm_push_subscription(text);
drop table if exists public.crm_push_subscriptions;

drop index if exists public.schedule_alert_events_dedupe_key_uidx;
drop index if exists public.schedule_alert_events_assignee_idx;
drop index if exists public.schedule_alert_events_customer_idx;
drop index if exists public.customer_activities_customer_created_idx;
drop index if exists public.crm_customer_schedules_customer_start_active_idx;
drop index if exists public.crm_customer_schedules_customer_completed_idx;
```

`public.schedule_alert_events.dedupe_key`는 다른 기능이 사용하지 않는지 재확인한 후에만 컬럼 제거를 검토한다. 기본 Rollback에서는 컬럼을 유지한다.

## 7. Rollback 성공 기준

- 신규 배분/일정/방치 Web Push가 더 이상 발송되지 않음
- 고객 등록/수정 정상
- 고객 담당자 배정 정상
- 일정 등록/수정/완료 정상
- CRM 홈/고객/일정/견적 정상
- 기존 ERP 알림/고객/견적/계약/수금 기능 영향 없음
- 고객 데이터 삭제 없음

## 8. 운영 기록

실제 활성화 시 아래 값을 이 문서 또는 Release 기록에 남긴다.

- migration 적용 시각
- Edge Function deployment id/version
- scheduler job id/cadence
- VAPID public key fingerprint (private key 자체 기록 금지)
- 테스트 직원 계정/기기 종류
- 최초 E2E 성공 시각
- Rollback 필요 시 원인/조치/복구시각
