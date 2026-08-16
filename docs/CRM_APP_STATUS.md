# EIGHTY CRM APP — CURRENT STATUS / SOURCE OF TRUTH

> 이 문서는 EIGHTY CRM 개발의 단일 진행상황 기준이다. 채팅보다 이 문서를 우선한다.
> 새 채팅/새 Agent는 `AGENTS.md` → 이 문서 → `docs/CRM_APP_MISSION_AND_PUSH_POLICY.md` → `docs/CRM_PUSH_RELEASE_AND_ROLLBACK.md` → PR #70 순으로 확인한다.

## 1. 최상위 임무
EIGHTY CRM은 ERP 모바일 복제품이 아니다. 직원이 휴대폰에서 `신규등록 → 연락 → 상담기록 → 다음 행동 → 일정 → 견적 → 계약/수금 확인`을 최소 터치로 처리하고 고객을 놓치지 않게 만드는 설치형 직원 영업앱이다.

우선순위: `직원 사용성 → 고객 누락 방지 → 안정성 → 속도 → 데이터 일관성 → 기능 확장`.

## 2. Android / iPhone 개발 전략
- 기능/DB는 **공통 CRM PWA 1개**를 유지한다.
- Android와 iPhone을 별도 업무 코드베이스/별도 DB로 만들지 않는다.
- Android/iPhone은 설치·PUSH·실기기 QA 트랙만 분리한다.
- Android: PWA + 직원 설치파일용 TWA APK wrapper.
- iPhone: Safari `홈 화면에 추가` 후 Home Screen Web App으로 실행.
- iPhone PUSH는 Safari 탭이 아니라 설치된 Home Screen Web App에서 활성화한다.
- Native/App Store/TestFlight는 PWA로 부족한 요구가 실제 검증될 때 2단계로 판단한다.

## 3. 현재 개발 기준
- Repository: `eightyerp/eightyerp`
- Branch: `feat/crm-mobile-pwa-push-foundation`
- PR: #70 / Draft / main 미병합
- 운영 PUSH migration: 미적용
- Edge Function/scheduler: 운영 미배포
- VAPID/Worker Secret: 운영 미등록
- Production CRM `/crm`: 미배포

## 4. CRM 기능 구현
- `/crm` 독립 PWA App Shell, 5개 하단 메뉴, Android/iPhone 설치 안내, iPhone safe-area 대응
- PWA `id=/crm`, `start_url=/crm`, `scope=/crm`, standalone
- iPhone 설치 전 PUSH는 `설치필요`로 안내
- 홈: 신규문의/오늘연락/오늘일정/미처리/다음행동없음/우선처리
- 홈 경량쿼리: 일정 800건/견적 500건 선로딩 제거, 대상 데이터만 제한조회
- 고객: 카드/검색/접수기간/D+/파이프라인/전화/문자/상담/일정/상태
- `/crm/customers/new`: 간편등록 + 전화번호 중복검사 + 기존 고객 바로 열기
- `/crm/customers/[id]/assignee`: 관리자 모바일 담당자 배정
- `/crm/customers/[id]/status`: 단계변경 + 레거시 `계약` 보존
- 접수기간/오늘연락: 운영 DB UTC 기준 KST(+09:00) 보정
- 상담: 첫 상담 자동 상태전진, 정확한 다음연락시간 → 실제 `재연락` 일정 생성
- 일정: 모바일 등록/처리/완료/재예약, 1시간 충돌방지, 일정종류별 자동 단계전진
- 견적: 모바일 목록/요약, 복잡한 편집은 ERP 재사용
- 통합 알림함: 신규배분/+30분미연락/10분미배정/일정변경/1시간전/+30분미처리/3일·7일방치
- PUSH deep link는 `/crm` 범위만 허용

## 5. Android APK 설치파일
구조:
- `mobile/crm-android-twa/twa-manifest.json`
- `.github/workflows/crm-android-apk.yml`
- Bubblewrap Trusted Web Activity로 기존 CRM PWA를 포장한다. 업무 로직을 Android에 복제하지 않는다.

최초 APK 생성 성공:
- commit `f6a162cf3bf55684598d1db282373831e94be5d5`
- GitHub Actions `CRM Android APK` run #6 / `31947033081`: **SUCCESS**
- Build signed APK: PASS
- APK signature/package verification: PASS
- Artifact upload: PASS
- Artifact: `eighty-crm-android-test-apk`
- Artifact ID: `9263599755`
- APK: `EIGHTY-CRM-Android-test-6.apk`
- package: `com.eighty.crm.internal`
- versionName: `0.1.0-test.6`
- versionCode: `200006`
- minSdk: `26`
- targetSdk: `36`
- APK size: 약 3.26MB
- APK signature: v2/v3 검증 PASS

