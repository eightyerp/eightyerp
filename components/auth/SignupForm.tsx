"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase";

type SignupFormProps = {
  inviteToken?: string;
};

export default function SignupForm({
  inviteToken = "",
}: SignupFormProps) {
  const router = useRouter();
  const isCompanyInvite = Boolean(inviteToken);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailConfirmationNeeded, setEmailConfirmationNeeded] =
    useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);

    const companyName = String(
      formData.get("company_name") ?? "",
    ).trim();

    const businessNumber = String(
      formData.get("business_number") ?? "",
    ).trim();

    const representativeName = String(
      formData.get("representative_name") ?? "",
    ).trim();

    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();

    const phone = String(formData.get("phone") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const passwordConfirm = String(
      formData.get("password_confirm") ?? "",
    );

    const businessNumberDigits = businessNumber.replace(/[^0-9]/g, "");

    if (!isCompanyInvite && companyName.length < 2) {
      setError("회사명을 2자 이상 입력해 주세요.");
      setPending(false);
      return;
    }

    if (!isCompanyInvite && businessNumberDigits.length !== 10) {
      setError("사업자번호 10자리를 정확히 입력해 주세요.");
      setPending(false);
      return;
    }

    if (representativeName.length < 2) {
      setError(
        isCompanyInvite
          ? "이름을 2자 이상 입력해 주세요."
          : "대표자명을 2자 이상 입력해 주세요.",
      );
      setPending(false);
      return;
    }

    if (!email || !password) {
      setError("이메일과 비밀번호는 필수입니다.");
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
            signup_type: isCompanyInvite
              ? "company_invite"
              : "company_owner",
            invite_token: isCompanyInvite ? inviteToken : null,
            company_name: isCompanyInvite ? null : companyName,
            business_number: isCompanyInvite
              ? null
              : businessNumberDigits,
            representative_name: representativeName,
            full_name: representativeName,
            phone,
            // 전역 역할은 초대 가입과 대표 가입 모두 최소 권한으로 유지
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

      if (data.session) {
        // 이메일 확인이 필요 없는 환경
        router.replace(isCompanyInvite ? "/dashboard" : "/company/register");
        return;
      }

      if (isCompanyInvite) {
        // 직원 초대: 관리자 승인 대기 안내 없이 이메일 확인만 안내
        setEmailConfirmationNeeded(true);
        setPending(false);
        return;
      }

      // 이메일 확인이 필요한 환경: 확인 후 로그인하면 회사 개설로 이동
      router.replace("/pending-approval?registered=1&company=1");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "회원가입 중 오류가 발생했습니다.",
      );
      setPending(false);
    }
  }

  const inputClass =
    "input-field w-full rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30";

  if (emailConfirmationNeeded) {
    return (
      <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-100">
        <p className="font-medium">가입 신청이 완료되었습니다</p>
        <p className="mt-2 text-xs leading-relaxed text-emerald-100/80">
          가입한 이메일의 확인 링크를 누른 뒤 로그인해 주세요. 이메일
          확인이 끝나면 별도 승인 없이 ERP를 바로 이용할 수 있습니다.
        </p>
        <p className="mt-4 text-center text-sm text-white/50">
          <Link
            href="/login"
            className="text-gold-400 hover:text-gold-500"
          >
            로그인 화면으로 이동
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <fieldset
        disabled={isCompanyInvite}
        className={isCompanyInvite ? "hidden" : "contents"}
      >
        <div>
          <label
            htmlFor="company_name"
            className="mb-1.5 block text-sm font-medium text-white/70"
          >
            회사명 *
          </label>
          <input
            id="company_name"
            name="company_name"
            required={!isCompanyInvite}
            minLength={2}
            maxLength={100}
            autoComplete="organization"
            placeholder="예: 주식회사 에이비씨"
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="business_number"
            className="mb-1.5 block text-sm font-medium text-white/70"
          >
            사업자등록번호 *
          </label>
          <input
            id="business_number"
            name="business_number"
            required={!isCompanyInvite}
            inputMode="numeric"
            autoComplete="off"
            placeholder="000-00-00000"
            className={inputClass}
          />
        </div>
      </fieldset>

      <div>
        <label
          htmlFor="representative_name"
          className="mb-1.5 block text-sm font-medium text-white/70"
        >
          {isCompanyInvite ? "이름 *" : "대표자명 *"}
        </label>
        <input
          id="representative_name"
          name="representative_name"
          required
          minLength={2}
          maxLength={50}
          autoComplete="name"
          placeholder={isCompanyInvite ? "직원 이름" : "대표자 이름"}
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-sm font-medium text-white/70"
        >
          {isCompanyInvite ? "이메일 *" : "대표 계정 이메일 *"}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={
            isCompanyInvite ? "you@company.com" : "owner@company.com"
          }
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor="phone"
          className="mb-1.5 block text-sm font-medium text-white/70"
        >
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
        <label
          htmlFor="password"
          className="mb-1.5 block text-sm font-medium text-white/70"
        >
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

      <div className="rounded-lg border border-gold-400/20 bg-gold-500/5 px-3 py-3 text-xs leading-relaxed text-white/45">
        {isCompanyInvite ? (
          <p>
            초대로 가입하면 별도 관리자 승인 없이 회사에 직원으로
            연결되며, 바로 ERP를 이용할 수 있습니다.
          </p>
        ) : (
          <>
            <p>
              가입 후 회사정보를 확인하면 대표 계정과 독립적인 ERP
              업무공간이 즉시 생성됩니다.
            </p>
            <p className="mt-1">
              직원은 회사 개설 후 발급되는 전용 초대 링크로 가입합니다.
            </p>
          </>
        )}
      </div>

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
        {pending
          ? "가입 중..."
          : isCompanyInvite
            ? "직원으로 가입하기"
            : "회사 대표로 가입하기"}
      </button>

      <p className="text-center text-sm text-white/50">
        이미 계정이 있으신가요?{" "}
        <Link
          href="/login"
          className="text-gold-400 hover:text-gold-500"
        >
          로그인
        </Link>
      </p>
    </form>
  );
}
