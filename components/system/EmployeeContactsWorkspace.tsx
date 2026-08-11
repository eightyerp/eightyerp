"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  analyzeEmployeeMergeAction,
  linkEmployeeLoginAction,
  mergeEmployeesAction,
  saveEmployeeMasterAction,
  transferEmployeeAssignmentsAction,
  unlinkEmployeeLoginAction,
} from "@/app/actions/employee-contacts";
import { formatEmployeeLabel, ROLE_LABEL } from "@/lib/crm/constants";
import type {
  EmployeeMaster,
  EmployeeMasterEvent,
  EmployeeMergeImpact,
  EmployeeMergeResult,
} from "@/lib/crm/employee-contacts";
import type { Profile, Team } from "@/types/database";

type Props = {
  employees: EmployeeMaster[];
  teams: Team[];
  currentEmployeeId: string | null;
  canManageAll: boolean;
  canMergeEmployees: boolean;
  canManageLoginAccounts: boolean;
  canAssignAdminRole: boolean;
  pendingAccounts?: Profile[];
  events?: EmployeeMasterEvent[];
};

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("ko-KR") : "로그인 기록 없음";
}

function employeeMasterLabel(employee: EmployeeMaster, teams: Team[]): string {
  const team = teams.find((item) => item.id === employee.team_id);
  return formatEmployeeLabel(employee.name, employee.title, team?.name);
}

