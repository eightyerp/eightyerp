# Employee Master 병합 운영 GO 체크리스트

## 1. 애플리케이션 릴리스 검증

- [x] Employee merge safety test 통과
- [x] TypeScript 검사 통과
- [x] ESLint 검사 통과
- [x] Next.js Production Build 통과
- [x] Google Fonts 원격 빌드 의존성 제거
- [x] 병합 미리보기 구현
- [x] 병합 완료 보고서 구현
- [x] 병합 RPC 단일 트랜잭션 및 전후 합계 검증
- [x] 복합 `employees.id` FK 발견 시 RPC 자동 중단
- [ ] 30분 취소 — 다음 버전
- [ ] 병합 로그 화면 — 다음 버전
- [ ] 롤백 UI — 다음 버전

## 2. 운영 DB 실행 순서

1. `supabase/verifications/20260805000001_employee_merge_preflight.sql` 실행
2. 복합 FK와 고아 참조 결과가 0건인지 확인
3. `supabase/migrations/20260805000001_employee_merge.sql` 적용
4. `supabase/verifications/20260805000001_employee_merge_verify.sql` 실행
5. `supabase/verifications/20260805000002_employee_merge_operational_verify.sql` 실행

## 3. 최종 GO 판정

다음 조건을 모두 만족할 때만 운영 배포한다.

- [ ] Operational Verify 첫 결과의 `employee_merge_go = true`
- [ ] `unsupported_composite_fks = 0`
- [ ] 모든 FK 행의 `coverage`가 `COVERED_`로 시작
- [ ] 자기 병합 직원 조회 결과 0건
- [ ] 병합 후 활성 상태로 남은 source 직원 조회 결과 0건
- [ ] 병합 로그의 이전 전후 합계 불일치 조회 결과 0건
- [ ] 운영 Verify 실행 중 오류 없음

하나라도 만족하지 않으면 마이그레이션 이후 추가 병합을 실행하지 않고 NO-GO로 중단한다.

## 4. 배포 후 Smoke Test

- [ ] 관리자 계정으로 직원 Master 진입
- [ ] 병합 버튼과 영향 분석 화면 확인
- [ ] 서로 다른 직원 선택 시 전체 참조 목록 표시 확인
- [ ] 양쪽 로그인 연결 시 유지 계정 선택 강제 확인
- [ ] 운영 실제 병합은 승인된 테스트 대상 1쌍에 한해 수행
- [ ] 완료 보고서의 로그 ID, 이전 건수, 전후 합계 일치 확인
- [ ] 고객·견적·일정 담당자 목록에서 병합된 직원 제외 확인

