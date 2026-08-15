# Eighty ERP 운영환경 및 DB 변경 안전 절차

최종 확인: 2026-08-16 KST

## 운영 Source of Truth

- GitHub: `eightyerp/eightyerp`
- 운영 기준 브랜치: `main`
- Supabase 운영 프로젝트: `eighty-erp`
- Supabase 운영 project ref: `zhihbyarqpkudqyomcxv`
- 별도 Supabase 프로젝트 `bnscmhkrjruguwfbutnm`은 현재 운영 API 트래픽이 확인되지 않았으므로 운영 대상으로 간주하지 않는다.
- Vercel 배포 상태는 GitHub commit status의 `Vercel` check와 운영 프로젝트를 함께 확인한다.

> 프로젝트 ref, 브랜치, commit SHA가 확인되지 않은 상태에서는 운영 DB 변경을 실행하지 않는다.

## 현재 확인된 Migration Drift

2026-08-16 점검 기준 운영 `supabase_migrations.schema_migrations`에는 2026-08-11 이후 migration 19건만 기록되어 있다.

반면 저장소에는 2026-07-16부터의 migration 파일이 존재한다. 따라서 과거 migration 일부는 원격 DB에 수동 적용되었거나 migration ledger와 실제 스키마가 어긋난 상태일 수 있다.

확인된 예:

- 앱 코드가 `public.employee_tasks`를 조회하지만 운영 DB에는 테이블이 없다.
- 구형 `20260729000001_employee_tasks.sql`은 현재보다 오래된 권한 함수를 함께 재정의하므로 그대로 재실행하면 안 된다.
- `20260806000001_interior_quote_excel_import.sql`의 `interior_quote_imports`/RPC는 현재 운영 DB에 없지만, 최신 앱 저장 경로는 공통 `createQuote()` 방식으로 리팩터링되어 있어 런타임 필요 여부를 코드 기준으로 따로 판단해야 한다.

## 금지 사항

아래 작업은 drift 정리 전 운영에서 실행하지 않는다.

- `supabase db push`를 사전 비교 없이 실행
- 과거 migration 파일 전체 재실행
- migration ledger만 보고 실제 스키마 존재 여부를 추정
- 운영 SQL Editor에서 임의 DDL 적용
- 다른 Supabase 프로젝트 ref에 동일 migration 적용
- 운영 `main`에 DB 의존 코드를 먼저 병합한 뒤 나중에 migration 적용

## DB 변경 기본 순서

1. 최신 `main`에서 별도 작업 브랜치를 만든다.
2. 필요한 앱 코드와 신규 migration을 같은 PR 범위에서 검토한다.
3. 운영 DB는 우선 read-only로 실제 테이블/컬럼/RPC/RLS/인덱스를 확인한다.
4. 과거 migration 재실행 대신 **현재 운영 스키마 기준의 forward repair migration**을 만든다.
5. `npm run test:migration-sql -- <migration.sql>`로 파괴적 SQL과 기본 문법 구조를 사전 점검한다.
6. TypeScript / ESLint / Next.js production build와 Preview 배포를 통과시킨다.
7. 운영 DB 변경 전 프로젝트 ref `zhihbyarqpkudqyomcxv`를 다시 확인한다.
8. 대표 최종 승인 후 migration만 먼저 적용한다.
9. 적용 직후 테이블/컬럼/RPC/RLS/인덱스와 핵심 read/write를 검증한다.
10. 앱 PR을 `main`에 병합하고 Production 배포 후 Smoke Test를 실행한다.
11. 실패 시 앱 병합을 중단하고 DB 변경의 롤백/forward-fix 여부를 판단한다.

## 필수 Smoke Test

- 로그인
- 대시보드
- 고객 목록 / 상세 / 등록 / 수정
- 창호 견적 작성 / 저장 / PDF
- 인테리어 Excel 가져오기 / 원본파일 연결 / 재시도
- 견적 목록 / 상세
- 일정
- 직원관리 / 활성·비활성
- 권한별 접근
- 다른 회사 데이터 비노출

## 운영 DB 변경 승인 기준

다음 조건을 모두 충족할 때만 운영 migration 적용을 요청한다.

- 작업 브랜치가 최신 `main` 기준
- 변경 SQL에 `DROP TABLE`, `TRUNCATE`, 무승인 `DELETE`, `DROP COLUMN` 없음
- 현재 운영 스키마와의 차이 확인 완료
- 신규/변경 RLS 검토 완료
- 멀티회사 격리 검토 완료
- Preview build PASS
- 적용 후 검증 SQL 준비 완료
- 운영 DB 대상 project ref 재확인 완료