export default function EmployeeContactsWorkspace({
  employees,
  teams,
  currentEmployeeId,
  canManageAll,
  canMergeEmployees,
  canManageLoginAccounts,
  canAssignAdminRole,
  pendingAccounts = [],
  events = [],
}: Props) {
  const [selected, setSelected] = useState<EmployeeMaster | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeImpact, setMergeImpact] = useState<EmployeeMergeImpact | null>(null);
  const [keepProfileId, setKeepProfileId] = useState("");
  const [otherLoginAction, setOtherLoginAction] = useState<"unlink" | "deactivate">("unlink");
  const [mergeReport, setMergeReport] = useState<EmployeeMergeResult | null>(null);
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
  const [mergeReportContext, setMergeReportContext] = useState<{ sourceName: string; targetName: string; businessTotal: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const accessibleEmployees = canManageAll
    ? employees
    : employees.filter((employee) => employee.id === currentEmployeeId);
  const activeEmployees = accessibleEmployees.filter(
    (employee) => employee.is_active && !employee.merged_into_employee_id,
  );
  const archivedEmployees = accessibleEmployees.filter(
    (employee) => !employee.is_active || Boolean(employee.merged_into_employee_id),
  );
  const listEmployees = showArchived ? archivedEmployees : activeEmployees;
  const needle = searchQuery.trim().toLowerCase();
  const visibleEmployees = needle
    ? listEmployees.filter((employee) => {
        const team = teams.find((item) => item.id === employee.team_id);
        return [employee.name, employee.title, employee.phone, employee.email, employee.login_email, team?.name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
    : listEmployees;

  function run(action: () => Promise<{ success: boolean; error?: string }>, success: string) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        setMessage(success);
        setSelected(null);
        setCreating(false);
        window.location.reload();
      } else {
        setError(result.error ?? "처리에 실패했습니다.");
      }
    });
  }

  return (
    <section className="dashboard-card overflow-hidden text-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 p-5">
        <div>
          <h2 className="font-semibold text-slate-900">
            {showArchived ? "병합/보관 직원" : "직원 목록"}
          </h2>
          <p className="text-xs text-slate-600">총 {visibleEmployees.length}명</p>
        </div>
        {canManageAll ? (
          <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setShowArchived((value) => !value);
              setSelected(null);
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800"
          >
            {showArchived
              ? `활성 직원 보기 (${activeEmployees.length})`
              : `병합/보관 직원 보기 (${archivedEmployees.length})`}
          </button>
          {canMergeEmployees ? <button type="button" onClick={() => { setMergeOpen(true); setMergeImpact(null); setMergeReport(null); setError(null); }} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900">
            직원 병합
          </button> : null}
          <button
            type="button"
            onClick={() => { setCreating(true); setSelected(null); setError(null); }}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            새 직원 생성
          </button>
          </div>
        ) : null}
      </div>

      <div className="border-b border-slate-200 bg-slate-50 p-4">
        <label className="block max-w-md text-sm font-medium text-slate-900">
          직원 검색
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="이름, 팀, 직책, 전화, 이메일" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400" />
        </label>
      </div>

      {message ? <p className="m-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}
      {error && !selected && !creating ? <p className="m-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-4 py-3">직원·팀·직급</th><th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">연락처</th><th className="px-4 py-3">로그인</th>
              <th className="px-4 py-3">권한</th><th className="px-4 py-3">마지막 로그인</th>
              <th className="px-4 py-3 text-center">고객</th><th className="px-4 py-3 text-center">견적</th>
              <th className="px-4 py-3 text-center">일정</th>
            </tr>
          </thead>
          <tbody>
            {visibleEmployees.map((employee) => {
              return (
                <tr key={employee.id} className="border-t border-slate-100 transition-colors hover:bg-slate-100">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => { setSelected(employee); setCreating(false); setError(null); }} className="font-semibold text-navy-900 hover:underline">
                      {employeeMasterLabel(employee, teams)}
                    </button>
                  </td>
                  <td className={`px-4 py-3 text-xs font-medium ${employee.is_active && !employee.merged_into_employee_id ? "text-emerald-700" : "text-slate-600"}`}>{employee.merged_into_employee_id ? "병합됨" : employee.is_active ? "활성" : "비활성"}</td>
                  <td className="px-4 py-3"><p>{employee.phone ?? "-"}</p><p className="text-xs text-slate-600">{employee.email ?? "-"}</p></td>
                  <td className="px-4 py-3">{employee.login_linked ? (employee.login_active ? "연결" : "비활성 계정") : "미연결"}</td>
                  <td className="px-4 py-3">{employee.role ? ROLE_LABEL[employee.role as keyof typeof ROLE_LABEL] ?? employee.role : "-"}</td>
                  <td className="px-4 py-3 text-xs">{formatDateTime(employee.last_sign_in_at)}</td>
                  <td className="px-4 py-3 text-center"><Link className="font-semibold text-navy-800 hover:underline" href={`/customers?employeeId=${employee.id}`}>{employee.customer_count}</Link></td>
                  <td className="px-4 py-3 text-center"><Link className="font-semibold text-navy-800 hover:underline" href={`/quotes?employeeId=${employee.id}`}>{employee.quote_count}</Link></td>
                  <td className="px-4 py-3 text-center"><Link className="font-semibold text-navy-800 hover:underline" href={`/schedules/customers?employeeId=${employee.id}`}>{employee.schedule_count}</Link></td>
                </tr>
              );
            })}
            {visibleEmployees.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-600">
                  {showArchived
                    ? "병합되거나 보관된 직원이 없습니다."
                    : "표시할 활성 직원이 없습니다."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {(selected || creating) ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 text-slate-900 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">{creating ? "새 직원 생성" : `${selected?.name} 상세`}</h3>
            <form action={(formData) => run(() => saveEmployeeMasterAction(formData), "직원 Master를 저장했습니다." )} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="employee_id" value={selected?.id ?? ""} />
              <input type="hidden" name="original_login_role" value={selected?.role ?? ""} />
              <label className="text-sm font-medium">이름<input name="name" required defaultValue={selected?.name ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" /></label>
              <label className="text-sm font-medium">팀<select name="team_id" defaultValue={selected?.team_id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"><option value="">미지정</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
              <label className="text-sm font-medium">직책<input name="title" required defaultValue={selected?.title ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" /></label>
              <label className="text-sm font-medium">전화<input name="phone" defaultValue={selected?.phone ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" /></label>
              <label className="text-sm font-medium sm:col-span-2">이메일<input name="email" type="email" defaultValue={selected?.email ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" /></label>
              {selected ? <label className="text-sm font-medium">상태<select name="is_active" defaultValue={String(selected.is_active)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"><option value="true">활성</option><option value="false">비활성</option></select></label> : null}
              {selected?.login_linked && canManageLoginAccounts && selected.role !== "super_admin" ? <label className="text-sm font-medium">권한<select name="login_role" defaultValue={selected.role ?? "staff"} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"><option value="staff">직원</option><option value="manager">팀장</option>{canAssignAdminRole ? <option value="admin">관리자</option> : null}</select></label> : null}
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-75">저장</button>
                <button type="button" onClick={() => { setSelected(null); setCreating(false); }} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900">닫기</button>
              </div>
            </form>

            {selected && canManageLoginAccounts ? (
              <div className="mt-5 border-t pt-4">
                <h4 className="text-sm font-semibold">로그인 계정</h4>
                {selected.login_linked ? (
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm"><span>{selected.login_email} · {formatDateTime(selected.last_sign_in_at)}</span><button type="button" disabled={pending} onClick={() => { if (confirm("로그인 연결만 해제합니다. 기존 업무 데이터는 유지됩니다.")) run(() => unlinkEmployeeLoginAction(selected.id), "계정 연결을 해제했습니다."); }} className="text-red-700">연결 해제</button></div>
                ) : pendingAccounts.length > 0 ? (
                  <form action={(formData) => run(() => linkEmployeeLoginAction(formData), "로그인 계정을 연결했습니다.")} className="mt-2 flex flex-wrap gap-2">
                    <input type="hidden" name="employee_id" value={selected.id} />
                    <select name="user_id" required className="min-w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"><option value="">가입 계정 선택</option>{pendingAccounts.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name ?? profile.email ?? profile.id} · {profile.email}</option>)}</select>
                    <select name="role" defaultValue="staff" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"><option value="staff">직원</option><option value="manager">팀장</option>{canAssignAdminRole ? <option value="admin">관리자</option> : null}</select>
                    <button type="submit" disabled={pending} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-75">계정 연결</button>
                  </form>
                ) : <p className="mt-2 text-sm text-slate-600">연결 가능한 가입 대기 계정이 없습니다.</p>}
              </div>
            ) : null}
            {selected && canManageAll ? (
              <div className="mt-5 border-t pt-4">
                <h4 className="text-sm font-semibold">비활성화 영향 분석 및 담당업무 이전</h4>
                <p className="mt-1 text-sm text-slate-600">
                  현재 담당: 고객 {selected.customer_count}건 · 견적 {selected.quote_count}건 · 일정 {selected.schedule_count}건
                </p>
                {selected.customer_count + selected.quote_count + selected.schedule_count > 0 ? (
                  <form action={(formData) => {
                    const targetId = String(formData.get("target_employee_id") ?? "");
                    if (!targetId || !confirm("고객·견적·일정 담당자를 선택한 직원으로 일괄 이전합니다. 계속할까요?")) return;
                    run(() => transferEmployeeAssignmentsAction(selected.id, targetId), "담당 업무를 이전했습니다.");
                  }} className="mt-2 flex gap-2">
                    <select name="target_employee_id" required className="min-w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
                      <option value="">이전 대상 선택</option>
                      {employees.filter((employee) => employee.id !== selected.id && employee.is_active && !employee.merged_into_employee_id).map((employee) => <option key={employee.id} value={employee.id}>{employeeMasterLabel(employee, teams)}</option>)}
                    </select>
                    <button type="submit" disabled={pending} className="rounded-lg bg-amber-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-75">담당업무 일괄 이전</button>
                  </form>
                ) : <p className="mt-2 text-xs text-emerald-700">담당 업무가 없어 안전하게 비활성화할 수 있습니다.</p>}
              </div>
            ) : null}
            {selected?.role ? (
              <div className="mt-5 border-t pt-4">
                <h4 className="text-sm font-semibold">권한별 메뉴 미리보기</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(selected.role === "admin" || selected.role === "super_admin"
                    ? ["Dashboard", "고객", "견적", "일정", "자재", "계약", "직원 Master", "직원 초대"]
                    : selected.role === "manager"
                      ? ["Dashboard", "팀 고객", "팀 견적", "팀 일정", "자재", "계약", "내 연락처"]
                      : ["Dashboard", "내 고객", "내 견적", "내 일정", "자재", "내 연락처"]
                  ).map((menu) => <span key={menu} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-900">{menu}</span>)}
                </div>
              </div>
            ) : null}
            {selected ? (
              <div className="mt-5 border-t pt-4">
                <h4 className="text-sm font-semibold">직원 수정 이력</h4>
                <div className="mt-2 max-h-44 space-y-2 overflow-y-auto">
                  {events.filter((event) => event.employee_id === selected.id).map((event) => <div key={event.id} className="rounded-lg bg-slate-50 p-2 text-xs text-slate-900"><span className="font-medium">{event.event_type}</span><span className="ml-2 text-slate-600">{formatDateTime(event.created_at)}</span></div>)}
                  {events.every((event) => event.employee_id !== selected.id) ? <p className="text-xs text-slate-600">기록이 없습니다.</p> : null}
                </div>
              </div>
            ) : null}
            {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          </div>
        </div>
      ) : null}

      {mergeOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 text-slate-900 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">중복 직원 안전 병합</h3>
            <p className="mt-1 text-sm text-slate-600">유지할 직원과 비활성화할 중복 직원을 구분해 선택한 뒤 영향 분석을 확인하세요.</p>
            <div className="mt-3 rounded-lg border-2 border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">
              주의: 병합 실행 후에는 이 화면에서 되돌릴 수 없습니다. 중복 직원은 삭제되지 않지만 비활성화되고 모든 업무 참조가 기준 직원으로 이전됩니다.
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-950">기준 직원 · 유지됨
                <span className="mt-1 block text-xs font-normal text-emerald-800">직원 ID와 업무 데이터를 최종적으로 유지합니다.</span>
                <select value={mergeTargetId} onChange={(e) => { setMergeTargetId(e.target.value); setMergeImpact(null); setMergeReport(null); }} className="mt-2 w-full rounded-lg border border-emerald-400 bg-white px-3 py-2 text-slate-900">
                  <option value="">선택</option>
                  {employees.filter((e) => e.is_active && !e.merged_into_employee_id).map((e) => <option key={e.id} value={e.id}>{employeeMasterLabel(e, teams)}</option>)}
                </select>
              </label>
              <label className="rounded-xl border-2 border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-950">병합 직원 · 비활성화됨
                <span className="mt-1 block text-xs font-normal text-rose-800">이 직원의 업무를 기준 직원에게 이전합니다.</span>
                <select value={mergeSourceId} onChange={(e) => { setMergeSourceId(e.target.value); setMergeImpact(null); setMergeReport(null); }} className="mt-2 w-full rounded-lg border border-rose-400 bg-white px-3 py-2 text-slate-900">
                  <option value="">선택</option>
                  {employees.filter((e) => e.id !== mergeTargetId && !e.merged_into_employee_id).map((e) => <option key={e.id} value={e.id}>{employeeMasterLabel(e, teams)}{e.login_linked ? " · 로그인 연결" : ""}</option>)}
                </select>
              </label>
            </div>
            <button type="button" disabled={pending || !mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId} onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await analyzeEmployeeMergeAction(mergeSourceId, mergeTargetId);
                if (result.success) {
                  setMergeImpact(result.impact);
                  setKeepProfileId(result.impact.logins.length === 1 ? result.impact.logins[0].profile_id : "");
                } else setError(result.error);
              });
            }} className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-75">선택한 두 직원의 영향 분석하기</button>

            {mergeImpact ? (() => {
              const count = (table: string) => mergeImpact.references.find((r) => r.table === table && r.kind === "business")?.source_count ?? 0;
              const businessTotal = mergeImpact.references.filter((r) => r.kind === "business").reduce((sum, r) => sum + r.source_count, 0);
              const bothHaveLogin = mergeImpact.logins.length > 1;
              const confirmation = `${mergeImpact.source.name} 직원의 업무 ${businessTotal}건을 ${mergeImpact.target.name} 직원으로 이전하고 병합합니다.`;
              return <div className="mt-5 space-y-4 border-t pt-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-3 text-sm">고객 <b>{count("customers")}</b>건</div>
                  <div className="rounded-lg bg-slate-50 p-3 text-sm">견적 <b>{count("quotes")}</b>건</div>
                  <div className="rounded-lg bg-slate-50 p-3 text-sm">고객 일정 <b>{count("customer_schedules")}</b>건</div>
                  <div className="rounded-lg bg-slate-50 p-3 text-sm">공정 일정 <b>{count("project_process_schedules")}</b>건</div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold">전체 employees.id 참조 영향</h4>
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border">
                    <table className="min-w-full text-xs text-slate-900"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-2 text-left">테이블.컬럼</th><th>구분</th><th>이전</th><th>병합 후 합계</th></tr></thead>
                    <tbody>{mergeImpact.references.map((r) => <tr key={`${r.schema}.${r.table}.${r.column}`} className="border-t"><td className="p-2">{r.table}.{r.column}</td><td className="text-center">{r.kind}</td><td className="text-center">{r.source_count}</td><td className="text-center">{r.combined_count}</td></tr>)}</tbody></table>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold">연결된 로그인 계정</h4>
                  {mergeImpact.logins.length === 0 ? <p className="mt-1 text-sm text-slate-600">연결 계정 없음</p> : <div className="mt-2 space-y-2">{mergeImpact.logins.map((login) => <label key={login.profile_id} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900"><input type="radio" name="keep_profile" checked={keepProfileId === login.profile_id} onChange={() => setKeepProfileId(login.profile_id)} />{login.email ?? login.full_name ?? login.profile_id} · {login.employee_id === mergeImpact.target.id ? "기준 직원 계정" : "중복 직원 계정"}</label>)}</div>}
                  {bothHaveLogin ? <label className="mt-2 block text-sm font-medium">나머지 계정 처리<select value={otherLoginAction} onChange={(e) => setOtherLoginAction(e.target.value as "unlink" | "deactivate")} className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1 text-slate-900"><option value="unlink">직원 연결만 해제</option><option value="deactivate">연결 해제 및 비활성화</option></select></label> : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-700">유지되는 기준 직원</p><p className="mt-1 font-bold text-emerald-950">{mergeImpact.target.name}</p></div>
                  <div className="rounded-lg border border-rose-300 bg-rose-50 p-3"><p className="text-xs font-semibold text-rose-700">비활성화되는 병합 직원</p><p className="mt-1 font-bold text-rose-950">{mergeImpact.source.name}</p></div>
                </div>
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">실행 전 확인: {confirmation}<br /><span className="mt-1 block">이 작업은 완료 후 되돌릴 수 없습니다.</span></div>
                <button type="button" disabled={pending || (bothHaveLogin && !keepProfileId)} onClick={() => {
                  setMergeConfirmOpen(true);
                }} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-75">최종 병합 내용 확인하기</button>
                {mergeConfirmOpen ? <div className="rounded-xl border-2 border-red-400 bg-white p-4 shadow-lg">
                  <h4 className="font-bold text-red-900">정말 직원 병합을 실행하시겠습니까?</h4>
                  <p className="mt-2 text-sm text-slate-900"><b className="text-rose-800">{mergeImpact.source.name}</b> 직원의 업무 <b>{businessTotal}건</b>을 <b className="text-emerald-800">{mergeImpact.target.name}</b> 직원에게 이전합니다.</p>
                  <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-900">완료 후에는 되돌릴 수 없습니다. 선택한 직원과 이전 건수를 다시 확인해 주세요.</p>
                  <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setMergeConfirmOpen(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900">취소하고 다시 확인</button><button type="button" disabled={pending} onClick={() => {
                    setMergeConfirmOpen(false); setError(null);
                    const reportContext = { sourceName: mergeImpact.source.name, targetName: mergeImpact.target.name, businessTotal };
                    startTransition(async () => {
                      const result = await mergeEmployeesAction({ sourceEmployeeId: mergeImpact.source.id, targetEmployeeId: mergeImpact.target.id, keepProfileId: keepProfileId || null, otherLoginAction });
                      if (result.success) { setMergeReport(result.report); setMergeReportContext(reportContext); setMergeImpact(null); setMessage("직원 병합과 이전 전후 건수 검증을 완료했습니다."); }
                      else setError(result.error);
                    });
                  }} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-75">되돌릴 수 없음에 동의하고 병합 실행</button></div>
                </div> : null}
              </div>;
            })() : null}
            {mergeReport ? (() => {
              const rows = Object.entries(mergeReport.transferred_counts);
              const total = rows.reduce((sum, [, count]) => sum + Number(count), 0);
              const totalsMatch = JSON.stringify(mergeReport.before_totals) === JSON.stringify(mergeReport.after_totals);
              return <div className="mt-5 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div><h4 className="text-lg font-bold text-emerald-950">직원 병합 완료 보고서</h4><p className="mt-1 text-sm text-emerald-800">업무 이전과 병합 전후 건수 검증이 모두 완료되었습니다.</p></div>
                {mergeReportContext ? <div className="grid gap-2 sm:grid-cols-2"><div className="rounded-lg border border-emerald-300 bg-white p-3"><p className="text-xs text-emerald-700">유지된 기준 직원</p><b className="text-emerald-950">{mergeReportContext.targetName}</b></div><div className="rounded-lg border border-rose-300 bg-white p-3"><p className="text-xs text-rose-700">비활성화된 병합 직원</p><b className="text-rose-950">{mergeReportContext.sourceName}</b></div></div> : null}
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-slate-600">병합 로그 ID</dt><dd className="break-all font-mono text-xs text-slate-900">{mergeReport.merge_log_id}</dd></div>
                  <div><dt className="text-slate-600">총 이전 참조</dt><dd className="font-semibold text-slate-900">{total}건</dd></div>
                  <div><dt className="text-slate-600">중복 직원 ID</dt><dd className="break-all font-mono text-xs text-slate-900">{mergeReport.source_employee_id}</dd></div>
                  <div><dt className="text-slate-600">기준 직원 ID</dt><dd className="break-all font-mono text-xs text-slate-900">{mergeReport.target_employee_id}</dd></div>
                </dl>
                <div className="max-h-40 overflow-y-auto rounded-lg bg-white p-3 text-xs">
                  {rows.map(([key, count]) => <div key={key} className="flex justify-between border-b py-1 last:border-0"><span>{key}</span><b>{count}건</b></div>)}
                </div>
                <p className={`text-sm font-semibold ${totalsMatch ? "text-emerald-800" : "text-red-700"}`}>
                  이전 전후 합계 검증: {totalsMatch ? "일치" : "불일치"}
                </p>
              </div>;
            })() : null}
            {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <button type="button" onClick={() => { setMergeOpen(false); setMergeImpact(null); setMergeConfirmOpen(false); setError(null); }} className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900">{mergeReport ? "완료 보고서 닫기" : "병합 창 닫기"}</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
