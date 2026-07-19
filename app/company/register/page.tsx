import { redirect } from "next/navigation";
import CompanyRegistrationForm from "@/components/auth/CompanyRegistrationForm";
import LogoutButton from "@/components/auth/LogoutButton";
import { getCurrentUserAccess } from "@/lib/crm/access";
import { createClient } from "@/lib/supabase-server";

function metadataText(
  metadata: Record<string, unknown>,
  key: string,
): string {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

export default async function CompanyRegistrationPage() {
  const access = await getCurrentUserAccess();

  if (!access.isAuthenticated) {
    redirect("/login");
  }

  if (access.canAccessErp) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const signupType = metadataText(metadata, "signup_type");

  // 직원 가입 계정이 회사 개설 화면을 직접 사용하는 것을 차단
  if (signupType !== "company_owner") {
    redirect("/pending-approval");
  }

  const companyName = metadataText(metadata, "company_name");
  const businessNumber = metadataText(metadata, "business_number");
  const representativeName =
    metadataText(metadata, "representative_name") ||
    metadataText(metadata, "full_name");

  return (
    <div className="login-gradient flex min-h-full flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="login-shell flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl lg:min-h-[620px] lg:flex-row">
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
            새로운 회사 시작하기
          </p>

          <p className="mt-6 max-w-xs text-xs leading-relaxed text-white/40 sm:text-sm">
            회사별로 데이터와 권한이 완전히 분리된
            <br />
            독립적인 ERP 업무공간을 생성합니다.
          </p>
        </section>

        <section className="login-card flex flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:px-14 lg:py-16">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white sm:text-2xl">
              회사정보 등록
            </h2>

            <p className="mt-1 text-sm text-white/50">
              회사 개설 후 바로 대표 계정으로 ERP를 시작할 수 있습니다.
            </p>

            {user.email && (
              <p className="mt-2 text-xs text-white/35">
                가입 계정: {user.email}
              </p>
            )}
          </div>

          <CompanyRegistrationForm
            initialCompanyName={companyName}
            initialBusinessNumber={businessNumber}
            initialRepresentativeName={representativeName}
          />

          <div className="mt-6 flex justify-center">
            <LogoutButton className="rounded-lg border border-white/20 px-4 py-2.5 text-sm text-white hover:bg-white/5" />
          </div>
        </section>
      </div>
    </div>
  );
}