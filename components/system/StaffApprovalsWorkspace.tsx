"use client";

import { useActionState, useState } from "react";
import {
  approveSignupAction,
  deactivateUserAction,
  rejectSignupAction,
  type StaffApprovalResult,
} from "@/app/actions/staff-approvals";
import { formatEmployeeOptionLabel, ROLE_LABEL } from "@/lib/crm/constants";
import { findSuggestedEmployee } from "@/lib/crm/employee-master-shared";
import type { PendingSignup } from "@/lib/crm/staff-approvals";
import type { Employee, Team, UserRole } from "@/types/database";

type Props = {
  pending: PendingSignup[];
  allProfiles: PendingSignup[];
  employees: Array<Employee & { login_linked?: boolean }>;
  teams: Team[];
  assignableRoles: UserRole[];
};

const initial: StaffApprovalResult = { success: false };

export default function StaffApprovalsWorkspace({ pending, allProfiles, employees, teams, assignableRoles }: Props) {
  const [target, setTarget] = useState<PendingSignup | null>(null);
  const [approveState, approveAction, approvePending] = useActionState(
    async (prev: StaffApprovalResult, formData: FormData) => {
      const result = await approveSignupAction(prev, formData);
      if (result.success) setTarget(null);
      return result;
    },
    initial,
  );
  const [, rejectAction, rejectPending] = useActionState(rejectSignupAction, initial);
  const [, deactivateAction, deactivatePending] = useActionState(deactivateUserAction, initial);

  return (
    <section className="dashboard-card p-5 text-slate-900">
      <h2 className="font-semibold text-slate-900">가입 승인</h2>
      <p className="mt-1 text-xs text-slate-600">직원 정보 수정은 직원 Master 상세에서만 수행합니다. 이 화면은 기존 직원 연결과 승인만 처리합니다.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b text-xs text-slate-600"><tr><th className="p-2">가입자</th><th className="p-2">연락처</th><th className="p-2">자동 검색</th><th className="p-2">처리</th></tr></thead>
          <tbody>
            {pending.map((profile) => {
              const suggestion = findSuggestedEmployee(profile, employees, teams);
              return <tr key={profile.id} className="border-b border-slate-100 transition-colors hover:bg-slate-100">
                <td className="p-2 font-medium text-slate-900">{profile.full_name ?? "-"}<p className="text-xs font-normal text-slate-600">{profile.email}</p></td>
                <td className="p-2 text-slate-900">{profile.phone ?? "-"}<p className="text-xs text-slate-600">{profile.requested_team ?? "-"}</p></td>
                <td className="p-2">{suggestion ? `${formatEmployeeOptionLabel(suggestion.employee)} · ${suggestion.matchedBy === "email" ? "이메일" : suggestion.matchedBy === "phone" ? "전화" : "이름+팀"}` : "후보 없음"}</td>
                <td className="p-2"><div className="flex gap-2"><button type="button" onClick={() => setTarget(profile)} className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white">기존 직원 연결</button><form action={rejectAction}><input type="hidden" name="user_id" value={profile.id} /><button disabled={rejectPending} className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 disabled:opacity-75">거절</button></form></div></td>
              </tr>;
            })}
            {pending.length === 0 ? <tr><td colSpan={4} className="p-8 text-center text-slate-600">가입 승인 대기가 없습니다.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <details className="mt-5 border-t pt-4">
        <summary className="cursor-pointer text-sm font-medium">로그인 계정 현황 ({allProfiles.length})</summary>
        <div className="mt-3 space-y-2">{allProfiles.map((profile) => <div key={profile.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm text-slate-900"><span className="font-medium">{profile.full_name ?? profile.email} · {ROLE_LABEL[profile.role] ?? profile.role} · {profile.approval_status}</span>{profile.is_active && profile.approval_status === "approved" ? <form action={deactivateAction}><input type="hidden" name="user_id" value={profile.id} /><button disabled={deactivatePending} className="text-xs font-medium text-red-700 disabled:opacity-75">비활성화</button></form> : null}</div>)}</div>
      </details>

      {target ? <ApprovalModal profile={target} employees={employees} teams={teams} assignableRoles={assignableRoles} action={approveAction} pending={approvePending} error={approveState.error} onClose={() => setTarget(null)} /> : null}
    </section>
  );
}

function ApprovalModal({ profile, employees, teams, assignableRoles, action, pending, error, onClose }: {
  profile: PendingSignup;
  employees: Array<Employee & { login_linked?: boolean }>;
  teams: Team[];
  assignableRoles: UserRole[];
  action: (data: FormData) => void;
  pending: boolean;
  error?: string;
  onClose: () => void;
}) {
  const suggestion = findSuggestedEmployee(profile, employees, teams);
  const available = employees.filter(
    (employee) =>
      employee.is_active &&
      !employee.merged_into_employee_id &&
      !employee.login_linked,
  );
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-md rounded-xl bg-white p-5 text-slate-900 shadow-xl">
    <h3 className="font-semibold text-slate-900">가입 승인 및 기존 직원 연결</h3>
    <p className="mt-1 text-sm text-slate-600">{profile.full_name ?? profile.email}</p>
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="user_id" value={profile.id} /><input type="hidden" name="mode" value="link" />
      <label className="block text-sm font-medium">직원 Master<select name="employee_id" required defaultValue={suggestion?.employee.id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"><option value="">선택</option>{available.map((employee) => <option key={employee.id} value={employee.id}>{formatEmployeeOptionLabel(employee)}</option>)}</select></label>
      <label className="block text-sm font-medium">권한<select name="role" defaultValue="staff" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900">{assignableRoles.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}</select></label>
      <p className="text-xs text-slate-600">이 화면에서는 직원 이름·팀·직책·연락처를 수정하지 않습니다.</p>
      <div className="flex gap-2"><button disabled={pending} className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-75">승인</button><button type="button" onClick={onClose} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900">닫기</button></div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  </div></div>;
}
