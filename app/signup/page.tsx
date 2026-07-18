import Link from "next/link";
import SignupForm from "@/components/auth/SignupForm";
import { getSupabasePublicMeta } from "@/lib/supabase-env";

export default function SignupPage() {
  const meta = getSupabasePublicMeta();

  return (
    <div className="login-gradient flex min-h-full flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="login-shell flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl lg:min-h-[560px] lg:flex-row">
        <section className="relative flex flex-col items-center justify-center px-8 py-12 text-center lg:w-5/12 lg:px-12 lg:py-16">
          <div
            className="brand-number select-none text-[7rem] font-bold leading-none tracking-tighter sm:text-[8rem] lg:text-[9rem]"
            aria-hidden="true"
          >
            80
          </div>
          <div className="gold-line mt-4 h-px w-24" />
          <h1 className="mt-6 text-2xl font-semibold tracking-[0.25em] text-gold-400 sm:text-3xl">
            EIGHTY ERP
          </h1>
          <p className="mt-3 text-sm text-white/60 sm:text-base">
            직원 회원가입
          </p>
          <p className="mt-6 max-w-xs text-xs leading-relaxed text-white/40 sm:text-sm">
            가입 후 대표이사 또는 이사의 승인이 필요합니다.
          </p>
        </section>

        <section className="login-card flex flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:px-14 lg:py-16">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white sm:text-2xl">
              직원 회원가입
            </h2>
            <p className="mt-1 text-sm text-white/50">
              승인 전까지 ERP 업무 메뉴에 접근할 수 없습니다
            </p>
          </div>

          {!meta.configured && meta.configError ? (
            <div className="mb-5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              <p className="font-medium">Supabase 환경 변수가 필요합니다</p>
              <p className="mt-1 text-xs text-amber-200/80">{meta.configError}</p>
            </div>
          ) : null}

          <SignupForm />

          <p className="mt-6 text-center text-xs text-white/30">
            <Link href="/login" className="text-white/50 hover:text-gold-400">
              로그인으로 돌아가기
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
