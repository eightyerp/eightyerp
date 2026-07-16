"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
  }

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

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label
                htmlFor="userId"
                className="mb-1.5 block text-sm font-medium text-white/70"
              >
                아이디
              </label>
              <input
                id="userId"
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="아이디를 입력하세요"
                autoComplete="username"
                className="input-field w-full rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-white/70"
              >
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                autoComplete="current-password"
                className="input-field w-full rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-white/60">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="checkbox-gold h-4 w-4 rounded"
                />
                로그인 상태 유지
              </label>
              <a
                href="#"
                className="text-sm text-gold-400 transition-colors hover:text-gold-500"
                onClick={(e) => e.preventDefault()}
              >
                비밀번호 찾기
              </a>
            </div>

            <button
              type="submit"
              className="btn-login mt-2 w-full rounded-lg py-3.5 text-sm font-semibold tracking-wide text-navy-900"
            >
              로그인
            </button>
          </form>

          <p className="mt-10 text-center text-xs text-white/30">
            © {new Date().getFullYear()} 주식회사 에잇티. All rights reserved.
          </p>
        </section>
      </div>
    </div>
  );
}
