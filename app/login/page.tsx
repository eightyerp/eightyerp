import LoginForm from "@/components/auth/LoginForm";
import EightyLogo from "@/components/brand/EightyLogo";
import { getSupabasePublicMeta } from "@/lib/supabase-env";

export default function LoginPage() {
  const meta = getSupabasePublicMeta();

  return (
    <div className="login-gradient flex min-h-full flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="login-shell flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl lg:min-h-[560px] lg:flex-row">
        <section className="relative flex flex-col items-center justify-center px-8 py-12 text-center lg:w-5/12 lg:px-12 lg:py-16">
          <EightyLogo
            variant="white"
            layout="full"
            className="h-16 w-auto max-w-[240px] sm:h-[4.5rem] sm:max-w-[280px]"
            title="EIGHTY"
          />
          <div className="gold-line mt-6 h-px w-24" />
          <h1 className="mt-6 text-2xl font-semibold tracking-[0.25em] text-gold-400 sm:text-3xl">
            EIGHTY ERP
          </h1>
          <p className="mt-3 text-sm text-white/60 sm:text-base">
            주식회사 에잇티
          </p>
          <p className="mt-6 max-w-xs text-xs leading-relaxed text-white/40 sm:text-sm">
            숫자 80이 상징하는 완성과 효율,
            <br />
            프리미엄 기업 자원 관리 솔루션
          </p>
        </section>

        <section className="login-card flex flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:px-14 lg:py-16">
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-white sm:text-2xl">
              로그인
            </h2>
            <p className="mt-1 text-sm text-white/50">
              계정 정보를 입력하여 시스템에 접속하세요
            </p>
          </div>

          {!meta.configured && meta.configError ? (
            <div className="mb-5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              <p className="font-medium">Supabase 환경 변수가 필요합니다</p>
              <p className="mt-1 text-xs text-amber-200/80">
                {meta.configError}
              </p>
              <p className="mt-1 text-xs text-amber-200/80">
                프로젝트 {meta.projectId || "zhihbyarqpkudqyomcxv"}의 Publishable
                key를 .env.local에 넣은 뒤 개발 서버를 재시작해 주세요.
              </p>
            </div>
          ) : null}

          <LoginForm />

          <p className="mt-6 text-center text-[11px] leading-relaxed text-white/25">
            Supabase: {meta.projectId || meta.host}
            {meta.keyKind ? ` · key: ${meta.keyKind}` : ""}
          </p>

          <p className="mt-4 text-center text-xs text-white/30">
            © {new Date().getFullYear()} 주식회사 에잇티. All rights reserved.
          </p>
        </section>
      </div>
    </div>
  );
}
