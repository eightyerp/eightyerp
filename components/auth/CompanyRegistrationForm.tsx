"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";

type CompanyRegistrationFormProps = {
  initialCompanyName?: string;
  initialBusinessNumber?: string;
  initialRepresentativeName?: string;
};

export default function CompanyRegistrationForm({
  initialCompanyName = "",
  initialBusinessNumber = "",
  initialRepresentativeName = "",
}: CompanyRegistrationFormProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const companyName = String(formData.get("company_name") ?? "").trim();
    const businessNumber = String(
      formData.get("business_number") ?? "",
    ).trim();
    const representativeName = String(
      formData.get("representative_name") ?? "",
    ).trim();

    const businessNumberDigits = businessNumber.replace(/[^0-9]/g, "");

    if (companyName.length < 2) {
      setError("회사명을 2자 이상 입력해 주세요.");
      setPending(false);
      return;
    }

    if (businessNumberDigits.length !== 10) {
      setError("사업자번호 10자리를 정확히 입력해 주세요.");
      setPending(false);
      return;
    }

    if (representativeName.length < 2) {
      setError("대표자명을 2자 이상 입력해 주세요.");
      setPending(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data, error: registrationError } = await supabase.rpc(
        "register_my_company",
        {
          p_company_name: companyName,
          p_business_number: businessNumberDigits,
          p_representative_name: representativeName,
        },
      );

      if (registrationError) {
        setError(
          registrationError.message ||
            "회사 개설 중 오류가 발생했습니다.",
        );
        setPending(false);
        return;
      }

      if (!Array.isArray(data) || data.length !== 1) {
        setError("회사 개설 결과를 확인하지 못했습니다.");
        setPending(false);
        return;
      }

      // 새 회사와 owner 멤버십이 모두 생성된 후 ERP로 이동
      window.location.assign("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "회사 개설 중 오류가 발생했습니다.",
      );
      setPending(false);
    }
  }

  const inputClass =
    "input-field w-full rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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
          required
          minLength={2}
          maxLength={100}
          autoComplete="organization"
          defaultValue={initialCompanyName}
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
          required
          inputMode="numeric"
          autoComplete="off"
          defaultValue={initialBusinessNumber}
          placeholder="000-00-00000"
          className={inputClass}
        />
        <p className="mt-1.5 text-xs leading-relaxed text-white/35">
          숫자 10자리를 입력하세요. 이미 등록된 사업자번호는 다시 사용할 수
          없습니다.
        </p>
      </div>

      <div>
        <label
          htmlFor="representative_name"
          className="mb-1.5 block text-sm font-medium text-white/70"
        >
          대표자명 *
        </label>
        <input
          id="representative_name"
          name="representative_name"
          required
          minLength={2}
          maxLength={50}
          autoComplete="name"
          defaultValue={initialRepresentativeName}
          placeholder="대표자 이름"
          className={inputClass}
        />
      </div>

      <div className="rounded-lg border border-gold-400/20 bg-gold-500/5 px-3 py-3 text-xs leading-relaxed text-white/50">
        <p>
          회사 개설을 완료한 계정은 해당 회사의 최초 소유자(owner)가 됩니다.
        </p>
        <p className="mt-1">
          기존 회사에 직원으로 가입하려면 회사에서 발급한 초대 링크를 이용해야
          합니다.
        </p>
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
        {pending ? "회사 개설 중..." : "회사 개설하고 시작하기"}
      </button>
    </form>
  );
}