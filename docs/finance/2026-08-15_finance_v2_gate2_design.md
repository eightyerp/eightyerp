# 에잇티 ERP 수금·지출·직원정산·속도 개선 — Gate 2 설계

- 작성일: 2026-08-15
- 기준 브랜치: `main`
- 기준 운영 커밋: `2ace1df7b83c9f1c558314b867f572b9c6c15aea`
- 설계 브랜치: `agent/finance-v2-gate2-design`
- 상태: **설계 초안 / 운영 DB 미적용 / Production 미배포**

## 1. 목표

에잇티 ERP의 재무 흐름을 다음처럼 연결한다.

```text
계약·기초잔액
→ 수금계획
→ 실제 수금
→ 미수금·연체관리
→ 직원 지출등록
→ 관리자 승인·지급·증빙보완
→ 현장·사업부·회사공통 손익
→ 직원 예상 정산
→ 정산 확정·지급
→ 월마감·경영 대시보드
```

핵심 사용성 목표는 다음과 같다.

- 직원 수금·지출등록: 모바일 기준 1분 이내
- 일반 승인건 관리자 처리: 30초 이내
- 주요 페이지 클릭 후 로딩 피드백: 0.2초 이내
- 주요 페이지 체감 전환: 1.5초 이내 목표
- 인테리어 예상 정산: 최종 기여마진의 50%
- 창호 예상 정산: 담당 계약금액의 2%
- 확정·지급된 정산은 예상값 변경으로 덮어쓰지 않음

## 2. 현재 운영 기준점

### 2.1 데이터 상태

- 창호·인테리어 영업실적: 2026년 7월까지 Excel 이관
- 실제 ERP 계약: 현재 0건
- 실제 ERP 수금: 현재 0건
- 실제 ERP 지출: 1건, 9,000원
- 직원 정산 배치·상세: 현재 0건
- 회사 목표: 대표 확정 기준 100억원이나 운영 DB 값은 현재 50억원

### 2.2 현재 구조의 주요 한계

1. 수금은 확정 계약이 있어야 등록되나 기존 계약이 이관되지 않았다.
2. 지출 화면과 RPC는 현장비만 정상 입력 가능하며 회사 운영비 입력이 막혀 있다.
3. 지출에 사업부·비용성격·회계반영 상태가 없다.
4. 승인상태와 지급상태가 하나의 `status`에 결합돼 있다.
5. 직원 예상 정산 자동계산 원장이 없다.
6. 회사공통비가 창호 비용 블록에 포함돼 순수 창호 손익과 본사비가 혼재한다.
7. 공통 레이아웃·권한·알림 데이터가 페이지 이동마다 반복 조회될 가능성이 있다.

## 3. 설계 원칙

1. 기존 운영자료를 삭제하지 않는다.
2. 기존 `status` 컬럼과 RPC를 즉시 제거하지 않는다.
3. 신규 컬럼을 추가하고 호환기간을 둔 뒤 단계적으로 전환한다.
4. `ERP 자동 > 관리자 수기 > Excel 이관` 우선순위를 유지한다.
5. 예상값과 확정값을 별도 원장으로 분리한다.
6. 수금은 매출이 아니며 현금흐름 원장으로 관리한다.
7. 회사공통비는 공식 사업부 손익에 임의 배분하지 않는다.
8. 직원은 본인 실적·정산·담당 고객만 조회한다.
9. 운영 DB 적용, main 병합, Production 배포는 별도 승인 후 수행한다.

---

# A. 수금관리 설계

## A-1. 기존 계약 및 기초 미수금 이관

기존 실적을 가짜 신규 수금으로 등록하지 않는다. 다음 구조를 추가한다.

### `finance_import_batches`

- `id`
- `company_id`
- `import_type`: `contracts_opening`, `collections_opening`, `expenses_opening`, `settlements_opening`
- `source_name`
- `source_cutoff_date`
- `file_hash`
- `status`: `analyzed`, `review_required`, `approved`, `applied`, `rolled_back`
- `row_count`
- `total_amount`
- `created_by`, `approved_by`
- `created_at`, `approved_at`

### `finance_import_rows`

- 원본 행 JSON
- 고객·현장·직원·사업부 매핑 결과
- 중복 여부
- 오류·경고
- 적용된 대상 ID
- 롤백 상태

