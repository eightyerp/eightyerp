"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase";

const TEAM_OPTIONS = ["경영", "인테리어", "창호", "기타"] as const;

export default function SignupForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const fullName = String(formData.get("full_name") ?? "").trim();
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const phone = String(formData.get("phone") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const passwordConfirm = String(formData.get("password_confirm") ?? "");
    const requestedTeam = String(formData.get("requested_team") ?? "").trim();

    if (!fullName || !email || !password) {
      setError("이름, 이메일, 비밀번호는 필수입니다.");
      setPending(false);
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      setPending(false);
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      setPending(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone,
            requested_team: requestedTeam || null,
            // 직급(requested_title)은 보내지 않음 — 승인 시 관리자가 지정
            // 클라이언트가 role을 넣어도 트리거가 staff/미승인으로 강제
            role: "staff",
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setPending(false);
        return;
      }

      if (!data.user) {
        setError("회원가입에 실패했습니다. 다시 시도해 주세요.");
        setPending(false);
        return;
      }

      window.location.assign("/pending-approval?registered=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원가입 오류");
      setPending(false);
    }
  }

  const inputClass =
    "input-field w-full rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="full_name" className="mb-1.5 block text-sm font-medium text-white/70">
          이름 *
        </label>
        <input
          id="full_name"
          name="full_name"
          required
          autoComplete="name"
          placeholder="홍길동"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-white/70">
          이메일 *
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="name@company.com"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-white/70">
          연락처
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="010-0000-0000"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-white/70">
          비밀번호 *
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="8자 이상"
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor="password_confirm"
          className="mb-1.5 block text-sm font-medium text-white/70"
        >
          비밀번호 확인 *
        </label>
        <input
          id="password_confirm"
          name="password_confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor="requested_team"
          className="mb-1.5 block text-sm font-medium text-white/70"
        >
          희망 팀 <span className="text-white/40">(참고)</span>
        </label>
        <select
          id="requested_team"
          name="requested_team"
          className={inputClass}
          defaultValue=""
        >
          <option value="">선택 안 함</option>
          {TEAM_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs leading-relaxed text-white/40">
        팀·직급·역할은 관리자 승인 시 확정됩니다. 가입만으로는 ERP에 접근할 수
        없습니다.
      </p>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-login mt-1 w-full rounded-lg py-3.5 text-sm font-semibold tracking-wide text-navy-900 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "가입 중..." : "회원가입 신청"}
      </button>

      <p className="text-center text-sm text-white/50">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="text-gold-400 hover:text-gold-500">
          로그인
        </Link>
      </p>
    </form>
  );
}
