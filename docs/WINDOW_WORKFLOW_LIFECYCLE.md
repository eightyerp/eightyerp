# EIGHTY 창호 업무 생명주기 계약

최종 기준: 2026-08-16

이 문서는 ERP, Window Check, Window Lab이 서로 다른 저장소에서 개발되더라도 같은 업무 ID와 상태 흐름을 유지하기 위한 Source of Truth다.

## 1. 표준 흐름

```text
ERP 고객
  ↓ customer_id
ERP 현장(projects.status='준비')
  ↓ project_id
Window Check 점검
  ↓ inspection_id
Window Lab 상담
  ↓ consultation_id = customer_consult_logs.id
ERP 견적
  ↓ quote_id
ERP 계약 + 기존 현장 재사용 + 실행예산
  ↓ contract_id / project_id / execution_budget_id
공사 일정 / 정산 / 품질기록
```

계약 전 단계에서도 `project_id`가 존재할 수 있고, 이것이 정상이다.

## 2. 공통 Identity

직원 신원은 앱마다 새로 만들지 않는다.

```text
auth.users.id
  → profiles.id
  → profiles.employee_id
  → employees.id
  → profiles.active_company_id
  → company_memberships / current_company_role()
```

모든 내부 앱은 같은 Supabase Auth 사용자와 영구 ID를 사용한다.

## 3. 업무 ID 역할

- `customer_id`: 고객 Master. 전체 업무의 최상위 고객 식별자.
- `project_id`: 물리적 현장/주소 단위. **계약 전에 생성 가능**하며 점검부터 계약 이후 공사까지 재사용한다.
- `inspection_id`: Window Check 1회 점검 기록.
- `consultation_id`: V1은 ERP `customer_consult_logs.id`를 사용한다.
- `quote_id`: 견적 1건/버전 식별자.
- `contract_id`: 계약 확정 후 생성되는 계약 식별자.
- `execution_budget_id`: 계약 전환 시 생성/연결되는 실행예산 식별자.

ID를 화면의 이름/주소/고객명으로 대체하지 않는다.

## 4. 계약 전 현장 규칙

### 생성

- 고객에게 활성 현장이 없으면 담당 직원 또는 관리자가 `projects` 1건을 만들 수 있다.
- 계약 전 생성되는 현장의 초기 상태는 서버에서 `준비`로 고정한다.
- 일반 직원은 본인 담당 고객에 대해서만 생성한다.
- 일반 직원이 생성하는 현장의 담당자는 본인으로 고정한다.
- 관리자는 담당자를 선택할 수 있다.

### 목적

계약 전 `project_id`는 공사 시작을 뜻하지 않는다.

다음 업무를 한 현장으로 묶기 위한 **영업/점검 현장 ID**다.

- 현장방문/실측
- Window Check
- Window Lab 상담
- 견적
- 고객 후속상담

## 5. 점검 → 상담 → 견적 연결 규칙

ERP Workflow Hub가 Window Lab으로 보낼 때:

```text
customerId
projectId
inspectionId (점검이 있으면)
```

Window Lab은 URL 값을 그대로 신뢰하지 않고 서버에서 다음을 다시 검증한다.

- 현재 회사
- 접근 가능한 고객
- project.customer_id 일치
- inspection.customer_id / project_id 일치

점검 기반 상담을 ERP에 저장한 후:

```text
consultation_id
source_project_id
source_inspection_id
```

견적에는:

```text
customer_id
project_id
source_inspection_id
source_consultation_id
```

를 같은 체인으로 전달한다.

## 6. project-only 상담

현재 운영 DB의 상담 workflow guard는 `source_project_id`와 `source_inspection_id`를 한 쌍으로 요구한다.

따라서 점검 없이 현장만 선택한 일반 상담은 V1에서:

- `customer_id` 상담이력으로 저장
- `source_project_id/source_inspection_id`는 둘 다 null

로 유지한다.

점검이 있으면 두 값을 함께 저장한다.

## 7. 견적 → 실제 계약 전환

`quotes.status='계약전환'` 또는 `is_contract_quote=true`만 바꾸는 것은 **계약 전환이 아니다.**

실제 계약 전환은 운영 RPC:

```text
transition_quote_to_contract(...)
```

를 사용한다.

전환 시 한 트랜잭션에서 다음이 연결되어야 한다.

- 실제 `contracts` 행
- `project_id`
- `execution_budget_id`
- 견적의 계약 상태

전환 가능한 견적은 `발송완료` 상태여야 한다.

### 현장 선택

1. 견적에 유효한 `project_id`가 있으면 해당 현장을 `link`.
2. 고객 활성 현장이 정확히 1개면 해당 현장을 `link`.
3. 활성 현장이 0개면 `create`.
4. 활성 현장이 2개 이상인데 견적이 특정 현장과 연결되지 않았다면 자동 추정하지 않는다.

기존 현장이 있는데 새 현장을 만들어 중복시키지 않는다.

## 8. 현장 삭제 규칙

`project_id`는 여러 시스템을 연결하는 공통 ID이므로 다음 중 하나라도 연결되면 삭제하지 않는다.

- 계약
- Window Check 점검
- 견적
- Window Lab 상담 source

필요하면 현장 상태를 `보류` 또는 `취소`로 관리한다.

## 9. 앱별 책임

### ERP
- 고객
- 현장 Master
- 견적
- 계약
- 실행예산
- 일정/정산

### Window Check
- 점검
- 실측
- 현장사진
- 품질 기록

### Window Lab
- 상담 설명
- 고객 이해도 향상
- 상담 메모/요약
- 상담이력 저장
- ERP 견적 handoff

각 앱은 다른 앱의 핵심 기능을 중복 구현하지 않는다.

## 10. 금지 규칙

- 앱마다 별도 직원계정 생성 금지
- 계약 전이라는 이유로 project 생성을 일괄 차단 금지
- URL query ID를 서버 검증 없이 신뢰 금지
- 다른 고객의 local draft 재사용 금지
- 점검 source가 없는 project-only 상담에 가짜 inspection ID 생성 금지
- 견적 상태/플래그만 바꾸고 실제 계약이 없는 `계약전환` 생성 금지
- 연결 이력이 있는 project 삭제 금지
- 여러 현장 중 하나를 자동 추정 금지
- ERP/Window Check/Window Lab 중복 견적엔진 생성 금지

## 11. 운영 변경 Gate

이 생명주기에 영향을 주는 변경은 최소한 다음을 확인한다.

1. `customer_id/project_id` 회사 범위 검증
2. 일반 직원 담당 범위
3. 점검/상담/견적 source chain
4. 기존 현장 재사용 여부
5. 중복 project 생성 가능성
6. 연결 현장 삭제 가능성
7. 실제 contract/execution_budget 생성 여부
8. Lint + production build
9. 가능하면 Preview smoke test

운영 DB DDL이 필요한 경우 별도 DB 안전절차를 먼저 따른다.
