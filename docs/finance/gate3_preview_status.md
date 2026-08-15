# Finance V2 Gate 3 Preview 진행상황

## 현재 구현

- 직원 개인 대시보드: 인테리어 기여마진 50%, 창호 영업실적 매출 2% 잠정 정산
- 관리자 손익 Bridge: 매출 → 직접원가 → 현장마진 → 직원정산 → 회사귀속마진
- 내부 손익과 영업실적 원장을 별도 트랙으로 표시
- 회사공통비 재분류 후보 Preview
- 지출 v2 Preview: 현장비/운영비, 사업부·비용성격, 승인·지급·증빙·손익 영향
- 개인카드/현금: 외부비용 지급과 직원 환급 분리
- 수금 v2 Preview: 계약 검색, 기수금, 미수금, 수금계획 구조
- 관리자 재무 통합 업무함 Preview: 금액·위험 우선순위
- 현장 한 줄 재무상태: 계약/수금/미수금/승인지출/마진/정산
- 속도 1차: 회사역할 요청 cache, loading Skeleton, 알림 상세 lazy load
- 정산 계산 규칙 중앙화 및 자동 테스트 스크립트
- Gate 3 DB migration 후보 addendum

## 운영 기준

- 2026 회사 목표: 100억원 정상
- ERP 계약: 0건
- ERP 수금: 0건
- ERP 지출: 1건
- 직원 정산 배치: 0건
- 운영 DB 변경: 없음
- main 병합: 없음
- Production 배포: 없음

## 아직 검증되지 않은 항목

Vercel Preview가 `build-rate-limit`으로 차단되어 아래는 아직 실행되지 않았다.

- TypeScript 전체 검사
- ESLint
- Next.js Production Build
- `npm run test:finance-v2`
- Preview 실제 브라우저 화면
- p50/p95 성능 측정

Production으로 우회하지 않는다.

## 회사공통비 기준

내부 손익 원본의 대표급여, 사무실, 경영지원 인건비, 공통 전산/관리비, 공통 광고, 공통 차량·법인카드 등은 회사공통 후보로 검토한다. 사업부 전용 급여·광고·차량은 각 사업부에 유지한다. 세부금액은 임의로 재배분하지 않고 원본 line-item을 이관한 뒤 조정원장에서 승인한다. 회사공통비는 직원 예상 정산마진에서 차감하지 않는다.

## 다음

1. Vercel 제한 해제 즉시 Build + `test:finance-v2`
2. 컴파일·타입 오류 수정
3. 실제 지출 v2 migration 후보/RPC v3
4. 수금 기초잔액 이관 Preview/RPC
5. RLS 행동 테스트
6. 성능 전후 측정
7. Gate 4 보고
