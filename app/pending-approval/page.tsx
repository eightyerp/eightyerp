import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/auth/LogoutButton";
import { getCurrentUserAccess } from "@/lib/crm/access";
import { createClient } from "@/lib/supabase-server";

type Props = {
  searchParams: Promise<{ registered?: string }>;
};

export default async function PendingApprovalPage({ searchParams }: Props) {
  const query = await searchParams;
  const justRegistered = query.registered === "1";
  const access = await getCurrentUserAccess();

  if (access.canAccessErp) {
    redirect("/dashboard");
  }

  if (!access.isAuthenticated && !justRegistered) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profile = access.profile;
  const status = access.approvalStatus ?? "pending";
  const displayName =
    profile?.full_name ||
    profile?.employees?.name ||
    user?.email ||
    "신청자";

  let title = "관리자 승인 대기 중입니다";
  let description =
    "회원가입이 접수되었습니다. 대표이사 또는 이사가 승인하면 ERP를 이용할 수 있습니다.";
  let tone = "border-amber-400/30 bg-amber-500/10 text-amber-100";

  if (status === "rejected") {
    title = "가입이 거절되었습니다";
    description =
      profile?.rejection_reason?.trim() ||
      "관리자에게 문의해 주세요. 거절된 계정으로는 ERP에 접근할 수 없습니다.";
    tone = "border-red-400/30 bg-red-500/10 text-red-100";
  } else if (profile && profile.is_active === false && status === "approved") {
    title = "계정이 비활성화되었습니다";
    description =
      "관리자가 이 계정을 비활성화했습니다. ERP에 접근할 수 없습니다.";
    tone = "border-red-400/30 bg-red-500/10 text-red-100";
  }

  return (
    <div className="login-gradient flex min-h-full flex-1 items-center justify-center px-4 py-8">
      <div className="login-shell w-full max-w-lg rounded-2xl px-6 py-10 sm:px-10">
        <div className="text-center">
          <p className="text-sm tracking-[0.2em] text-gold-400">EIGHTY ERP</p>
          <h1 className="mt-4 text-xl font-semibold text-white sm:text-2xl">
            {title}
          </h1>
          {access.isAuthenticated && (
            <p className="mt-2 text-sm text-white/60">{displayName} 님</p>
          )}
        </div>

        <div className={`mt-8 rounded-xl border px-4 py-4 text-sm ${tone}`}>
          <p>{description}</p>
          {justRegistered && !access.isAuthenticated && (
            <p className="mt-3 text-xs opacity-80">
              이메일 확인이 필요한 설정인 경우, 메일 확인 후 로그인해 주세요.
              로그인해도 승인 전에는 이 안내만 표시됩니다.
            </p>
          )}
          {user?.email && (
            <p className="mt-3 text-xs opacity-80">계정: {user.email}</p>
          )}
          {profile?.phone && (
            <p className="mt-1 text-xs opacity-80">연락처: {profile.phone}</p>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {access.isAuthenticated ? (
            <LogoutButton className="rounded-lg border border-white/20 px-4 py-2.5 text-sm text-white hover:bg-white/5" />
          ) : null}
          <Link
            href="/login"
            className="rounded-lg bg-gold-500 px-4 py-2.5 text-center text-sm font-semibold text-navy-900 hover:bg-gold-400"
          >
            로그인 화면
          </Link>
        </div>
      </div>
    </div>
  );
}
