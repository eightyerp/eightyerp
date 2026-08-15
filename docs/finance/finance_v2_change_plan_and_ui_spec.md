# 에잇티 ERP Finance V2 변경계획·UI 명세

- 상태: Gate 2 설계안
- 운영 반영: 없음
- 기준: 2026년 7월까지 Excel 이관 실적 + 현행 수금·지출·정산 기능

## 1. 변경 범위 요약

### P0

1. 회사 목표 100억원 복원 구조 및 변경이력
2. 공통 ERP 레이아웃과 페이지 전환속도 개선
3. 수금 검색식 UI, 기초 계약·미수금 이관 구조
4. 지출 사업부·비용성격·상태분리
5. 회사 운영비 등록
6. 관리자 재무 통합 업무함
7. 인테리어 마진 50%, 창호 계약금액 2% 예상 정산
8. 직원 본인 정산 보안
9. 기존 확정 정산 스냅샷 보호
10. 재무 테이블 최소권한

### P1

1. 수금계획·연체 미수금
2. 월마감·대표 승인
3. 사업부·회사공통 손익 자동연결
4. 미분류 비용 업무함
5. Excel 이관 미리보기·승인·롤백
6. 저장 후 부분갱신
7. 데이터 신뢰도

---

# 2. 화면 정보구조

## 2.1 관리자 재무 홈 `/finance`

### 첫 화면 구성

#### A. 오늘 처리할 일

- 수금 확인대기
- 오늘 입금예정
- 연체 미수금
- 지출 승인대기
- 지급대기
- 증빙 미첨부
- 미분류 비용
- 정산완료 현장 사후지출
- 직원 정산 검토대기

#### B. 현금흐름 요약

- 이번 달 매출
- 이번 달 확정 수금
- 이번 달 승인 지출
- 이번 달 실제 지급
- 현재 미수금
- 다음 30일 입금예정
- 다음 30일 지급예정

#### C. 위험 알림

- 미수금 연체
- 계약 초과수금
- 미수금보다 큰 수금
- 사업부 미분류
- 비용성격 미분류
- 증빙 누락
- 정산완료 현장 추가지출
- 현장 적자 전환 가능성

### 이동 버튼

- 수금관리
- 지출등록
- 지출승인
- 직원정산
- 손익·비용
- 데이터 이관

## 2.2 수금관리 `/finance/collections`

### 관리자

상단 카드:

- 총 계약액
- 누적 수금
- 미수금
- 오늘 예정
- 연체
- 확인대기

검색:

```text
고객명 / 현장명 / 계약번호 / 전화번호
```

계약 선택 후 표시:

- 계약금액
- 기초 수금액
- ERP 수금액
- 현재 미수금
- 계약금·중도금·잔금 계획
- 담당직원
- 사업부

수금 등록:

- 수금일
- 수금방법
- 입금자명
- 금액
- 회차 배분
- 메모
- 직원 보고 여부

### 직원

- 본인 담당 계약만 검색
- 카드·현금 직접수금 등록
- 계좌입금은 보고 또는 확인요청
- 확인대기·확정·취소 상태 확인

## 2.3 지출등록 `/finance/payments/new` 또는 기존 페이지 내 탭

### 1단계 지출 구분

- 현장비
- 회사 운영비

### 현장비

1. 현장 검색
2. 사업부 자동추천
3. 공종
4. 비용성격 기본 `직접원가`
5. 거래처
6. 결제수단
7. 공급가·부가세·합계
8. 증빙
9. 지출일·메모

### 운영비

1. 사업부: 창호 / 인테리어 / 회사공통 / 미분류
2. 비용성격: 판매관리비 / 영업외 / 자산 / 세금·금융 / 기타
3. 세부 카테고리
4. 거래처
5. 결제수단
6. 공급가·부가세·합계
7. 증빙
8. 지출일·메모

### 저장 전 요약

```text
인테리어 / 직접원가 / 타일공사
총 2,200,000원
법인카드 · 이미 지급됨
증빙 첨부 완료
관리자 승인 후 잠정 현장손익 반영
```

## 2.4 관리자 지출 업무함 `/finance/approvals`

필터:

- 전체
- 승인대기
- 지급대기
- 증빙보완
- 미분류
- 사후지출
- 고액·위험

빠른 승인카드:

- 등록직원
- 고객·현장 또는 운영비
- 거래처
- 사업부
- 비용성격
- 공종
- 공급가·부가세·합계
- 결제수단
- 승인·지급·증빙·회계상태
- 예상 손익 영향

버튼:

- 승인
- 승인 후 지급완료
- 보완요청
- 반려
- 사업부 변경
- 비용성격 변경
- 상세보기

## 2.5 직원 개인 대시보드 `/dashboard`

### 목표 카드

- 연간 목표 8억원
- 현재 매출
- 달성률
- 남은 목표
- 기준월·출처

### 내 수익·정산 카드

- 현장 기여마진
- 잠정 예상 기본정산금
- 추가 인센티브
- 차감 예정
- 예상 지급액
- 확정 정산금
- 지급완료
- 미지급

#### 인테리어

```text
기여마진 57,162,433원
× 정산율 50%
= 잠정 예상 기본정산금 28,581,216원
```

#### 창호

```text
담당 확정 계약금액 278,800,000원
× 정산율 2%
= 잠정 예상 기본정산금 5,576,000원
```

현재 계약 미연동 시:

> 영업실적 매출 대체계산 · 실제 계약 연동 전

하단 안내:

