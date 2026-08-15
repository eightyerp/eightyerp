# 에잇티 창호체크 AI 백엔드

이 디렉터리는 Android 앱의 실제 사진분석, 점검이력, 직원검토, PDF 재발행을 위한 **별도 Supabase 프로젝트 전용 코드**입니다.

## 프로젝트 분리 원칙

- 운영 ERP Supabase 프로젝트 `eighty-erp`에는 이 디렉터리의 migration, Storage 정책, Edge Function을 적용하지 않습니다.
- 현재 비어 있는 별도 Supabase 프로젝트를 개발환경 `eighty-window-check-dev` 역할로 사용합니다.
- 직원·고객·견적·계약의 기준정보는 ERP가 원본입니다.
- 창호 원본사진, 분석용 사진, AI 원본결과, 직원 수정결과, 점검 PDF는 창호체크 프로젝트가 보관합니다.
- 두 프로젝트는 데이터베이스 FK가 아니라 서버 API와 `erp_*_id` 외부참조값으로 연결합니다.

## 현재 단계

1. 개발 브랜치와 백엔드 전용 경로 생성
2. 데이터베이스·RLS·비공개 Storage migration 작성
3. Queue와 Edge Function Mock 구현
4. Android `RemoteDiagnosisRepository` 연결
5. 비식별 사진으로 실제 AI 분석 검증

현재 단계에서는 다음을 수행하지 않습니다.

- 운영 ERP DB 수정
- 운영 Supabase migration 적용
- `main` 병합
- Production 배포
- 실제 고객사진 업로드
- OpenAI 결제 또는 사용한도 상향

## 예정 구조

```text
Android 앱
  -> 직원 인증
  -> 비공개 사진 업로드
  -> window_analysis_jobs / pgmq queue
  -> Supabase Edge Function
  -> OpenAI Responses API
  -> strict JSON 결과 검증
  -> AI 원본결과 저장
  -> 직원 수정·최종확정
  -> 고객 PDF + ERP 견적서 공유
```

## 디렉터리

```text
backend/
  docs/                 아키텍처·보안·운영 문서
  supabase/
    migrations/         창호체크 개발 프로젝트 전용 SQL
    functions/          Edge Functions
```

## Secret 관리

Android APK나 GitHub에 절대 넣지 않는 값:

- `OPENAI_API_KEY`
- Supabase secret/service-role key
- DB 비밀번호
- Android release signing key 및 비밀번호

Edge Function Secret으로만 관리할 값:

```text
OPENAI_API_KEY
OPENAI_VISION_MODEL
AI_PROMPT_VERSION
AI_SCHEMA_VERSION
MAX_ANALYSIS_IMAGES_PER_LOCATION
MAX_IMAGE_SIZE_MB
AI_ANALYSIS_TIMEOUT_MS
AI_DAILY_LIMIT_PER_EMPLOYEE
CUSTOMER_PHOTO_RETENTION_DAYS
```

## 개발 기본값

실제 AI Secret이 설정되기 전에는 `AI_PROVIDER_MODE=mock`으로 동작하도록 설계합니다. Mock 결과와 실제 결과는 동일한 JSON Schema를 사용해야 하며, 직원 검토 완료 전에는 고객 PDF에 확정판정으로 노출하지 않습니다.
