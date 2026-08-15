# EIGHTY Window Check Backend

에잇티 창호체크 Android 앱의 사진·점검·AI 예비분석·직원 검수·리포트 데이터를 운영 ERP와 분리해 관리하는 Supabase 개발 백엔드입니다.

## 프로젝트 경계

- 허용된 개발 프로젝트 ref: `bnscmhkrjruguwfbutnm`
- 절대 적용 금지 ERP ref: `zhihbyarqpkudqyomcxv`
- 운영 ERP는 직원·고객·견적·계약의 원본 시스템으로 유지합니다.
- 이 백엔드는 사진, 창호 점검, AI 결과, 직원 수정, 리포트 Snapshot을 관리합니다.

## 적용 전 필수 확인

```bash
SUPABASE_PROJECT_REF=bnscmhkrjruguwfbutnm \
  ./services/window-check-backend/scripts/assert-window-check-project.sh
```

ERP ref가 입력되면 스크립트가 즉시 실패합니다.

## 저장소

모든 버킷은 비공개입니다.

- `window-inspection-private`: 원본·분석용·썸네일 사진
- `window-report-private`: 고객용 PDF 리포트
- `window-app-releases-private`: 내부 APK 배포파일

직원 직접 업로드 경로는 사용자 UID를 첫 폴더로 둡니다.

```text
{auth_user_id}/{inspection_id}/{location_id}/{window_unit_id}/{photo_id}/original.jpg
```

## AI 모드

- `mock`: OpenAI 키 없이 서버 업무흐름 검증
- `remote`: Edge Function에서 OpenAI Responses API 호출

OpenAI API Key, Supabase Secret Key, 앱 서명키는 Android 소스나 GitHub에 커밋하지 않습니다.

## 안전 원칙

- AI는 사진에서 관찰되는 현상만 예비정리합니다.
- 누수·결로 원인과 전체 교체 필요성을 확정하지 않습니다.
- 고객용 PDF에는 담당직원이 확정한 결과만 표시합니다.
- 고객명·연락처·상세주소·견적금액은 OpenAI 입력에 포함하지 않습니다.
