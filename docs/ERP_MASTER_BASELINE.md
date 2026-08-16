# Eighty ERP Master Baseline

기준 스냅샷: 2026-08-16 21:22 KST  
운영 기준: `main` / Supabase `eighty-erp` (`zhihbyarqpkudqyomcxv`)

## 1. 이 문서의 목적

이 문서는 Eighty ERP의 **단일 개발 기준점(Source of Truth)** 이다. 새 기능을 추가하기 전에 현재 운영 상태, 이미 구현된 기능, 부분개발, 대기 PR, 보관 작업, 신규예정을 먼저 확인한다.

개발 상태는 아래 5개만 사용한다.

- `운영중`: main + 운영 DB 기준으로 사용 가능
- `부분개발`: 코드/DB/UI 중 일부만 준비
- `PR대기`: 별도 PR 검증 중, main 미반영
- `보관/폐기후보`: 현 구조와 중복되거나 다른 저장소/후속 과제로 승계
- `신규예정`: 아직 구현하지 않은 신규 범위

## 2. 운영 Source of Truth

- GitHub: `eightyerp/eightyerp`
- 운영 브랜치: `main`
- 운영 Supabase: `eighty-erp`
- project ref: `zhihbyarqpkudqyomcxv`
- DB 기준: 실제 운영 스키마 + `supabase_migrations.schema_migrations`
- 배포 기준: 최신 main commit + Vercel Production 상태

`main`, 운영 DB, 문서가 다르면 **운영 DB와 최신 main을 먼저 확인하고 이 문서를 즉시 갱신**한다.

운영 변경 기본 순서:

`read-only preflight → forward migration 검증 → DB 적용 승인 → DB 검증 → 앱 병합/배포 → Smoke Test`

## 3. 제품 경계 — 기능 중복 금지

### Eighty ERP — 회사 Master System

- 고객/직원/권한 Master
- 견적/계약
- 현장/일정
- 수금/지출/정산
- 자재/거래처
- 경영지표/손익
- 향후 문서/AS/발주

### CRM — 인테리어 영업 실행도구

- 신규문의 → 담당배정 → 연락 → 상담 → 다음 행동 → 일정 → 견적/계약 진입
- 고객/견적/계약/수금 원장은 ERP를 재사용하고 평행 DB를 만들지 않는다.

### Window Lab — 창호 영업 전문도구

- 창호 전문상담
- 브랜드/제품 비교
- 카탈로그/고객 전달자료
- 점검 결과 기반 상담/견적 진입

### Window Check — 현장 점검/리포트 도구

- 사진/상태/등급/리포트/점검이력
- Android 앱 Source of Truth는 별도 `eightyerp/eighty-window-check`
- ERP 본체에 Android 앱 코드를 다시 합치지 않는다.

앱 간 연결은 `company_id → customer_id → project_id → inspection_id → consultation_id → quote_id → contract_id` 같은 안정된 ID 체인을 사용한다.

## 4. 현재 기능 상태

| 영역 | 상태 | 기준 |
|---|---|---|
| 로그인/회사/권한 | 운영중 | 멀티회사, 승인, Employee Master |
| 고객관리 | 운영중 | 목록/상세/등록/수정/보관/파이프라인 |
| 고객 상담/활동 | 운영중 | 상담로그, 일정, 고객 상세 연결 |
| 창호 견적 | 운영중 | Excel, 편집, VAT, 할인, PDF/공유 |
| 인테리어 견적 | 운영중 | Excel 분석/오류검토/공통 견적 저장 |
| 견적→계약 | 운영중 + PR대기 | 기본 전환 운영, 원자성 강화 #69 |
| 계약 | 운영중 | 원계약/변경/추가/종료 |
| 일정 | 운영중 | 고객일정/공정일정 |
| 현장 | 부분개발 | 프로젝트/공정/자재 존재, 통합 허브 필요 |
| 자재 | 운영중 | 카탈로그/현장자재/승인 |
| 수금 | 운영중 | 계약 연동 등록/확정/취소 |
| 지출 | 운영중 | 요청/승인/지급/증빙 |
| 직원 정산 | 운영중 | 2026 정산 기반, UAT 지속 필요 |
| 월 손익/경영분석 | 부분개발 | DB/대시보드 존재, UX 통합 필요 |
| 직원 할 일 | 부분개발 | `employee_tasks` 운영 DB 복구, UX 연결 점검 |
| ERP 알림 | 부분개발 | 인앱 고객/수금/지출, 외부 카카오 전 단계 |
| Window workflow hub | 부분개발 | 운영 ID 체인 존재, E2E 확대 필요 |
| 통합검색 | 신규예정 | 고객/전화/견적/계약/현장/문서 |
| AS | 신규예정 | 접수→배정→방문→처리→완료 |
| 구매/발주 | 신규예정 | 자재/협력업체/납기/현장 |
| 문서센터 | 신규예정 | 견적/계약/도면/사진/세금문서 |
| ERP 상태센터 | 신규예정 | Issue #74 |

## 5. 운영 DB 스냅샷 — 2026-08-16

- Supabase health: `ACTIVE_HEALTHY`
- migration ledger: 21건
- latest ledger: `20260816031425` / `window_inspection_workflow_hub`
- `public.employee_tasks`: 존재
- `public.interior_quote_imports`: 없음
- 인테리어 Excel은 전용 import 테이블이 아니라 공통 견적 생성 경로를 사용

