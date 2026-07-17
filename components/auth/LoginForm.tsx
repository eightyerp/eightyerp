"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

type AuthErrorView = {
  message: string;
  status: number | string | null;
  code?: string | null;
  name?: string;
};

function stripAuthErrorParams() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const error = url.searchParams.get("error");
  const errorCode = url.searchParams.get("error_code");

  if (
    error === "access_denied" ||
    errorCode === "otp_expired" ||
    url.searchParams.has("error_description")
  ) {
    url.search = "";
    window.history.replaceState({}, "", url.pathname);
  }
}

export default function LoginForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AuthErrorView | null>(null);

  useEffect(() => {
    stripAuthErrorParams();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      setError({
        message: "이메일과 비밀번호를 입력해 주세요.",
        status: null,
      });
      setPending(false);
      return;
    }

    console.info("[login] signInWithPassword", {
      email,
      passwordLength: password.length,
    });

    try {
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword(
        {
          email,
          password,
        },
      );

      if (signInError) {
        const code = (signInError as { code?: string }).code ?? null;
        console.error("[login] Supabase auth error", {
          message: signInError.message,
          status: signInError.status,
          name: signInError.name,
          code,
        });
        setError({
          message: signInError.message,
          status: signInError.status ?? null,
          code,
          name: signInError.name,
        });
        setPending(false);
        return;
      }

      if (!data.session) {
        console.error("[login] success response without session", {
          userId: data.user?.id ?? null,
        });
        setError({
          message: "로그인에 성공했지만 세션이 생성되지 않았습니다.",
          status: null,
        });
        setPending(false);
        return;
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        console.error("[login] session persistence failed", {
          message: sessionError?.message ?? "no session after sign-in",
          status: sessionError?.status ?? null,
        });
        setError({
          message:
            sessionError?.message ??
            "세션 쿠키 저장에 실패했습니다. 브라우저 쿠키 설정을 확인해 주세요.",
          status: sessionError?.status ?? null,
        });
        setPending(false);
        return;
      }

      console.info("[login] success", {
        userId: data.user?.id,
        expiresAt: data.session.expires_at,
      });

      // Full navigation ensures middleware/proxy reads freshly set auth cookies.
      window.location.assign("/dashboard");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "알 수 없는 로그인 오류";
      console.error("[login] unexpected error", err);
      setError({ message, status: null });
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-sm font-medium text-white/70"
        >
          이메일
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="이메일을 입력하세요"
          autoComplete="email"
          required
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
          name="password"
          type="password"
          placeholder="비밀번호를 입력하세요"
          autoComplete="current-password"
          required
          className="input-field w-full rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-white/60">
          <input
            type="checkbox"
            name="rememberMe"
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

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <p className="font-medium">{error.message}</p>
          <p className="mt-1 text-xs text-red-300/80">
            status: {error.status ?? "-"}
            {error.code ? ` · code: ${error.code}` : ""}
            {error.name ? ` · ${error.name}` : ""}
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-login mt-2 w-full rounded-lg py-3.5 text-sm font-semibold tracking-wide text-navy-900 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "로그인 중..." : "로그인"}
      </button>
    </form>
  );
}
