import Link from "next/link";
import SignupForm from "@/components/auth/SignupForm";
import { getCompanyEmployeeInvitation } from "@/lib/crm/company-employee-invitations";
import { getSupabasePublicMeta } from "@/lib/supabase-env";

type Props = {
  searchParams: Promise<{ invite?: string }>;
};

const INVITE_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function SignupPage({ searchParams }: Props) {
  const meta = getSupabasePublicMeta();
  const params = await searchParams;
  const rawInvite = params.invite?.trim().toLowerCase() ?? "";
  const hasInviteParam = Boolean(params.invite?.trim());
  const inviteToken = INVITE_TOKEN_PATTERN.test(rawInvite)
    ? rawInvite
    : "";

  let inviteInvalid = hasInviteParam && !inviteToken;
  let invitation = null;

  if (inviteToken) {
    try {
      invitation = await getCompanyEmployeeInvitation(inviteToken);
      if (!invitation) {
        inviteInvalid = true;
      }
    } catch {
      inviteInvalid = true;
    }
  }

  const isCompanyInvite = Boolean(invitation && inviteToken);

  const title = inviteInvalid
    ? "초대 링크 확인"
    : isCompanyInvite
      ? "직원 가입"
      : "회사 대표 가입";

  const subtitle = inviteInvalid
    ? "초대 링크를 다시 확인해 주세요"
    : isCompanyInvite
      ? "초대를 통해 회사에 직원으로 가입합니다"
      : "가입 후 회사정보를 확인하면 바로 ERP를 시작할 수 있습니다";

  const brandCaption = inviteInvalid
    ? "직원 초대"
    : isCompanyInvite
      ? "직원 가입"
      : "회사 대표 가입";

  const brandDescription = inviteInvalid
    ? "유효한 초대 링크로만 직원 가입이 가능합니다."
    : isCompanyInvite
      ? "초대 링크로 가입하면 별도 승인 없이 바로 ERP를 이용할 수 있습니다."
      : "회사정보 등록 후 독립적인 ERP 업무공간을 바로 시작합니다.";

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
            {brandCaption}
          </p>
          <p className="mt-6 max-w-xs text-xs leading-relaxed text-white/40 sm:text-sm">
            {brandDescription}
          </p>
        </section>

        <section className="login-card flex flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:px-14 lg:py-16">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white sm:text-2xl">
              {title}
            </h2>
            <p className="mt-1 text-sm text-white/50">{subtitle}</p>
          </div>

          {!meta.configured && meta.configError ? (
            <div className="mb-5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              <p className="font-medium">Supabase 환경 변수가 필요합니다</p>
              <p className="mt-1 text-xs text-amber-200/80">
                {meta.configError}
              </p>
            </div>
          ) : null}

          {inviteInvalid ? (
            <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-4 text-sm text-red-200">
              <p className="font-medium">
                유효하지 않거나 만료된 직원 초대 링크입니다
              </p>
              <p className="mt-2 text-xs text-red-200/80">
                회사 관리자에게 새 초대 링크를 요청해 주세요.
              </p>
            </div>
          ) : isCompanyInvite && invitation ? (
            <>
              <div className="mb-5 rounded-lg border border-gold-400/20 bg-gold-500/5 px-4 py-3 text-sm text-white/70">
                <p>
                  <span className="text-white/45">회사</span>{" "}
                  <span className="font-medium text-white">
                    {invitation.company_name}
                  </span>
                </p>
                <p className="mt-1.5">
                  <span className="text-white/45">기본 직급</span>{" "}
                  <span className="font-medium text-white">
                    {invitation.default_title}
                  </span>
                </p>
                <p className="mt-1.5">
                  <span className="text-white/45">팀</span>{" "}
                  <span className="font-medium text-white">
                    {invitation.team_name || "팀 미지정"}
                  </span>
                </p>
                <p className="mt-1.5">
                  <span className="text-white/45">만료일</span>{" "}
                  <span className="font-medium text-white">
                    {dateFormatter.format(new Date(invitation.expires_at))}
                  </span>
                </p>
              </div>
              <SignupForm inviteToken={inviteToken} />
            </>
          ) : (
            <SignupForm />
          )}

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
