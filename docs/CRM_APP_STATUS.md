# EIGHTY CRM APP — CURRENT STATUS / SOURCE OF TRUTH

> 이 문서는 EIGHTY CRM 개발의 단일 진행상황 기준 문서다.
> 채팅 내용보다 이 문서를 우선한다.
> 새 채팅/새 Agent는 반드시 `AGENTS.md` → 이 문서 → `docs/CRM_APP_MISSION_AND_PUSH_POLICY.md` → PR #70 최신 상태 순으로 확인한 뒤 작업을 이어간다.

## 1. 최상위 임무

EIGHTY CRM은 ERP 모바일 복제품이 아니다.

목표는 직원이 휴대폰에서 빠르게 고객을 확인하고,
`고객 → 연락 → 상담기록 → 다음 행동 → 일정 → 견적 → 계약/수금 확인`
을 놓치지 않고 처리하는 설치형 직원 영업 앱(PWA)을 완성하는 것이다.

우선순위:
1. 직원 사용성
2. 고객 누락 방지
3. 속도
4. 데이터 일관성
5. 기능 확장

ERP = 관리자/사무/회계/상세업무
CRM = 직원 현장 영업 실행
Window Lab = 창호 전문상담
Window Check = 현장 점검

공통 고객/직원/현장/견적/계약 데이터는 기존 ERP/Supabase를 Single Source of Truth로 사용한다.

## 2. 현재 개발 기준

- Repository: `eightyerp/eightyerp`
- Branch: `feat/crm-mobile-pwa-push-foundation`
- PR: #70 `feat: 직원용 EIGHTY CRM 모바일 PWA 기반`
- PR 상태: Draft / main 미병합
- 운영 DB 변경: 미적용
- Production 배포: 미적용

## 3. 현재 구현 완료

### 앱/PWA
- `/crm` 독립 App Shell
- 하단 메뉴: 홈 / 고객 / 일정 / 견적 / 더보기
- CRM manifest + service worker
- Android/iPhone 설치 안내 `/crm/install`
- 고객 개인정보 Service Worker 캐시 금지

### CRM 홈
- 신규 문의
- 오늘 연락
- 오늘 일정
- 미처리
- 우선 처리
- `다음 행동 없음` 고객 자동 탐지

### 고객
- 카드형 고객 목록
- 이름/전화/주소 검색
- 접수기간 시작일~종료일 조회
- 접수일 + D+ 경과일
- 모바일 파이프라인
- 고객 상세
- 전화 / 문자 / 상담기록 / 다음 연락 / 견적 / 일정 빠른 행동
- 진행 고객인데 다음 연락·열린 일정이 없으면 `다음 행동 없음` 경고
- 계약금액·확정수금·미수금·확인대기 금액 읽기 전용 요약
- Window Lab 창호 전문상담 연결

### 상담/다음 행동
- 상담기록 저장
- 다음 연락시간 입력
- 다음 연락시간 입력 시 `재연락` 일정 자동 생성

### 일정
- 모바일 일정 집중 목록
- `/crm/schedules/[id]` 일정 처리 화면
- 전화 → 결과 한 줄 → 선택적 다음 연락시간 → 완료
- 다음 연락시간 입력 시 새 재연락 일정 자동 생성

### 견적
- 직원 범위 견적 목록
- `/crm/quotes/[id]` CRM 견적 요약
- 금액/VAT/상태/발행·발송·유효기간 확인
- 복잡한 편집만 ERP 상세화면으로 연결

## 4. 필수 PUSH 정책

PUSH는 CRM의 핵심 고객누락 방지 엔진이다.

1. 회사 신규고객 배분
   - 담당자 배정/변경 즉시 담당 직원에게 1회
2. 일정 등록/변경
   - 등록/변경 즉시 담당 직원에게 1회
3. 일정 사전 알림
   - 전화상담/방문상담/실측/계약상담/재연락/해피콜 등 예정 1시간 전 1회
4. 일정 미처리
   - 예정시간 +30분 후 완료·취소·재예약이 아니면 1회
5. 장기 방치 고객
   - 3일: 담당 직원 1차
   - 7일: 담당 직원 2차 + 관리자/팀장 표시
   - 14일: 반복 PUSH 대신 CRM Home/ERP 관리자 강한 경고

