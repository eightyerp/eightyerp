# Eighty ERP 운영환경 및 DB 변경 안전 절차

최종 확인: 2026-08-16 21:06 KST

## 운영 Source of Truth

- GitHub: `eightyerp/eightyerp`
- 운영 기준 브랜치: `main`
- Supabase 운영 프로젝트: `eighty-erp`
- Supabase 운영 project ref: `zhihbyarqpkudqyomcxv`
- 별도 Supabase 프로젝트 `bnscmhkrjruguwfbutnm`은 현재 운영 API 트래픽이 확인되지 않았으므로 운영 대상으로 간주하지 않는다.
- Vercel 배포 상태는 GitHub commit status의 `Vercel` check와 운영 프로젝트를 함께 확인한다.
- ERP 기능/PR/모듈 기준은 `docs/ERP_MASTER_BASELINE.md`를 우선 확인한다.

> 프로젝트 ref, 브랜치, commit SHA가 확인되지 않은 상태에서는 운영 DB 변경을 실행하지 않는다.

## 현재 확인된 Migration Drift

2026-08-16 21:06 KST 점검 기준 운영 `supabase_migrations.schema_migrations`에는 21건이 기록되어 있고 최신 기록은 `20260816031425` / `window_inspection_workflow_hub`이다.

저장소에는 2026-07-16부터의 migration 파일이 존재하므로 **저장소 파일 개수/파일명과 운영 migration ledger가 1:1로 일치한다고 가정하면 안 된다.** 과거 일부 변경은 수동 적용, repair migration, remote apply 시점의 ledger 기록 등으로 실제 스키마와 파일명이 다를 수 있다.

현재 실제 운영 스키마 확인 예:

- `public.employee_tasks`는 운영 DB에 **존재한다**. 2026-08-15~16의 `employee_tasks_schema_repair`로 현재 멀티회사 모델에 맞게 복구되었다.
- 과거 `20260729000001_employee_tasks.sql`은 구형 권한 함수를 포함하므로 현재 운영에 그대로 재실행하면 안 된다.
- `public.interior_quote_imports`는 현재 운영 DB에 없지만 최신 인테리어 Excel 저장 경로는 공통 `createQuote()` 방식으로 리팩터링되어 있어 전용 import 테이블의 부재를 곧바로 런타임 오류로 판단하지 않는다.
- Window Check/Window Lab handoff를 위한 `window_inspections` 및 source ID 체인은 운영 DB에 적용되어 있다.

따라서 과거 운영문서, migration 파일, UI의 `준비중` 문구 중 하나만 보고 개발/미개발 상태를 판단하지 않는다. **최신 main 코드 + 실제 운영 스키마 + migration ledger를 함께 확인한다.**

## 금지 사항

아래 작업은 drift 정리/검증 없이 운영에서 실행하지 않는다.

- `supabase db push`를 사전 비교 없이 실행
- 과거 migration 파일 전체 재실행
- migration ledger만 보고 실제 스키마 존재 여부를 추정
- 운영 SQL Editor에서 임의 DDL 적용
- 다른 Supabase 프로젝트 ref에 동일 migration 적용
- 운영 `main`에 DB 의존 코드를 먼저 병합한 뒤 나중에 migration 적용
- 오래된 대형 PR의 migration을 최신 main 검토 없이 일괄 적용

## DB 변경 기본 순서

1. 최신 `main`에서 별도 작업 브랜치를 만든다.
2. `docs/ERP_MASTER_BASELINE.md`에서 기존 기능/중복/선행 PR을 확인한다.
3. 필요한 앱 코드와 신규 migration을 같은 Gate 범위에서 검토한다.
4. 운영 DB는 우선 read-only로 실제 테이블/컬럼/RPC/RLS/인덱스를 확인한다.
5. 과거 migration 재실행 대신 **현재 운영 스키마 기준의 forward repair migration**을 만든다.
6. `npm run test:migration-sql -- <migration.sql>`로 파괴적 SQL과 기본 문법 구조를 사전 점검한다.
7. TypeScript / ESLint / Next.js production build와 Preview 또는 독립 CI를 통과시킨다.
8. 운영 DB 변경 전 프로젝트 ref `zhihbyarqpkudqyomcxv`를 다시 확인한다.
9. 대표 최종 승인 후 migration만 먼저 적용한다.
10. 적용 직후 테이블/컬럼/RPC/RLS/인덱스와 핵심 read/write를 검증한다.
11. 앱 PR을 `main`에 병합하고 Production 배포 후 Smoke Test를 실행한다.
12. 실패 시 앱 병합을 중단하고 DB 변경의 rollback/forward-fix 여부를 판단한다.

## 필수 Smoke Test

- 로그인
- 대시보드
- 고객 목록 / 상세 / 등록 / 수정
- 창호 견적 작성 / 저장 / PDF
- 인테리어 Excel 가져오기 / 원본파일 연결 / 재시도
- 견적 목록 / 상세
- 견적→계약 전환 및 동일 현장 재시도
- 일정
- 직원관리 / 활성·비활성
- 수금 / 지출 / 정산 핵심 조회
- 권한별 접근
- 다른 회사 데이터 비노출

## 운영 DB 변경 승인 기준

다음 조건을 모두 충족할 때만 운영 migration 적용을 요청한다.

- 작업 브랜치가 최신 `main` 기준
- 변경 SQL에 `DROP TABLE`, `TRUNCATE`, 무승인 `DELETE`, `DROP COLUMN` 없음
- 현재 운영 스키마와의 차이 확인 완료
- 신규/변경 RLS 검토 완료
- 멀티회사 격리 검토 완료
- Preview 또는 독립 GitHub CI build PASS
- 적용 후 검증 SQL 준비 완료
- rollback 또는 forward-fix 계획 준비 완료
- 운영 DB 대상 project ref 재확인 완료