PR #69 read-only preflight:

- `quote_workflow_atomic_integrity`: ledger 미적용
- `quote_contract_retry_project_guard`: ledger 미적용
- 활성 quote↔project company/customer/deleted mismatch: **0건**
- 활성 quote inspection/consultation source mismatch: **0건**
- 신규 workflow RPC/identity trigger/source lock trigger: 운영에 아직 없음
- 기존 `transition_quote_to_contract(...)` replay project mismatch guard marker: 0

## 6. 현재 열린 핵심 PR

### PR #71 — ERP Master Baseline 및 알림 성능 1차 안정화

- 분류: `PR대기 / P0`
- 별도 브랜치 `agent/erp-master-baseline`
- DB/RLS/migration 변경 없음
- ERP 상단 알림 category별 3회 조회 → bundle 1회
- polling 30초 → 60초, hidden tab 중지
- Baseline/Agent guard CI 추가
- CI: baseline / lifecycle / ESLint / Production build PASS
- main 병합/Production 반영 전

### PR #69 — Window Lab 견적 handoff 원자성 및 project 무결성

- 분류: `PR대기 / P0`
- 운영 DB read-only preflight PASS
- 적용 순서: project ref 재확인 → migration → staff rollback verifier → synthetic 0 → 앱 병합/배포
- 앱을 DB migration보다 먼저 배포하지 않는다.

### PR #70 — 직원용 CRM 모바일 PWA

- 분류: `PR대기 / 대형 기능`
- 통째 병합 금지
- PWA shell → 모바일 업무 → PUSH 스키마/worker → 실제 모바일 UAT 순으로 Gate 분리

## 7. 정리 완료한 과거 PR

### 성능

- PR #62: **CLOSED 2026-08-16**
- 현재 main보다 29 commits behind 확인
- 분석/아이디어는 Issue #73 `ERP 핵심동선 성능 V2`로 승계

### Window Check Android

- PR #44, #49: **CLOSED 2026-08-16**
- 별도 Window Check 저장소가 Source of Truth
- 코드/브랜치/Actions 이력은 보존

### Finance V2 Preview

- PR #48, #50: **CLOSED 2026-08-16**
- #50은 현재 main과 54 commits ahead / 76 commits behind, mergeable=false 확인
- 현재 main에는 수금/지출/정산/월손익 운영 기반이 이미 존재
- 유효한 아이디어는 Issue #75 `Finance UX 통합`으로 승계
- 과거 Preview/draft migration을 일괄 적용하지 않는다.

## 8. 현재 독립 Backlog

- **#72 P0 Security** — Supabase Security Advisor 권한 hardening
  - 1차 read-only inventory 완료
  - 공개 token RPC / Storage helper / authenticated helper / trigger-only로 분류
- **#73 P0 Performance** — 최신 main 기준 핵심동선 성능 V2
- **#74 P1 Status Center** — 배포·DB·오류·PR·성능 통합 상태센터
- **#75 P1 Finance UX** — 수금·지출·정산·현장재무 업무함
- **#65 P0 Lifecycle** — 계약 전 현장→점검→상담→견적→계약
- **#54 Integration** — ERP↔Window Lab/Window Check 연계도구

## 9. P0 안정화 우선순위

1. PR #71 Master Baseline 확정
2. Issue #73 핵심 동선 속도 V2
3. Issue #72 Security hardening
4. PR #69 견적/계약 원자성 Release Gate
5. 직원 UAT 오류를 기능별 backlog로 분리
6. CRM/Window Lab/Window Check ID 계약 고정

P0 안정 전 AS/발주/문서센터 같은 대형 신규 모듈을 동시에 시작하지 않는다.

## 10. 성능 원칙

- 사용자/회사/권한은 요청당 1회 계산 후 재사용
- 같은 원장의 대시보드 카드별 반복 조회 금지
- 독립 read 병렬화, 불필요한 waterfall 제거
- 목록 전체를 Client로 내려받지 않음
- 알림은 bundle 조회, hidden tab polling 금지
- 기능 삭제보다 DB 왕복/payload/직렬 await/반복 권한검증을 먼저 줄임
- 핵심 동선: `dashboard → customers → quotes → quote detail/save → schedules → employees`

## 11. 변경 규칙

- 목적 하나 = PR 하나
- 대형 기능은 Gate 분리
- 운영 DB 의존 코드와 migration 적용 순서를 PR에 기록
- 과거 migration 재실행 금지, 현재 운영 스키마 기준 forward migration
- DB write/RLS 변경은 verification + rollback/forward-fix 없이 병합 금지
- `main` 직접 실험 금지
- 신규 기능 전에 ERP/CRM/Window Lab 중복 확인
- UI의 `준비중` 문구만으로 미개발 판단 금지 — 코드/DB 실제 상태 확인

## 12. 다음 개발 순서

`P0 기준선 #71 → 속도 #73 → 보안 #72 → 원자성 #69 → 현장 허브 → Finance UX #75 → CRM 단계병합 #70 → 상태센터 #74 → 신규모듈`

순서를 바꾸면 이유와 선행조건을 이 문서에 먼저 기록한다.