### `collection_opening_balances`

- 계약별 기준일 현재 기수금액
- 기준일 현재 미수금
- 원본 출처 및 이관 배치
- 공식 수금내역과 별도 집계

## A-2. 수금계획

### `collection_schedules`

- `contract_id`
- `schedule_type`: `deposit`, `interim_1`, `interim_2`, `balance`, `other`
- `planned_date`
- `planned_amount`
- `status`: `planned`, `partial`, `received`, `overdue`, `cancelled`
- `sequence_no`
- `memo`

### `collection_receipt_allocations`

한 건의 실제 수금이 여러 예정회차에 배분될 수 있도록 한다.

- `receipt_id`
- `schedule_id`
- `allocated_amount`

## A-3. 수금 화면

기존 전체 계약 셀렉트박스를 제거하고 검색식으로 바꾼다.

```text
고객명 / 현장명 / 계약번호 / 전화번호 검색
→ 계약 선택
→ 계약금액·기수금·미수금·다음 예정금 확인
→ 금액·수금방법·입금자명 입력
```

관리자 업무함:

- 오늘·이번주 입금예정
- 연체 미수금
- 직원 등록 확인대기
- 입금자명 불일치
- 미수금보다 큰 수금
- 계약금액 초과
- 배분되지 않은 수금

## A-4. 수금 상태와 손익

- 수금은 손익 매출을 직접 증가시키지 않는다.
- 수금 확정 시 계약의 `received_amount`, `outstanding_amount`만 갱신한다.
- 대시보드에 `매출 / 수금 / 미수금 / 현금유입`을 별도 표시한다.

---

# B. 지출관리 설계

## B-1. 사업부 및 비용성격

### 사업부 `business_unit`

- `window`
- `interior`
- `common`
- `unclassified`

### 비용성격 `cost_nature`

- `direct_cost`
- `sga`
- `non_operating`
- `asset`
- `tax_finance`
- `other`

### 분류상태 `classification_status`

- `unclassified`
- `review_required`
- `ready`
- `posted`
- `closed`

미분류 비용은 저장할 수 있지만 월마감 전 반드시 검토한다.

## B-2. 승인·지급·증빙·회계 상태 분리

기존 `status`는 호환용으로 유지하고 아래 상태를 추가한다.

### `approval_status`

- `pending`
- `approved`
- `rejected`
- `cancelled`

### `payment_status`

- `unpaid`
- `paid`
- `partially_refunded`
- `refunded`

### `evidence_status`

- `missing`
- `attached`
- `tax_reviewed`
- `complete`

### `accounting_status`

- `unclassified`
- `review_required`
- `ready`
- `posted`
- `closed`

## B-3. 결제수단별 기본값

| 결제수단 | 승인상태 | 지급상태 | 증빙상태 |
|---|---|---|---|
| 직원 법인카드 | pending | paid | missing 또는 attached |
| 관리자 법인카드 직접입력 | approved | paid | missing 또는 attached |
| 계좌이체 요청 | pending | unpaid | attached 권장 |
| 개인카드 | pending | paid | attached 권장 |
| 직원 현금사용 | pending | paid | attached 권장 |
| 관리자 현금 직접입력 | approved | paid | missing 허용 |

## B-4. 현장비와 운영비

현행 제약조건을 다음 논리로 교체한다.

```text
(expense_scope = project AND project_id IS NOT NULL)
OR
(expense_scope = operating AND project_id IS NULL)
```

- 현장비: 현장 선택 필수, 직접원가 기본 추천
- 운영비: 현장 선택 없음, 판관비 기본 추천
- 현장 선택 시 사업부 자동추천
- 자동추천이 불명확하면 `unclassified`

## B-5. 사업부 추천 근거

프로젝트에 `business_unit`을 추가한다.

허용값:

- `window`
- `interior`
- `mixed`
- `unclassified`

초기 추천 순서:

1. 프로젝트 Master의 사업부
2. 연결된 확정 계약 또는 최신 견적의 `quote_type`
3. 담당직원의 소속팀
4. 판단 불가 시 `unclassified`

혼합현장은 지출별로 창호·인테리어를 직접 선택한다.

## B-6. 감사이력

### `expense_classification_events`

