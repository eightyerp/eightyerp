# EIGHTY CRM APP — CURRENT STATUS / SOURCE OF TRUTH

> 이 문서는 EIGHTY CRM 개발의 단일 진행상황 기준이다. 채팅보다 이 문서를 우선한다.
> 새 채팅/새 Agent는 `AGENTS.md` → 이 문서 → `docs/CRM_APP_MISSION_AND_PUSH_POLICY.md` → `docs/CRM_PUSH_RELEASE_AND_ROLLBACK.md` → PR #70 순으로 확인한다.

## 1. 최상위 임무
EIGHTY CRM은 ERP 모바일 복제품이 아니다. 직원이 휴대폰에서 `신규등록 → 연락 → 상담기록 → 다음 행동 → 일정 → 견적 → 계약/수금 확인`을 최소 터치로 처리하고 고객을 놓치지 않게 만드는 설치형 직원 영업앱(PWA)이다.

우선순위: `직원 사용성 → 고객 누락 방지 → 속도 → 데이터 일관성 → 기능 확장`.

## 2. 현재 개발 기준
- Repository: `eightyerp/eightyerp`
- Branch: `feat/crm-mobile-pwa-push-foundation`
- PR: #70 / Draft / main 미병합
- 운영 PUSH migration: 미적용
- Edge Function/scheduler: 운영 미배포
- VAPID/Worker Secret: 운영 미등록
- Production 배포: 미적용

## 3. 현재 구현
- `/crm` 독립 PWA App Shell, 5개 하단 메뉴, Android/iPhone 설치 안내, iPhone safe-area 대응
- 홈: 신규문의/오늘연락/오늘일정/미처리/다음행동없음/우선처리
- 홈 경량쿼리: 기존 일정 800건/견적 500건 선로딩 제거, 대상 데이터만 제한조회
- 고객: 카드/검색/접수기간/D+/파이프라인/전화/문자/상담/일정/상태
- `/crm/customers/new`: 간편등록 + 전화번호 중복 사전검사 + 기존 고객 바로 열기
- `/crm/customers/[id]/assignee`: 관리자 모바일 담당자 배정
- `/crm/customers/[id]/status`: 단계변경 + 레거시 `계약` 보존
- 접수기간/오늘연락: 운영 DB UTC 기준 KST(+09:00) 정확성 보정
- 상담: 첫 상담 자동 상태전진, 정확한 다음연락시간 → 실제 `재연락` 일정 생성
- 일정: 모바일 등록/처리/완료/재예약, 1시간 충돌방지, 일정종류별 자동 단계전진
- 견적: 모바일 목록/요약, 복잡한 편집은 ERP 재사용
- 통합 알림함: 신규배분/+30분미연락/10분미배정/일정변경/1시간전/+30분미처리/3일·7일방치
- PUSH deep link는 `/crm` 범위만 허용

## 4. PUSH 계약
1. 회사/관리자 신규배분 즉시 1회
2. 자동유입/service_role 배분 포함
3. 직원 본인 직접등록은 자기 배분 PUSH 제외
4. 배분 +30분 첫 연락·상담·예약 없음 → 1회
5. 신규문의 10분 미배정 → 같은 회사 admin/super_admin 1회
6. 일정 등록/변경 → 담당자 1회, 자기 일정 즉시 자기 PUSH 억제
7. 예약 1시간 전 → 1회
8. 예정 +30분 미처리 → 1회
9. 3일 후속 없음 → 1차
10. 7일 장기방치 → 2차

중복방지: dedupe, 배분 후 일정 생성 시 +30분 배분재촉 제거, 열린 일정 있으면 stale 제거, 완료 일정 completed_at으로 stale reset, 상담/후속일정 시 reset.

## 5. PUSH Worker 신뢰성
- pending → processing 조건부 선점으로 중복 Worker 이중발송 방지
- 10분 이상 멈춘 CRM processing만 복구
- 일시 오류 최대 3회 재시도
- 404/410 subscription 비활성화
- 성공 sent / 구독없음 skipped / 최종실패 failed
- Rollback: `docs/CRM_PUSH_RELEASE_AND_ROLLBACK.md`

## 6. CI / 속도
CI: Window lifecycle → CRM contract → CRM layout → CRM home performance → ESLint → Production Build.
동일 PR 이전 run은 concurrency로 자동 취소.

최신 기능 코드 체크포인트:
- commit `b685c97a490f174d7063d2e3cb64a12b6544326e`
- ERP CI #157 `31944374363`: SUCCESS
- 4개 Guard: PASS
- ESLint: **0 errors / 0 warnings**
- Production Build: PASS
- Compile **9.3s** / TypeScript **16.0s** / Static generation **43 pages, 562ms**

정상 CRM routes: `/crm`, `/crm/customers`, `/crm/customers/new`, `/crm/customers/[id]`, `/crm/customers/[id]/assignee`, `/crm/customers/[id]/status`, `/crm/customers/[id]/schedule/new`, `/crm/install`, `/crm/notifications`, `/crm/quotes`, `/crm/quotes/[id]`, `/crm/schedules`, `/crm/schedules/[id]`.

## 7. Release Gate
완료: CI/Build, KST 정확성, 신규고객+중복방지, 담당자배정, 상태/일정/충돌/단계전진, PUSH preflight/중복방지/재시도/rollback, 통합 Inbox, 홈 성능 최적화.

남음:
- [ ] 실제 360/390/430px 로그인 렌더 QA
- [ ] Android Chrome PWA 설치/E2E
- [ ] iPhone Safari PWA 설치/E2E
- [ ] VAPID/Worker Secret 등록 승인
- [ ] 운영 migration 적용 승인
- [ ] Edge Function + scheduler 운영 연결
- [ ] 직원 1~2명 PUSH E2E
- [ ] 대표 최종 승인
- [ ] main / Production

## 8. 다음 작업
1. Preview 제한 해제 즉시 360/390/430px QA
2. Android/iPhone PWA 설치 E2E
3. 직원 1명 `신규등록 → 상담 → 일정 → 견적` E2E
4. 운영 PUSH 승인 직전 최종 점검
5. 승인 이후 migration → Secret → Edge Function 수동테스트 → 직원 PUSH → scheduler 마지막 활성화

## 9. 금지
승인 없이 운영 DB migration, Production Secret, main merge, Production 배포, 추가 유료결제 금지. 별도 CRM 고객 DB 및 ERP 전체 기능 CRM 복제 금지.

## 10. 새 채팅 시작 문구
`EIGHTY CRM 개발 계속. AGENTS.md, docs/CRM_APP_STATUS.md, docs/CRM_APP_MISSION_AND_PUSH_POLICY.md, docs/CRM_PUSH_RELEASE_AND_ROLLBACK.md와 PR #70 최신 상태를 먼저 확인하고, 중복 구현 없이 NOW 작업부터 계속 진행. 속도와 임무 항상 체크.`