추가 검토:
- 신규 배분 후 30분 첫 연락 없음
- 신규문의 담당자 미배정 관리자 알림
- 견적 발송 후 후속 없음
- 계약 확인/약속 입금일 경과 시 필요한 영업 행동 알림

PUSH 피로 방지:
- 동일 이벤트 dedupe 필수
- 완료/취소/재예약 시 알림조건 해제
- 장기방치 매일 반복 금지
- 비긴급 21:00~08:00 발송 유예 검토
- 알림 클릭 시 해당 CRM 고객/일정 deep link

## 5. 성능 원칙 / 현재 상태

- 모바일 고객목록 pageSize 30
- 모바일 파이프라인: 단계별 count-only + 선택 단계 고객만 조회
- `다음 행동 없음`: 담당 고객 최대 100명 + 관련 일정 최대 500건 제한
- 견적목록 기존 pagination 재사용
- 고객상세 데이터 병렬 조회
- PUSH 판정을 위해 전체 고객을 Client로 내려받지 않음

최근 검증:
- Window workflow lifecycle guard: PASS
- ESLint: PASS
- Next.js Production Build: PASS
- 최근 계측 참고: Compile 8.3s / TypeScript 12.9s / Static generation 42 pages 456ms

## 6. 현재 테스트/배포 상태

- 최신 Vercel Preview: Ready
- Preview URL: `https://eightyerp-git-feat-crm-mobile-pwa-push-foundation-eighty-erp.vercel.app`
- 실제 직원 로그인 상태의 모바일 360/390/430px QA는 아직 필요
- Android Chrome PWA / iPhone Safari PWA 실기기 설치 확인 필요

## 7. 남은 Release Gate

- [x] Lint / Production Build
- [ ] 모바일 360px QA
- [ ] 모바일 390px QA
- [ ] 모바일 430px QA
- [ ] Android Chrome PWA 설치/E2E
- [ ] iPhone Safari PWA 설치/E2E
- [ ] PUSH migration preflight
- [ ] VAPID key/Secret 등록
- [ ] Edge Function 배포 + scheduler 연결
- [ ] 직원 1~2명 E2E
- [ ] 신규배분/일정등록/1시간전/+30분/3일/7일 PUSH 중복방지 QA
- [ ] 완료/취소/재예약/상담 발생 시 PUSH reset QA
- [ ] 대표 최종 승인
- [ ] main 병합
- [ ] Production 배포

## 8. 다음 작업 — 반드시 이 순서 우선

### NOW
1. Preview/실기기 CRM 모바일 QA
2. PWA 설치 흐름 확인
3. 고객 → 전화 → 상담 → 다음 연락 → 일정 완료 → 견적 확인 E2E
4. 발견된 모바일 UX 오류 수정

### NEXT
5. PUSH migration preflight
6. 운영 반영 전 RLS/index/rollback 검증
7. 승인 후 PUSH 실제 연결
8. 직원 1~2명 테스트

### AFTER
9. 계약/수금 모바일 읽기 UX 보완
10. Window Lab / Window Check 연결 UX 마감
11. 직원 피드백 기반 최소 수정

## 9. 하지 말 것

- 별도 CRM 고객 DB 생성 금지
- ERP 기능 전체를 CRM에 복제 금지
- 회계/지출결의/정산을 CRM 핵심 메뉴로 확장 금지
- 승인 없이 운영 DB migration 금지
- 승인 없이 main merge/Production 배포 금지
- 유료 서비스 임의 결제 금지
- Preview/PUSH 때문에 고객 개인정보를 캐시하지 말 것

## 10. 채팅 관리 규칙

앞으로 채팅은 의사결정과 지시용으로만 사용한다.

상세 진행기록은 이 파일에 업데이트한다.

매 중요 단계 완료 시 이 파일의 다음 내용을 갱신한다.
- 현재 branch/PR/head
- 완료 기능
- QA 결과
- 속도
- 발견 문제
- 다음 작업
- 대표가 해야 할 일

새 채팅 시작 문구는 아래 한 줄이면 된다.

`EIGHTY CRM 개발 계속. AGENTS.md, docs/CRM_APP_STATUS.md, docs/CRM_APP_MISSION_AND_PUSH_POLICY.md와 PR #70 최신 상태를 먼저 확인하고, 중복 구현 없이 NEXT 작업부터 계속 진행. 속도와 임무 항상 체크.`

이 문서를 읽은 Agent는 과거 채팅 전체를 다시 읽으라고 사용자에게 요구하지 않는다.
