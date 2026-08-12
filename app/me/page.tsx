import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import MyProfileWorkspace from "@/components/profile/MyProfileWorkspace";
import { getCurrentUserAccess } from "@/lib/crm/access";
import { getMyProfileData } from "@/lib/crm/my-profile";

export default async function MyProfilePage() {
  const access = await getCurrentUserAccess();

  if (!access.isAuthenticated) redirect("/login");
  if (!access.canAccessErp) redirect("/pending-approval");

  let profile;
  try {
    profile = await getMyProfileData();
  } catch (error) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <p className="text-sm font-semibold text-slate-700">내 계정</p>
            <h1 className="mt-0.5 text-2xl font-bold text-slate-950">내 정보</h1>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-semibold leading-relaxed text-red-800">
            {error instanceof Error
              ? error.message
              : "내 정보를 불러오지 못했습니다."}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-slate-700">내 계정</p>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-950">내 정보</h1>
          <p className="mt-2 max-w-4xl text-[15px] leading-relaxed text-slate-700">
            고객과 견적서에 사용하는 내 연락처와 명함을 직접 관리합니다. 회사에서 관리하는 소속·직책·권한은 확인만 할 수 있습니다.
          </p>
        </div>

        <MyProfileWorkspace profile={profile} />
      </div>
    </DashboardLayout>
  );
}