중요 제한:
- 현재 `CRM_ANDROID_*` 고정서명 Secret이 없어 APK는 **ephemeral test key**로 서명됐다.
- 이 파일은 설치파일 생성/기기 설치 확인용 1차 테스트 APK다.
- 직원 반복 업데이트 배포 전에는 고정 서명키 Secret을 반드시 적용한다.
- ephemeral key의 `assetlinks.json`은 운영에 절대 배포하지 않는다.
- APK 대상은 `https://eightyerp.vercel.app/crm`이지만 PR #70은 아직 main/Production 미반영이므로 실제 CRM 업무 E2E는 운영/안전한 Preview 경로가 준비된 뒤 수행한다.

## 6. PUSH 계약
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

중복방지: dedupe, 배분 후 일정 생성 시 +30분 재촉 제거, 열린 일정 있으면 stale 제거, 완료 일정 completed_at으로 stale reset, 상담/후속일정 시 reset.

## 7. PUSH Worker 신뢰성
- pending → processing 조건부 선점
- 10분 이상 멈춘 CRM processing만 복구
- 일시 오류 최대 3회 재시도
- 404/410 subscription 비활성화
- 성공 sent / 구독없음 skipped / 최종실패 failed
- Rollback: `docs/CRM_PUSH_RELEASE_AND_ROLLBACK.md`

## 8. ERP 모바일과 CRM 역할
- 휴대폰 ERP 로그인은 가능하며 관리자/비상용 fallback으로 유지한다.
- 직원 일상 고객업무는 CRM이 기본이다.
- 상세 견적/회계/정산/관리업무가 필요할 때만 ERP로 이동한다.
- CRM `더보기`에서 ERP 대시보드/견적/전체일정으로 이동 가능하다.

## 9. CRM CI / 속도
CRM 본체 최신 검증 기준:
- Window Lifecycle Guard: PASS
- CRM Mobile Contract Guard: PASS
- CRM Mobile Layout Guard: PASS
- CRM Android/iPhone Install Guard: PASS
- CRM Home Performance Guard: PASS
- ESLint: 0 errors / 0 warnings
- Production Build: PASS
- 최근 기준 Compile 약 9.9s / TypeScript 약 16.7s / Static generation 43 pages 약 569ms

APK workflow도 concurrency를 사용해 같은 브랜치의 이전 실행은 취소하고 최신 APK 빌드만 유지한다.

## 10. Release Gate
완료:
- [x] CRM 기능 CI/Build
- [x] KST 정확성
- [x] 신규고객+중복방지
- [x] 담당자배정
- [x] 상태/일정/충돌/단계전진
- [x] PUSH preflight/중복방지/재시도/rollback
- [x] 통합 Inbox
- [x] 홈 성능 최적화
- [x] Android/iPhone 설치 분기
- [x] Android TWA 프로젝트 자동생성
- [x] Android 테스트 APK Build/Signature/Package 검증
- [x] Android APK Artifact 생성

남음:
- [ ] Android 고정 서명키 Secret 등록
- [ ] 실제 360/390/430px 로그인 렌더 QA
- [ ] Android APK 실제 기기 설치 확인
- [ ] 안전한 CRM Preview 또는 승인된 Production `/crm` 준비
- [ ] Android CRM 로그인/E2E
- [ ] iPhone Safari → 홈 화면 Web App 설치/E2E
- [ ] Android/iPhone 로그인 유지 확인
- [ ] VAPID/Worker Secret 등록 승인
- [ ] 운영 PUSH migration 적용 승인
- [ ] Edge Function + scheduler 운영 연결
- [ ] Android/iPhone 직원 PUSH E2E
- [ ] 대표 최종 승인
- [ ] main / Production

## 11. 추가기능 판단
직원 테스트 전에는 과도하게 늘리지 않는다. 실사용 결과를 보고 Quiet Hours, 읽음/안읽음·Badge, 견적후속, 입금일/계약확인, 제한적 오프라인 저장, Native Store 배포를 판단한다.

## 12. NOW / 다음 작업
1. Android APK 실제 설치 확인
2. 고정 Android 서명키 준비(직원 반복배포 전 필수)
3. 최신 CRM을 열 수 있는 안전한 Preview 확보 또는 Production 승인 Gate
4. Android/iPhone 실제 설치·로그인·360/390/430px QA
5. 직원 `신규등록 → 상담 → 일정 → 견적` E2E
6. 운영 PUSH 승인 직전 최종 점검
7. 승인 이후 migration → Secret → Edge Function 수동테스트 → 직원 PUSH → scheduler 마지막 활성화

## 13. 금지
승인 없이 운영 DB migration, Production Secret, main merge, Production 배포, 추가 유료결제 금지. 별도 CRM 고객 DB 및 ERP 전체 기능 CRM 복제 금지. 임시 Android signing key/assetlinks를 운영 신뢰키로 사용 금지.

## 14. 새 채팅 시작 문구
`EIGHTY CRM 개발 계속. AGENTS.md, docs/CRM_APP_STATUS.md, docs/CRM_APP_MISSION_AND_PUSH_POLICY.md, docs/CRM_PUSH_RELEASE_AND_ROLLBACK.md와 PR #70 최신 상태를 먼저 확인하고, Android APK/iPhone PWA 두 플랫폼 QA를 유지하며 중복 구현 없이 NOW 작업부터 계속 진행. 속도·안정성·임무 항상 체크.`
