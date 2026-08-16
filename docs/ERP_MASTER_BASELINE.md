# Eighty ERP Master Baseline

기준 스냅샷: 2026-08-16 21:06 KST  
운영 기준: `main` / Supabase `eighty-erp` (`zhihbyarqpkudqyomcxv`)

## 1. 이 문서의 목적

이 문서는 Eighty ERP의 **단일 개발 기준점(Source of Truth)** 이다. 새 기능을 추가하기 전에 현재 운영 상태, 이미 구현된 기능, 부분개발, 대기 PR, 폐기 후보, 신규예정을 먼저 확인한다.

개발 상태는 아래 5개만 사용한다.

- `운영중`: main + 운영 DB 기준으로 사용 가능한 기능
- `부분개발`: 코드/DB/UI 중 일부만 준비된 기능
- `PR대기`: 별도 PR에서 검증 중이며 main 미반영
- `보관/폐기후보`: 현재 구조와 중복되거나 별도 저장소로 이전된 과거 작업
- `신규예정`: 아직 구현하지 않은 신규 범위

## 2. 운영 Source of Truth

- GitHub 저장소: `eightyerp/eightyerp`
- 운영 브랜치: `main`
- 운영 Supabase: `eighty-erp`
- 운영 Supabase project ref: `zhihbyarqpkudqyomcxv`
- 배포 상태 확인: GitHub commit status + Vercel 운영 프로젝트
- DB 상태 확인: 실제 운영 스키마 + `supabase_migrations.schema_migrations`
- 운영 변경 순서: DB forward migration 검증 → DB 적용 승인 → 앱 병합/배포 → Smoke Test

`main`의 코드, 운영 DB 실제 스키마, 이 문서가 다를 경우 **실제 운영 DB와 최신 main을 우선 확인한 뒤 이 문서를 즉시 갱신**한다.

## 3. 제품 경계 — 기능 중복 금지

### Eighty ERP
회사의 Master System이다.

- 고객 Master
- 직원/권한 Master
- 견적/계약
- 현장/일정
- 수금/지출/정산
- 자재/거래처
- 경영지표/손익
- 문서/AS/발주(향후)

### CRM
인테리어 영업 실행도구다.

- 신규문의
- 담당배정
- 연락/상담
- 다음 행동
- 영업 파이프라인
- 일정
- 견적/계약 진입

고객/견적/계약/수금의 원장은 새로 만들지 않고 ERP Master를 공유한다.

### Window Lab
창호 영업 전문도구다.

- 창호 전문상담
- 브랜드/제품 비교
- 카탈로그/고객 전달자료
- 보양/몰딩/타일 등 창호 영업자료
- Window Check 결과를 상담·견적으로 연결

### Window Check
현장 점검/데이터 수집 도구다.

- 사진
- 위치별 창호 상태
- 상태등급/점검결과
- 고객 리포트
- 점검 이력

ERP와는 `company_id → customer_id → project_id → inspection_id → consultation_id → quote_id` 같은 계약된 ID 체인으로 연결한다.

## 4. 현재 기능 상태

| 영역 | 상태 | 기준 |
|---|---|---|
| 로그인/회사/권한 | 운영중 | 멀티회사, 승인, Employee Master 기반 |
| 고객관리 | 운영중 | 목록/상세/등록/수정/삭제보관/파이프라인 |
| 고객 상담/활동 | 운영중 | 상담로그, 일정, 고객 상세 연결 |
| 창호 견적 | 운영중 | Excel, 편집, VAT, 할인, PDF/공유 |
| 인테리어 견적 | 운영중 | Excel 분석/오류검토/저장 경로 존재 |
| 견적→계약 | 운영중 + PR대기 | 기본 전환 운영중, 원자성 강화 PR #69 대기 |
| 계약 | 운영중 | 원계약/변경/추가/종료 수명주기 기반 |
| 일정 | 운영중 | 고객일정/공정일정 |
| 현장 | 부분개발 | 프로젝트/공정/자재는 존재, 통합 현장 허브 필요 |
| 자재 | 운영중 | 카탈로그/현장자재/승인 기반 |
| 수금 | 운영중 | 계약 연동 수금 등록/확정/취소 |
| 지출 | 운영중 | 지출요청/승인/지급/증빙 기반 |
| 직원 정산 | 운영중 | 2026 정산 기반, 직원 UAT 지속 필요 |
| 월 손익/경영분석 | 부분개발 | DB/대시보드 구성 존재, 메뉴/정의 정리 필요 |
| 직원 할 일 | 부분개발 | `employee_tasks` 운영 DB 복구 완료, UX 연결 점검 필요 |
| ERP 알림 | 부분개발 | 인앱 고객/수금/지출 알림, 외부 카카오 발송 전 단계 |
| Window workflow hub | 부분개발 | 운영 DB 체인 기반 존재, 앱 간 E2E 확대 필요 |
| AS 관리 | 신규예정 | 접수→배정→방문→처리→완료 |
| 구매/발주 | 신규예정 | 자재/협력업체/납기/현장 연동 |
| 문서센터 | 신규예정 | 견적/계약/도면/사진/세금문서 통합 |
| 통합검색 | 신규예정 | 고객/전화/견적/계약/현장/문서 검색 |
| ERP 상태센터 | 신규예정 | 배포/DB/오류/PR/성능/마이그레이션 한 화면 |

