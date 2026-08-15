# EIGHTY ERP — Railway Preview 설정

> 목적: Vercel Hobby Production은 그대로 유지하고, `agent/finance-v2-gate3-preview` 브랜치를 Railway 개발·검증용 Preview로 실행한다.

## 안전 원칙

- Vercel Production 도메인/프로젝트 변경 없음
- Supabase 운영 DB migration 적용 없음
- Railway에서는 Preview 화면 검증만 수행
- Finance V2 Preview의 변경/승인 버튼은 비활성화 상태 유지
- `OPENAI_API_KEY`는 없어도 규칙 기반 경영분석으로 동작하도록 유지

## Railway 배포 방식

Railway 공식 Next.js 가이드 기준으로 self-hosted 배포는 `output: "standalone"`을 사용한다.
이 저장소는 Railway 빌드에서만 standalone output을 활성화한다.

- Vercel build: 기존 Next.js 설정 유지
- Railway build: `RAILWAY_BUILD=1 npm run build`
- Railway start: `npm run start:railway`
- Healthcheck: `/login`

관련 파일:

- `next.config.ts`
- `railway.json`
- `package.json`

## GitHub 연결 순서

1. Railway 새 프로젝트 생성
2. `Deploy from GitHub repo` 선택
3. 저장소 `eightyerp/eightyerp` 선택
4. 배포 브랜치를 `agent/finance-v2-gate3-preview`로 지정
5. `railway.json` 설정 자동 인식 확인
6. 환경변수 입력
7. 첫 빌드 실행
8. Networking → Generate Domain
9. `/login` 접속
10. 관리자 로그인 후 아래 Preview 경로 검증

## 필수 환경변수

다음 값은 현재 Vercel Preview/Production과 **동일한 Supabase 프로젝트를 읽기 전용 Preview로 조회**할 때 필요하다.

```text
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>
```

레거시 키를 사용하는 환경이라면 앱은 다음 키도 fallback으로 인식한다.

```text
NEXT_PUBLIC_SUPABASE_ANON_KEY=<legacy anon key>
```

주의: publishable key와 anon key를 둘 다 넣을 필요는 없다. 가능하면 publishable key를 우선한다.

## 선택 환경변수

```text
OPENAI_API_KEY=<optional>
```

Finance V2 Preview 검증 자체에는 필수가 아니다. API 키가 없으면 AI 심층분석 대신 규칙 기반 분석을 사용한다.

## 절대 입력하지 말 것

브라우저에 노출되는 `NEXT_PUBLIC_*` 변수에 다음을 넣지 않는다.

- Supabase service role key
- OpenAI API key
- 개인 비밀번호
- 카드/계좌정보

## 첫 검증 경로

```text
/dashboard/finance-preview
/finance/work-preview
/finance/payments-preview
/finance/collections-preview
/dashboard
```

검증 순서:

1. `/login` 정상 렌더
2. 로그인/세션 쿠키 정상
3. 관리자 Finance Preview 접근
4. 일반 직원 Finance 관리자 Preview 접근 차단
5. 직원 본인 예상 정산 표시
6. 수금/지출 Preview가 운영 자료를 수정하지 않는지 확인

## 첫 Build 통과 후 실행할 검사

```bash
npm run test:finance-v2
npm run lint
npm run build
```

Railway build 로그에서 Next.js TypeScript 검증과 Production Build 성공을 확인한다.

## Railway를 계속 쓸지 결정하는 기준

Railway Preview를 1~2주 사용해 다음을 비교한다.

- Vercel Hobby 빌드 제한 발생 빈도
- Railway 월 실제 사용료
- Preview 배포 시간
- Next.js Server Action/Auth 호환성
- 페이지 응답시간
- 장애/재시작 빈도

Production 이전은 별도 프로젝트로 판단하며 이번 Gate 3에서는 하지 않는다.
