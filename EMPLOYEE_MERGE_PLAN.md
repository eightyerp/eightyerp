# Employee Master 중복 직원 병합 계획

## 현재 마이그레이션 소스에서 확인된 `employees.id` 참조

실제 운영 스키마의 최종 목록은 사전검증 SQL이 `pg_constraint`를 조회해 확정한다. 저장소 마이그레이션에서는 다음 참조가 확인됐다.

| 테이블 | 컬럼 | 처리 |
|---|---|---|
| `customers` | `assigned_employee_id` | 기준 직원으로 이전 |
| `quotes` | `assigned_employee_id` | 기준 직원으로 이전 |
| `customer_quotes` | `assigned_employee_id` | 기준 직원으로 이전 |
| `projects` | `assigned_employee_id` | 기준 직원으로 이전 |
| `contracts` | `assigned_employee_id` | 기준 직원으로 이전 |
| `customer_schedules` | `assigned_employee_id` | 기준 직원으로 이전 |
| `project_process_schedules` | `assigned_employee_id` | 기준 직원으로 이전 |
| `schedule_alert_events` | `assigned_employee_id` | 기준 직원으로 이전 |
| `employee_tasks` | `assigned_employee_id` | 기준 직원으로 이전 |
| `customer_activities` | `employee_id`, `previous_assignee_id`, `new_assignee_id` | 동일 인물 식별을 위해 기준 직원으로 이전 |
| `profiles` | `employee_id` | 로그인 충돌 규칙으로 별도 처리 |
| `company_memberships` | `employee_id` | 선택한 로그인 계정과 함께 별도 처리 |
| `employee_master_events` | `employee_id` | 과거 감사 이력이므로 원본 유지 |

새 마이그레이션 적용 후에는 `employees.merged_into_employee_id`와 `employee_merge_logs.source_employee_id/target_employee_id`도 자기참조 및 감사 목적으로 추가된다. 이 참조는 이전 대상이 아니다.

## 누락 방지 및 원자성

1. 사전검증이 운영 DB의 모든 FK와 복합 FK 존재 여부를 읽기 전용으로 출력한다.
2. 영향 분석 RPC가 실행 시점의 단일 컬럼 FK와 FK 미선언 `employee_id`·`assigned_employee_id` UUID 후보를 카탈로그에서 다시 전수 조사한다.
3. 병합 RPC도 같은 합집합을 순회하므로 향후 추가된 업무 직원 참조가 하드코딩 목록에서 빠지지 않는다.
4. 프로필·회사 멤버십은 로그인 충돌 해소 후 처리하고 감사 테이블은 역사 보존 대상으로 제외한다.
5. 각 업무 참조마다 `source=0`, `target=source_before+target_before`를 즉시 검사한다.
6. 제약 충돌 또는 건수 불일치가 발생하면 PostgreSQL 함수 호출 전체가 롤백된다.
7. 중복 직원 행은 삭제하지 않고 비활성화 및 병합 메타데이터만 기록한다.

## 실행 순서

1. `20260805000001_employee_merge_preflight.sql` 실행 및 복합 FK·고아 참조가 0인지 확인
2. `20260805000001_employee_merge.sql` 검토 후 별도 승인 시 적용
3. UI에서 영향 분석 → 로그인 충돌 선택 → 이름·이전 건수 확인 → 병합
4. `20260805000001_employee_merge_verify.sql` 실행

이번 구현 작업에서는 운영 DB에 어떤 SQL도 실행하지 않았다.
