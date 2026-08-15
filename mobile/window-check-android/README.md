# 에잇티 창호체크 Android

에잇티 직원이 현장에서 창호 사진 5장을 촬영하고, AI 예비진단 흐름과 상담 신청 화면을 검증하기 위한 Android 내부 MVP입니다.

## 현재 구현 범위

- 시작 화면과 촬영 안내
- 창호 전체 / 창틀 모서리 / 유리 / 하부 레일 / 손잡이 사진 촬영
- 촬영 사진 임시 미리보기
- AI 분석 진행 화면
- 예비진단 등급과 항목별 결과
- 추가 증상 입력
- 종합 리포트와 점검 순서
- 방문 상담 신청 화면
- Google Play 없이 설치 가능한 Debug APK 자동 빌드

## 중요한 제한

현재 `FakeDiagnosisRepository`가 고정된 예비진단 결과를 반환합니다. 실제 사진 분석은 다음 단계에서 서버 API로 연결합니다. AI 결과는 교체 여부를 확정하지 않으며, 전문가 현장점검 전의 참고자료로만 사용합니다.

## 기술 구성

- Kotlin
- Jetpack Compose / Material 3
- Android API 26 이상
- compileSdk / targetSdk 36
- Android Gradle Plugin 8.13.2
- Gradle 8.13
- JDK 17

## Android Studio 실행

1. Android Studio에서 이 폴더를 프로젝트로 엽니다.
2. Android SDK 36을 설치합니다.
3. `app`의 `debug` 변형을 실행합니다.

Debug 패키지는 `com.eighty.windowcheck.internal`입니다.

## APK 자동 생성

GitHub Actions의 `Android Window Check APK` 워크플로를 수동 실행하거나, 이 폴더의 변경을 브랜치에 push하면 `eighty-window-check-internal-apk` 아티팩트가 생성됩니다.

생성 파일:

```text
app/build/outputs/apk/debug/app-debug.apk
```

직원 휴대전화에서 APK를 직접 설치할 때는 해당 브라우저 또는 파일 앱의 `출처를 알 수 없는 앱 설치` 권한을 한 번 허용해야 합니다.

## 다음 개발 단계

1. 사진 품질검사 API
2. OpenAI 비전 분석 서버
3. Supabase 비공개 사진 저장소
4. ERP 직원 로그인 및 고객 리드 등록
5. 직원의 AI 판정 수정·확정 기능
6. 실제 창호 사례 30건으로 내부 검증
