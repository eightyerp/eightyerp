import Link from "next/link";
import CrmNewCustomerForm from "@/components/crm/CrmNewCustomerForm";
import { getCurrentUserAccess } from "@/lib/crm/access";
import { getEmployees, getLeadSources } from "@/lib/crm/customers";

export default async function CrmNewCustomerPage() {
  // 유입경로는 인증 확인과 동시에 시작하고, 직원목록은 관리자에게만 필요하다.
  const accessPromise = getCurrentUserAccess();
  const leadSourcesPromise = getLeadSources();
  const access = await accessPromise;
  const employeesPromise = access.isAdmin ? getEmployees() : Promise.resolve([]);
  const [employees, leadSources] = await Promise.all([
    employeesPromise,
    leadSourcesPromise,
  ]);

  return (
    <div className="space-y-5">
      <section>
        <Link href="/crm/customers" className="text-xs font-bold text-slate-500">
          ← 고객목록
        </Link>
        <p className="mt-4 text-xs font-semibold text-slate-500">빠른 접수</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
          신규 고객 등록
        </h1>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          현장에서 필요한 정보만 먼저 등록하고 상담·일정은 고객 상세에서 이어서 처리합니다.
        </p>
      </section>

      <CrmNewCustomerForm
        employees={employees}
        leadSources={leadSources}
        defaultAssignedEmployeeId={access.profile?.employee_id ?? null}
        canChangeAssignee={access.isAdmin}
      />
    </div>
  );
}
