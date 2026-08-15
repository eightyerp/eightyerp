# Finance V2 Gate 3 Preview 진행상황

## 구현 완료

### 1. 직원 개인 대시보드
- 인테리어: 현장 기여마진 × 50% 잠정 예상 기본정산
- 창호: 실제 계약 연동 전 영업실적 매출 × 2% 대체계산
- 잠정 기본정산 / 추가인센티브 / 차감 / 예상 지급액 / 지급완료 구분
- 직원 Master 소속팀 기준 사업부 판정 보강
- 실제 지급확정액이 아니라는 안내

### 2. 관리자 Finance V2 손익 Preview
- `/dashboard/finance-preview`
- 영업실적 원장과 내부 손익 원장을 분리
- 매출 → 직접원가 → 현장 기여마진 → 직원정산 → 회사귀속마진 Bridge
- 내부 손익에 이미 포함된 영업인센티브를 다시 차감하지 않도록 명시
- 영업실적 매출과 내부 손익 매출 차이 표시
- 회사공통비 재분류 후보 Preview 추가

### 3. 지출 v2 Preview
- `/finance/payments-preview`
- 현장비 / 회사 운영비 1분 등록 흐름
- 사업부·비용성격 추천
- 승인 / 외부비용 지급 / 증빙 / 손익 영향 구분
- 개인카드·직원현금의 개인 선지급 환급 별도 표시
- 직원 인센티브 정산과 환급을 분리
- 운영 데이터 수정 버튼 비활성화

### 4. 수금 v2 Preview
- `/finance/collections-preview`
- 전체 계약 Select 대신 검색식 구조
- 계약금액 / 기수금 / ERP 수금 / 미수금 / 다음 수금예정 표시안
- 현재 계약 0건 상태에서 기초 계약·수금잔액 이관이 P0임을 표시
- 수금은 매출에 중복 합산하지 않는 원칙 명시

### 5. 재무 통합 업무함 Preview
- `/finance/work-preview`
- 금액·위험 우선순위 업무함
- 정산완료 현장 추가지출
- 수금 확인대기
- 지출 승인대기
- 증빙 미확인
- 기존 계약·미수금 이관 필요
- 현장 한 줄 재무상태: 계약 / 수금 / 미수금 / 승인지출 / 현장마진 / 잠정정산
- 사업부 추천: 견적 → 담당직원 팀 → 미분류

### 6. 속도 개선 1차
- `getCurrentCompanyAccess` 요청 단위 cache
- dashboard / finance loading Skeleton
- 알림 상세목록 lazy load
- 알림벨을 열기 전 고객·수금·지출 3개 상세조회 제거
- 알림 상세 캐시를 sessionStorage에 보관
- 알림벨이 열린 동안에만 주기 새로고침

### 7. 정산 계산 규칙 중앙화
- `lib/crm/settlement-preview-rules.ts`
- 인테리어 50%
- 음수마진 0원
- 창호 2%
- 예상 지급액
- 회사귀속마진
- `scripts/test-finance-v2-rules.ts` 자동 테스트 추가

### 8. DB 후보 설계
- 개인 선지급 환급상태
- 법인카드 부채 / 현금흐름일
- 기초수금잔액 계약당 활성 1건
- 예상 정산 stale / hash
- 회사 목표 revision
- 회사공통비 재분류 조정원장
- 수금배분 RPC 트랜잭션 요구사항

## 운영 기준 재확인

- 2026 회사 매출목표: **100억원 정상**
- 실제 ERP 계약: 0건
- 실제 ERP 수금: 0건
- 실제 ERP 지출: 1건
- 직원 정산 배치: 0건
- 운영 DB 변경: 없음

## 빌드 상태

Vercel Preview는 현재 `build-rate-limit`으로 빌드 시작 전 차단됩니다.

따라서 다음은 아직 미검증입니다.
- TypeScript 전체 검사
- ESLint
- Next.js Production Build
- Preview 실제 화면

운영 Production으로 우회하지 않습니다.

## 다음 구현 순서

1. Vercel 제한 해제 즉시 Build 검증
2. 오류 수정
3. 지출 v2 실제 Preview migration 후보 완성
4. 수금 기초잔액 이관 Preview
5. 관리자 재무업무함 동작 검증
6. 직원·관리자 권한 테스트
7. 성능 전후 측정
8. Gate 4 변경 전후 보고
