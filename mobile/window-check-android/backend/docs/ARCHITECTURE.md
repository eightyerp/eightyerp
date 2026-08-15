# 에잇티 창호체크 v0.3 아키텍처

## 1. 목표

에잇티 직원이 Android 기기에서 위치별 창호사진과 결로·외부누수·기타 하자를 기록하고, 서버 기반 AI 예비분석과 직원 최종검토를 거쳐 고객용 점검 PDF와 견적서를 전달하도록 한다.

AI는 사진에서 직접 보이는 현상을 구조화할 뿐 누수 원인, 결로 원인, 전체교체 필요성을 확정하지 않는다.

## 2. 시스템 경계

### ERP 프로젝트 `eighty-erp`

원본으로 유지하는 데이터:

- 직원·팀·직급·활성상태
- 회사·회사 멤버십
- 고객
- 견적·견적서
- 계약·현장
- 영업경로·행사코드

초기 단계에서는 읽기 연동만 허용한다. 점검 완료 후 ERP 쓰기 연동은 별도 승인 단계에서 추가한다.

### 창호체크 프로젝트 `eighty-window-check-dev`

전용으로 저장하는 데이터:

- 점검 헤더와 창호 위치
- 위치별 증상
- 원본·분석용·썸네일 사진
- 분석 Queue와 처리상태
- AI 원본결과
- 직원 수정·최종결과
- 고객용 PDF
- 실제 보수조치와 재발 여부
- AI 평가자료와 프롬프트 버전

### OpenAI API

전달 허용:

- 익명 점검번호와 위치번호
- `거실창 1` 같은 위치명
- 사진 카테고리
- 비식별 분석용 사진
- 사용연수·증상·강우조건·온습도

전달 금지:

- 고객명
- 전화번호
- 전체주소·동호수
- 직원 개인 연락처
- 견적금액·계약정보

## 3. 데이터 흐름

```text
Android Room 임시저장
  -> WorkManager 사진 압축·업로드
  -> 비공개 Storage
  -> enqueue-window-analysis
  -> window_analysis_jobs + pgmq
  -> process-window-analysis
  -> OpenAI Responses API 또는 Mock
  -> strict JSON 검증
  -> window_ai_results 원본 보존
  -> 직원 검토·수정
  -> window_staff_reviews
  -> 고객 PDF 생성
  -> ERP 견적 조회·동시공유
```

## 4. 인증 전략

### 개발 단계

창호체크 개발 프로젝트 Auth에 내부 테스터 3~5명만 등록한다. `window_staff_memberships.erp_employee_id`로 ERP 직원과 연결한다.

### 운영 전환

ERP 로그인 토큰을 신뢰할 수 있는 서버에서 검증한 뒤 창호체크 프로젝트용 단기 세션 또는 서버 프록시 권한을 발급한다. Android 앱에 service-role key를 넣지 않는다.

## 5. 사진 저장

비공개 버킷: `window-inspection-private`

```text
{company_id}/{inspection_id}/{location_id}/{photo_id}/original.jpg
{company_id}/{inspection_id}/{location_id}/{photo_id}/analysis.jpg
{company_id}/{inspection_id}/{location_id}/{photo_id}/thumbnail.jpg
```

분석용 복사본 처리:

- EXIF 위치정보 제거
- 회전 보정
- 긴 변 1600~2048px
- JPEG 품질 80~85
- SHA-256 해시
- MIME·크기 검증
- 개인정보 노출 의심 시 분석 제외 또는 직원 경고

## 6. Queue

`window_analysis_jobs`는 업무상태와 감사기록을 보관한다. 실제 비동기 전달은 Supabase Queues의 `pgmq` 큐 `window_ai_analysis`를 사용한다.

중복방지 키:

```text
location_id
+ 정렬된 선택사진 해시
+ 증상 JSON 해시
+ prompt_version
+ model_name
```

처리 원칙:

- 위치별 독립 처리
- 한 위치 실패가 다른 위치 결과를 지우지 않음
- 일시적 오류 재시도
- 사진부족은 `needs_retake`
- JSON Schema 오류 1회 재시도
- 최종실패는 관리자가 재처리

## 7. AI 분석 단계

1. 사진 품질검사
2. 직접 관찰 가능한 현상 추출
3. 결로·복층유리 김서림·외부유입 흔적 구분
4. 판단 한계 명시
5. 추가 촬영 요청
6. 직원 확인용 권장점검 순서 작성

AI 원본은 수정하지 않는다. 직원 최종결과를 별도 저장한다.

## 8. 고객 리포트 원칙

- 직원 최종확인 전 발행 금지
- PDF에는 직원 최종판정만 표시
- AI 신뢰도 수치를 고객의 확정 품질점수처럼 표시하지 않음
- 제품 추천과 견적은 직원 확인 이후만 표시
- 필수 고지문 포함

> 본 점검결과는 촬영사진과 고객 증상을 바탕으로 작성한 예비점검 자료입니다. 누수·결로의 정확한 원인과 최종 조치방법은 현장확인 및 실측 후 달라질 수 있습니다.

## 9. 지속 개선

저장할 비교자료:

- AI 원본관찰
- 직원 수정판정
- 실제 조치
- 조치 후 결과
- 재발 여부
- 모델·프롬프트·Schema 버전

승인된 평가사례만 주간 정확도 분석에 사용한다. 분석결과가 프롬프트나 규칙을 자동 활성화하지 않는다. 관리자 승인과 롤백 기능을 필수로 한다.

## 10. 단계별 배포 게이트

### Gate A — 코드만 작성

- migration·RLS·Edge Function Mock
- 운영 프로젝트 적용 없음
- Secret 없음

### Gate B — 개발 Supabase 적용

- 대표 승인 필요
- 비식별 사진만 사용
- RLS·Storage 차단 테스트 통과

### Gate C — 실제 OpenAI API 테스트

- API 프로젝트·비용한도 승인 필요
- `store: false`
- 고객정보 제외 검사 통과

### Gate D — 직원 내부테스트

- 고정 Android 서명키
- 점검 중단복원
- 직원 최종검토
- 개인정보 동의

### Gate E — ERP 쓰기연동

- 별도 승인 필요
- 상담·리포트·견적 필요상태만 기록
- 사진 원본 복제 금지

## 11. 현재 개발범위

이번 1차 백엔드 작업은 Gate A까지다.

- 별도 개발 브랜치
- 전용 migration 파일
- RLS와 비공개 Storage 정책
- pgmq Queue 생성안
- Edge Function Mock
- JSON Schema
- 실제 배포·결제·운영 반영 없음