- 변경 전·후 사업부
- 변경 전·후 비용성격
- 변경사유
- 변경자·변경시각

### `expense_approval_events`

- 승인·반려·보완요청·취소
- 사유·처리자·처리시각

### `expense_payment_events`

- 지급·환불·부분환불
- 금액·결제수단·처리자·처리시각

## B-7. 손익반영 규칙

### 직접원가

```text
approval_status = approved
AND business_unit 확정
AND cost_nature = direct_cost
→ 현장 잠정손익 반영

월마감 완료
→ 확정손익 반영
```

### 판매관리비

```text
business_unit 확정
AND cost_nature = sga
AND accounting_status in (posted, closed)
→ 사업부 또는 회사공통 판관비 반영
```

법인카드는 지급완료 상태여도 분류 전에는 잠정비용으로 표시한다.

---

# C. 직원 정산 설계

## C-1. 정산규칙

### `employee_settlement_rules`

- `employee_id` nullable: 직원별 규칙 없으면 사업부 기본규칙 사용
- `business_unit`
- `basis_type`: `contribution_margin`, `contract_amount`, `manual`
- `rate`
- `effective_from`, `effective_to`
- `is_active`
- `approved_by`, `approved_at`

초기 기본규칙:

| 사업부 | 기준 | 비율 |
|---|---|---:|
| 인테리어 | 현장 최종 기여마진 | 50% |
| 창호 | 담당 계약금액 | 2% |

## C-2. 예상 정산

### `employee_settlement_previews`

예상값은 확정 원장을 덮어쓰지 않는다.

- `employee_id`
- `settlement_year`, `settlement_month`
- `basis_type`
- `basis_amount`
- `rate`
- `base_preview_amount`
- `additional_incentive_amount`
- `deduction_amount`
- `paid_amount`
- `expected_payable_amount`
- `calculation_source`
- `calculation_status`: `provisional`, `review_required`, `ready`
- `source_cutoff_date`
- `data_quality_status`

계산식:

```text
인테리어 기본 예상 정산금
= FLOOR(MAX(현장 최종 기여마진, 0) × 0.5)

창호 기본 예상 정산금
= FLOOR(담당 계약금액 × 0.02)

예상 지급액
= 기본 예상 정산금
+ 추가 인센티브
- 차감액
- 기지급액
```

## C-3. 확정·지급 스냅샷

기존 `employee_settlement_batches`는 확정·지급 원장으로 유지한다.

추가 테이블:

### `employee_settlement_snapshots`

- 확정 당시 매출·원가·마진·정산율·지급액
- 사용한 자료출처 및 기준일
- 원가확정률
- 승인대기 지출수
- 증빙 미보완수
- 사후지출수
- 계산 JSON 스냅샷

### `employee_settlement_approval_events`

- 검토·확정·지급·사후조정 이력

## C-4. 현재 자료의 제한

현재 2026년 자료는 직원별 월간 Excel 집계다.

- 인테리어 예상 정산은 `직원별 집계마진 × 50%`를 잠정값으로 표시한다.
- 창호는 실제 ERP 계약이 0건이므로 `영업실적 매출 × 2%`를 임시 대체값으로 표시한다.
- 화면에는 반드시 `Excel 이관 실적 기준 잠정값 / 실제 계약·현장원가 연동 전`을 표시한다.

---

# D. 관리자 재무 통합 업무함

## D-1. 상단 요약

- 수금 확인대기
- 오늘 입금예정
- 연체 미수금
- 지출 승인대기
- 지급대기
- 증빙 미첨부
- 사업부·비용성격 미분류
- 사후지출
- 정산 검토대기

## D-2. 빠른 승인카드

필수 표시:

- 등록직원
- 고객·현장
- 거래처
- 공종
- 사업부
- 비용성격
- 금액
- 결제수단
- 승인·지급·증빙상태
- 정산완료 현장 여부
- 승인 후 손익 영향

기능:

- 승인
- 지급완료
- 보완요청
- 반려
- 사업부 변경
- 비용성격 변경
- 상세보기

## D-3. 자동 상세검토 전환

다음 건은 원클릭 승인에서 제외한다.

- 현장 적자 전환 예상
- 정산완료 현장
- 증빙 중복 의심
- 신규·미승인 거래처
- 미분류 비용
- 개인카드·현금
- 관리자 설정 금액 이상
- 계약 초과 수금
- 사후지출 차감

