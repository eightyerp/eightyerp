# Finance V2 Gate 2 설계 검토 결정사항

- 상태: Gate 2 설계 확정 전 검토결과
- 운영 DB: 미적용
- 목적: migration 초안을 Gate 3 실제 구현으로 전환할 때 빠뜨리기 쉬운 회계·사용성·데이터 무결성 사항을 고정한다.

## 1. 직원 개인카드·현금 사용은 ‘비용 지급’과 ‘직원 환급’을 분리한다

개인카드·현금은 거래처에는 이미 지급됐지만 회사는 직원에게 아직 갚지 않았을 수 있다.

따라서 `payment_status`만으로 처리하지 않는다.

추가 필드:

- `paid_by_party`: `company`, `employee`, `customer`, `other`
- `reimbursement_status`: `not_applicable`, `payable`, `approved`, `paid`, `waived`
- `reimbursement_employee_id`
- `reimbursement_due_date`
- `reimbursed_at`

기본값:

| 결제수단 | 외부비용 지급 | 회사의 직원 환급 |
|---|---|---|
| 법인카드 | paid | not_applicable |
| 회사 계좌이체 | paid 또는 unpaid | not_applicable |
| 직원 개인카드 | paid | payable |
| 직원 현금 | paid | payable |
| 관리자 현금 | paid | not_applicable |

직원 대시보드에는 다음을 별도 표시한다.

- 회사에 청구한 개인 선지급
- 환급 승인액
- 환급 지급완료액
- 미환급액

직원 정산 인센티브와 개인 선지급 환급을 같은 금액으로 합치지 않는다.

## 2. 법인카드는 비용발생과 현금유출 시점이 다를 수 있다

법인카드 사용 시 비용은 사용일 기준으로 발생하지만 현금유출은 카드대금 결제일에 발생한다.

추가 권장 필드:

- `liability_type`: `none`, `corporate_card_payable`, `employee_reimbursement`, `vendor_payable`
- `liability_due_date`
- `cashflow_date`

손익은 비용 인식일, 현금흐름은 실제 결제일을 사용한다.

## 3. 기초 수금잔액은 계약당 활성값 1건만 허용한다

초기 draft의 `(계약, 기준일)` 활성 unique는 여러 기준일의 활성잔액이 동시에 존재할 수 있다.

Gate 3 실제 migration에서는 다음으로 변경한다.

```sql
create unique index ...
on collection_opening_balances(company_id, contract_id)
where is_active;
```

새 기준일 잔액을 승인하면 이전 활성값은 삭제하지 않고 `is_active=false` 처리한다.

## 4. 수금 배분은 반드시 단일 RPC 트랜잭션으로 처리한다

다음 검증을 한 트랜잭션에서 수행한다.

- 수금액 초과 배분 금지
- 회차 예정금액 초과 배분 경고 또는 예외승인
- 다른 계약 회차로 배분 금지
- 취소 수금 배분 금지
- 배분 후 회차상태 자동 갱신
- 계약 received/outstanding 누계 재계산

클라이언트가 allocation 테이블에 직접 INSERT하지 않도록 한다.

## 5. 직원 예상 정산 Preview는 재계산 가능한 캐시이며 공식 원장이 아니다

추가 필드:

- `calculation_hash`
- `source_revision`
- `stale_at`
- `recalculation_reason`

원천 매출·원가·지출·사후조정이 바뀌면 Preview를 stale 처리하고 재계산한다.

확정 정산은 반드시 snapshot으로 복사한 뒤 원천자료 변경과 분리한다.

## 6. 직원 정산의 기지급액 범위를 명확히 한다

기지급액에는 해당 정산기간에 연결된 실제 지급만 포함한다.

- 과거 다른 월 지급액을 무조건 누적 차감하지 않음
- 선지급금은 별도 adjustment 또는 advance 원장으로 관리
- 개인카드 환급은 직원 인센티브 정산과 분리

## 7. 회사 목표는 활성 revision 1건만 허용한다

Gate 3 실제 migration에 다음 partial unique를 추가한다.

```sql
create unique index ...
on company_sales_target_revisions(company_id, target_year)
where status = 'active';
```

목표 변경 순서:

```text
draft → approved → active
기존 active → superseded
```

100억원 복원은 변경사유와 승인자를 남긴다.

## 8. 회사공통비 재분류는 별도 조정원장으로 관리한다

2026년 1~7월 창호 비용 블록의 본사성 비용을 바로 덮어쓰지 않는다.

권장 구조:

- 원본 Excel 분류 보존
- `pnl_classification_adjustments`에 창호→회사공통 조정 기록
- 변경 전·후 손익 비교
- 대표 승인 후 공식 View에 반영

## 9. 미분류 비용은 손익에서 숨기지 않는다

공식 사업부 손익에는 넣지 않더라도 다음을 별도 표시한다.

- 미분류 비용 총액
- 전체 비용 대비 비중
- 월마감 차단 여부
- 가장 오래된 미분류 건

AI는 미분류 비용이 있으면 수익성을 확정적으로 단정하지 않는다.

## 10. 월마감 후 수정은 adjustment 방식으로 처리한다

마감월 원본행을 직접 수정하지 않는다.

- 마감 전: 일반 수정 가능, 이력 저장
- 마감 후: 재오픈 승인 또는 조정행 추가
- 대표 승인 완료 후: 공식 손익 View 반영

## 11. RLS는 신규 테이블 전체에 완성된 정책이 있어야 migration 승인 가능

현재 Gate 2 draft의 일부 정책은 예시 수준이다. Gate 3 실제 migration은 다음 전 테이블에 정책을 갖춰야 한다.

- 지출 분류·승인·지급 이벤트
- 수금계획·배분·기초잔액
- 이관 배치·행
- 정산규칙·Preview·Snapshot·승인이력
- 목표 변경이력
- 월마감

정책 없는 RLS 테이블이 1개라도 있으면 migration을 승인하지 않는다.

## 12. 성능개선은 route 이동보다 공통 데이터 중복조회부터 해결한다

Gate 3 우선순위:

1. 요청단위 회사·역할·직원정보 cache
2. 알림목록 lazy load
3. 검색식 계약·현장·거래처
4. 저장 후 전체 refresh 제거
5. Skeleton
6. 공통 route layout

route group 전환 시 대규모 파일 이동은 기능변경과 분리해 별도 커밋으로 진행한다.

## 13. 실제 migration 반영 전 수정해야 할 draft 항목

- 직원 환급상태 추가
- 법인카드 부채·현금흐름일 추가 검토
- 기초잔액 active unique 수정
- 정산 Preview stale/hash 추가
- 목표 active unique 추가
- 신규 테이블 전체 RLS 완성
- 수금 배분 RPC
- 지출 등록 RPC v3
- 운영비 등록 정책
- 회사공통 재분류 조정원장

Gate 2 draft SQL은 설계 초안이며 그대로 운영 적용하지 않는다.