> 잠정 예상 정산금은 현재 등록된 매출·원가를 기준으로 계산한 값이며 실제 지급액이 아닙니다. 관리자 원가확정, 사후지출, 추가인센티브와 차감에 따라 변경될 수 있습니다.

### 현장별 상세

- 현장명
- 매출
- 승인 직접원가
- 기여마진
- 정산율
- 예상 정산금
- 원가확정률
- 승인대기 지출
- 증빙 누락
- 정산상태

## 2.6 관리자 직원정산 `/finance/settlements`

직원별 요약:

- 매출
- 원가
- 기여마진
- 정산기준
- 기본 예상 정산
- 추가인센티브
- 차감
- 기지급
- 최종 지급예정
- 원가 미확정 현장
- 승인대기 지출
- 증빙 미보완
- 사후지출

단계:

```text
예상 → 검토필요 → 확정 → 지급완료 → 사후조정
```

기능:

- 계산근거 보기
- 보완요청
- 정산 확정
- 지급예정일
- 지급완료
- Excel 출력
- 직원 알림

---

# 3. 변경 예정 기존 파일

## 공통 속도

- `app/layout.tsx`
- 신규 `app/(erp)/layout.tsx`
- 신규 `app/(erp)/loading.tsx`
- `components/dashboard/DashboardLayout.tsx`
- `components/dashboard/TopBar.tsx`
- `components/dashboard/ErpNotificationBell.tsx`
- `lib/crm/access.ts`
- `lib/crm/collections.ts`
- `lib/crm/expenses.ts`
- `lib/crm/settlements.ts`

## 수금

- `app/finance/collections/page.tsx`
- `components/finance/CollectionsWorkspace.tsx`
- `app/actions/collections.ts`
- `lib/crm/collections.ts`
- 신규 `components/finance/CollectionContractSearch.tsx`
- 신규 `components/finance/CollectionSchedulePanel.tsx`
- 신규 `components/finance/CollectionOpeningImport.tsx`

## 지출

- `app/finance/payments/page.tsx`
- `components/finance/ExpenseEntrySearchV3.tsx`
- `components/finance/ExpenseWorkCockpit.tsx`
- `components/finance/MissingExpenseEvidencePanel.tsx`
- `app/actions/expense-simple.ts`
- `app/actions/expense-admin-cockpit.ts`
- `lib/crm/expense-shared.ts`
- `lib/crm/expense-projects.ts`
- `lib/crm/expenses.ts`
- 신규 `components/finance/ExpenseScopeSelector.tsx`
- 신규 `components/finance/ExpenseClassificationFields.tsx`
- 신규 `components/finance/FinanceApprovalInbox.tsx`

## 직원 정산

- `components/dashboard/EmployeeGoalDashboard.tsx`
- `app/finance/settlements/page.tsx`
- `components/finance/SettlementWorkspace2026.tsx`
- `app/actions/settlements.ts`
- `lib/crm/dashboard-settlement.ts`
- `lib/crm/settlements.ts`
- 신규 `lib/crm/settlement-preview.ts`
- 신규 `components/finance/EmployeeSettlementPreviewCard.tsx`
- 신규 `components/finance/EmployeeSettlementDetail.tsx`

## 관리자 대시보드·손익

- `app/dashboard/page.tsx`
- `components/dashboard/AdminDashboardHomeV2.tsx`
- `components/dashboard/MonthlyPnlOverviewV2.tsx`
- `lib/crm/company-pnl.ts`
- `lib/crm/management-analysis.ts`

## 타입

- `types/database.ts`

---

# 4. 신규 DB 객체 예정

- `finance_import_batches`
- `finance_import_rows`
- `collection_schedules`
- `collection_receipt_allocations`
- `collection_opening_balances`
- `expense_classification_events`
- `expense_approval_events`
- `expense_payment_events`
- `employee_settlement_rules`
- `employee_settlement_previews`
- `employee_settlement_snapshots`
- `employee_settlement_approval_events`
- `company_sales_target_revisions`
- `finance_month_closings`

기존 테이블 확장:

- `projects.business_unit`
- `expense_requests.business_unit`
- `expense_requests.cost_nature`
- 지출 승인·지급·증빙·회계 상태

---

# 5. 단계별 개발계획

## Gate 3-A 성능기반

- route layout
- 요청단위 권한 캐시
- 알림 지연조회
- 페이지 Skeleton
- 계약·현장·거래처 검색식 전환
- 전체 refresh 축소

## Gate 3-B 지출 v2

- 사업부·비용성격
- 운영비
- 상태분리
- 감사이력
- 관리자 업무함

## Gate 3-C 직원 정산 Preview

- 정산규칙
- 잠정 계산
- 본인 대시보드
- 관리자 정산 비교
- 확정 원장 불변성 테스트

## Gate 3-D 수금 v2

- 계약 검색
- 기초잔액 Preview
- 수금계획
- 미수금·연체
- 배분

## Gate 3-E 손익·마감

- 지출→손익 연결
- 회사공통비
- 월마감
- 데이터 신뢰도

---

# 6. 완료기준

1. 직원 지출등록 1분 이내
2. 관리자 일반 승인 30초 이내
3. 수금 검색 결과 0.7초 이내 목표
4. 페이지 전환 p95 2초 이내
5. 인테리어 예상 정산 = 양의 기여마진 50%
6. 창호 예상 정산 = 담당 확정계약 2%
7. 확정 정산 자동변경 0건
8. 직원 타인 정산 접근 0건
9. 매출·수금 중복 0건
10. 사후지출 이중차감 0건
11. 사업부 미분류 월마감 차단
12. 운영 DB 변경은 승인 후에만 실행