---

# E. 페이지 이동속도 설계

## E-1. 공통 레이아웃 유지

현재 각 페이지 내부에서 `DashboardLayout`을 다시 렌더링한다. Gate 3에서 URL 변경 없이 route group을 도입한다.

```text
app/(erp)/layout.tsx
  ├─ Sidebar
  ├─ TopBar
  └─ children
```

사이드바·상단바·회사정보를 페이지 이동 중 유지한다.

## E-2. 요청 단위 권한 캐시

다음 함수는 React `cache()` 또는 요청 컨텍스트로 통합한다.

- `getCurrentCompanyAccess`
- `getExpenseAccess`
- `getCollectionAccess`
- `getSettlementAccess`

한 요청에서 동일한 회사·역할·직원정보를 반복 RPC 호출하지 않는다.

## E-3. 알림 최적화

- 초기 화면에서 고객·수금·지출 알림 3개 전체조회 제거
- 미읽음 개수는 단일 경량 RPC
- 상세목록은 알림벨을 처음 열 때 조회
- 페이지 이동 시 30초 폴링 재시작 방지

## E-4. 데이터조회 최적화

- 계약·현장·거래처 전체목록 대신 서버 검색
- 목록 기본 20~50건
- 서버 페이지네이션
- 필요한 컬럼만 조회
- 저장 후 전체 `router.refresh()` 최소화
- 변경행과 요약카드만 갱신

## E-5. 로딩 UX

추가 대상:

- `app/(erp)/loading.tsx`
- 수금관리 Skeleton
- 지출관리 Skeleton
- 정산관리 Skeleton
- 대시보드·고객·견적 목록 Skeleton

클릭 후 0.2초 이내 진행상태를 표시한다.

---

# F. 회사목표 및 데이터 거버넌스

## F-1. 회사 목표

운영 DB의 2026년 목표는 현재 50억원이며 대표 확정 목표는 100억원이다.

Gate 3 Preview에서는 100억원을 기본값으로 보여주되, 운영 DB 수정은 별도 승인 후 수행한다.

추가 설계:

### `company_sales_target_revisions`

- 변경 전·후 금액
- 변경사유
- 상태: `draft`, `approved`, `active`, `superseded`
- 변경자·승인자·변경일

## F-2. 월마감

### `finance_month_closings`

- `year`, `month`
- `status`: `draft`, `review`, `closed`, `reopened`, `approved`
- 매출·수금·지출·정산 마감상태
- 검증결과 JSON
- 마감자·승인자

마감 후 변경은 기존값 덮어쓰기가 아니라 조정이력으로 남긴다.

---

# G. RLS 및 최소권한

1. 직원은 본인 수금·지출·정산만 조회한다.
2. 관리자만 회사 전체 재무 업무함과 손익을 조회한다.
3. 신규 View는 `security_invoker=true`를 사용한다.
4. Server Action·RPC 내부에서 역할을 재검증한다.
5. `authenticated`에 불필요한 `TRUNCATE`, `TRIGGER`, `REFERENCES` 권한을 회수한다.
6. 익명 사용자의 재무 테이블 접근을 차단한다.
7. 사업부 변경·정산확정은 감사이력을 필수로 남긴다.

---

# H. Gate 3 개발 단위

## H-1. 1차 Preview 범위

1. 공통 레이아웃·권한 캐시·알림 지연조회
2. 지출 사업부·비용성격·상태분리
3. 운영비 등록
4. 관리자 재무 업무함 v1
5. 직원 예상 정산카드
6. 수금 검색식 UI와 기초잔액 이관 Preview
7. 로딩 Skeleton과 저장 후 부분 갱신

## H-2. 2차 Preview 범위

1. 수금계획·연체 미수금
2. 월마감
3. 직원 정산 스냅샷·승인흐름
4. 사업부·공통비 손익 자동연결
5. Excel 이관 승인·롤백 UI

## H-3. 운영 반영 금지선

다음은 대표 승인 전 실행하지 않는다.

- 운영 목표 50억 → 100억 변경
- 운영 DB migration 적용
- 기존 비용의 사업부 소급 재분류
- 과거 계약·수금·정산 대량 이관
- main 병합
- Production 배포