## 5. 2026-08-16 운영 DB 스냅샷

점검 시점 기준:

- Supabase 프로젝트 상태: `ACTIVE_HEALTHY`
- migration ledger: 21건
- 최신 ledger version: `20260816031425` (`window_inspection_workflow_hub`)
- `public.employee_tasks`: 존재
- `public.interior_quote_imports`: 없음
- 인테리어 견적 최신 저장 경로는 전용 import 테이블이 아니라 공통 견적 생성 경로를 사용

따라서 과거 문서나 migration 파일의 존재만으로 운영 DB 상태를 추정하지 않는다.

## 6. 열린 PR 분류

### 우선 검토

- **#69 Window Lab 견적 handoff 원자성 및 project 무결성**
  - 분류: `PR대기 / P0`
  - 방침: 운영 migration 검증 → staff rollback verifier → 앱 병합 순서 유지

### 아이디어 선별 재적용

- **#62 core ERP navigation round trip 제거**
  - 분류: `PR대기 / 성능 참고`
  - 방침: 오래된 브랜치를 통째로 병합하지 않고 최신 main에서 필요한 개선만 재구성

- **#50 Finance V2 Gate 3**
  - 분류: `PR대기 / 기능 참고`
  - 방침: 현재 main에 이미 들어온 재무 기능과 중복 비교 후 필요한 기능만 이식

### 단계 분리 필수

- **#70 직원용 CRM 모바일 PWA**
  - 분류: `PR대기 / 대형 기능`
  - 방침: PWA shell → 모바일 업무 → PUSH 스키마/worker 순으로 작은 Gate로 나누며 통째 병합 금지

### 보관/폐기후보

- **#44, #49 ERP 저장소 내부 Android Window Check**
  - 분류: `보관/폐기후보`
  - 방침: 현재 별도 Window Check 저장소가 기준이므로 ERP 본체에 Android 앱 소스를 다시 합치지 않는다.

## 7. P0 안정화 우선순위

1. Master Baseline / 개발 규칙 고정
2. 상단 알림·권한·대시보드의 중복 네트워크 왕복 제거
3. 고객목록 → 견적목록 → 견적상세 → 저장 → 일정 핵심 동선 속도 계측
4. Supabase Security Advisor 경고 분류 및 권한 hardening
5. PR #69 원자성 Gate 검증
6. 직원 UAT 오류를 기능별 backlog로 분리
7. CRM/Window Lab/Window Check와 ERP의 ID 계약 고정

P0가 안정되기 전에는 AS/발주/문서센터 같은 대형 신규 모듈을 동시에 시작하지 않는다.

## 8. 성능 원칙

- 동일 요청에서 사용자/회사/권한 정보는 1회 계산 후 재사용한다.
- 대시보드 카드별로 같은 원장을 반복 조회하지 않는다.
- 안전한 read는 병렬화하고, 의존성이 없는 waterfall을 만들지 않는다.
- 목록 화면에서 전체 레코드를 Client로 내려받지 않는다.
- 알림은 한 번의 bundle 조회를 우선하고 숨김 탭에서는 polling하지 않는다.
- polling이 꼭 필요하면 저빈도 + focus/visibility 재검증을 기본으로 한다.
- 속도 개선은 기능 삭제가 아니라 DB 왕복 수, payload, 직렬 await, 반복 권한검증을 먼저 줄인다.

핵심 동선에는 추후 p50/p95 기준을 기록하고 회귀 시 병합을 막는 성능 Gate를 추가한다.

## 9. 변경 규칙

- 기능 하나/목적 하나 = PR 하나를 기본으로 한다.
- 대형 기능은 UI, DB, 외부연동을 Gate로 나눈다.
- 운영 DB 의존 코드와 migration의 적용 순서를 PR에 명시한다.
- 과거 migration을 재실행하지 않고 현재 운영 스키마 기준 forward migration을 작성한다.
- DB write/RLS 변경은 verification과 rollback/forward-fix 계획 없이 병합하지 않는다.
- `main`에 직접 실험 코드를 넣지 않는다.
- 기능명을 새로 만들기 전에 기존 ERP/CRM/Window Lab 기능과 중복 여부를 확인한다.
- 화면에 `준비중`이라고 표시되어도 코드/DB가 이미 존재할 수 있으므로 파일/스키마를 먼저 확인한다.

## 10. 다음 개발 순서

`P0 안정화 → PR 정리 → 속도 개선 → 보안 hardening → 견적/계약 원자성 → 현장 허브 → 회계 UX 통합 → CRM 단계병합 → 신규모듈`

이 순서를 변경할 때는 변경 이유와 선행조건을 이 문서에 먼저 기록한다.
