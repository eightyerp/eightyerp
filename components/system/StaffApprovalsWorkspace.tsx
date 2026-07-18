"use client";

import { useActionState, useEffect, useState } from "react";
import {
  approveSignupAction,
  deactivateUserAction,
  rejectSignupAction,
  type StaffApprovalResult,
} from "@/app/actions/staff-approvals";
import { ROLE_LABEL } from "@/lib/crm/constants";
import type { PendingSignup } from "@/lib/crm/staff-approvals";
import type { Employee, Team, UserRole } from "@/types/database";

type Props = {
  pending: PendingSignup[];
  allProfiles: PendingSignup[];
  employees: Employee[];
  teams: Team[];
};

const initial: StaffApprovalResult = { success: false };

const ROLES: UserRole[] = ["staff", "manager", "admin", "super_admin"];

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

function approveTargetName(row: PendingSignup) {
  return row.full_name || row.email || row.id;
}

export default function StaffApprovalsWorkspace({
  pending,
  allProfiles,
  employees,
  teams,
}: Props) {
  const [approveTarget, setApproveTarget] = useState<PendingSignup | null>(
    null,
  );
  const [rejectTarget, setRejectTarget] = useState<PendingSignup | null>(null);
  const [approveState, approveAction, approvePending] = useActionState(
    approveSignupAction,
    initial,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectSignupAction,
    initial,
  );
  const [deactivateState, deactivateAction, deactivatePending] = useActionState(
    deactivateUserAction,
    initial,
  );

  useEffect(() => {
    if (approveState.success && approveState.message) {
      setApproveTarget(null);
    }
  }, [approveState]);

  useEffect(() => {
    if (rejectState.success && rejectState.message) {
      setRejectTarget(null);
    }
  }, [rejectState]);

  const feedback =
    approveState.message ||
    approveState.error ||
    rejectState.message ||
    rejectState.error ||
    deactivateState.message ||
    deactivateState.error;

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.includes("실패") ||
            feedback.includes("없") ||
            feedback.includes("오류") ||
            feedback.includes("권한")
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {feedback}
        </div>
      )}

      <section className="dashboard-card p-5">
        <h2 className="text-base font-semibold text-navy-900">
          승인 대기 ({pending.length})
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          승인 시 기존 직원과 연결하거나 새 직원 정보를 만들고 팀·직급·역할을
          지정합니다.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b text-xs text-gray-500">
              <tr>
                <th className="px-2 py-2 font-medium">이름</th>
                <th className="px-2 py-2 font-medium">이메일</th>
                <th className="px-2 py-2 font-medium">연락처</th>
                <th className="px-2 py-2 font-medium">희망 팀</th>
                <th className="px-2 py-2 font-medium">가입일</th>
                <th className="px-2 py-2 font-medium">처리</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="px-2 py-3 font-medium text-navy-900">
                    {row.full_name || "-"}
                  </td>
                  <td className="px-2 py-3 text-gray-700">{row.email || "-"}</td>
                  <td className="px-2 py-3 text-gray-700">{row.phone || "-"}</td>
                  <td className="px-2 py-3 text-xs text-gray-600">
                    {row.requested_team || "-"}
                  </td>
                  <td className="px-2 py-3 text-xs text-gray-500">
                    {formatDate(row.created_at)}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setRejectTarget(null);
                          setApproveTarget(row);
                        }}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white"
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setApproveTarget(null);
                          setRejectTarget(row);
                        }}
                        className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600"
                      >
                        거절
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {pending.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-2 py-10 text-center text-sm text-gray-500"
                  >
                    승인 대기 중인 가입 신청이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-card p-5">
        <h2 className="text-base font-semibold text-navy-900">계정 목록</h2>
        <p className="mt-1 text-xs text-gray-500">
          승인·거절·비활성 상태를 확인하고 필요 시 비활성화합니다.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b text-xs font-semibold text-gray-700">
              <tr>
                <th className="px-2 py-2">이름</th>
                <th className="px-2 py-2">이메일</th>
                <th className="px-2 py-2">역할</th>
                <th className="px-2 py-2">상태</th>
                <th className="px-2 py-2">직원</th>
                <th className="px-2 py-2">관리</th>
              </tr>
            </thead>
            <tbody>
              {allProfiles.map((row) => {
                const status = row.approval_status ?? "pending";
                const statusLabel =
                  !row.is_active && status === "approved"
                    ? "비활성"
                    : status === "approved"
                      ? "승인"
                      : status === "rejected"
                        ? "거절"
                        : "대기";
                return (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className="px-2 py-3 text-sm font-semibold text-navy-900">
                      {row.full_name || row.employees?.name || "-"}
                    </td>
                    <td className="px-2 py-3 text-sm font-medium text-gray-900">
                      {row.email || "-"}
                    </td>
                    <td className="px-2 py-3 text-sm font-medium text-gray-900">
                      {ROLE_LABEL[row.role] ?? row.role}
                    </td>
                    <td className="px-2 py-3 text-sm font-medium text-gray-900">
                      {statusLabel}
                    </td>
                    <td className="px-2 py-3 text-sm font-medium text-gray-900">
                      {row.employees
                        ? `${row.employees.name} ${row.employees.title}`
                        : "-"}
                    </td>
                    <td className="px-2 py-3">
                      {row.is_active && status === "approved" ? (
                        <form action={deactivateAction}>
                          <input type="hidden" name="user_id" value={row.id} />
                          <button
                            type="submit"
                            disabled={deactivatePending}
                            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                            onClick={(e) => {
                              if (
                                !confirm(
                                  "이 계정을 비활성화하시겠습니까? ERP 접근이 차단됩니다.",
                                )
                              ) {
                                e.preventDefault();
                              }
                            }}
                          >
                            비활성화
                          </button>
                        </form>
                      ) : status === "pending" ? (
                        <button
                          type="button"
                          onClick={() => setApproveTarget(row)}
                          className="text-xs text-emerald-700 underline"
                        >
                          승인하기
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {approveTarget && (
        <ApproveModal
          row={approveTarget}
          employees={employees}
          teams={teams}
          action={approveAction}
          pending={approvePending}
          error={approveState.error}
          onClose={() => setApproveTarget(null)}
        />
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="font-semibold text-navy-900">가입 거절</h3>
            <p className="mt-1 text-sm text-gray-600">
              {approveTargetName(rejectTarget)}
            </p>
            <form action={rejectAction} className="mt-4 space-y-3">
              <input type="hidden" name="user_id" value={rejectTarget.id} />
              <textarea
                name="rejection_reason"
                rows={3}
                placeholder="거절 사유 (선택)"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="rounded border px-3 py-2 text-sm"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={rejectPending}
                  className="rounded bg-red-600 px-3 py-2 text-sm text-white"
                >
                  {rejectPending ? "처리 중…" : "거절"}
                </button>
              </div>
              {rejectState.error && (
                <p className="text-sm text-red-600">{rejectState.error}</p>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ApproveModal({
  row,
  employees,
  teams,
  action,
  pending,
  error,
  onClose,
}: {
  row: PendingSignup;
  employees: Employee[];
  teams: Team[];
  action: (payload: FormData) => void;
  pending: boolean;
  error?: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"link" | "create">("link");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h3 className="font-semibold text-navy-900">가입 승인</h3>
        <p className="mt-1 text-sm text-gray-600">
          {approveTargetName(row)}
          {row.email ? ` · ${row.email}` : ""}
        </p>

        <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="user_id" value={row.id} />
          <input type="hidden" name="mode" value={mode} />

          <label className="text-xs text-gray-600 sm:col-span-2">
            역할 *
            <select
              name="role"
              defaultValue="staff"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => setMode("link")}
              className={`rounded-lg px-3 py-1.5 text-xs ${
                mode === "link"
                  ? "bg-navy-800 text-white"
                  : "border text-gray-600"
              }`}
            >
              기존 직원 연결
            </button>
            <button
              type="button"
              onClick={() => setMode("create")}
              className={`rounded-lg px-3 py-1.5 text-xs ${
                mode === "create"
                  ? "bg-navy-800 text-white"
                  : "border text-gray-600"
              }`}
            >
              새 직원 생성
            </button>
          </div>

          {mode === "link" ? (
            <>
              <label className="text-xs text-gray-600 sm:col-span-2">
                직원 선택 *
                <select
                  name="employee_id"
                  required
                  defaultValue=""
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">선택</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} {e.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-600">
                직급 지정 (선택)
                <input
                  name="employee_title"
                  placeholder="예: 팀장, 실장"
                  defaultValue=""
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-gray-600">
                팀 갱신 (선택)
                <select
                  name="team_id"
                  defaultValue=""
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">변경 안 함</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="text-xs text-gray-600 sm:col-span-2">
                직원 이름 *
                <input
                  name="employee_name"
                  required
                  defaultValue={row.full_name ?? ""}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-gray-600">
                직급 *
                <input
                  name="employee_title"
                  required
                  placeholder="예: 팀장, 실장"
                  defaultValue=""
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-gray-600">
                팀
                <select
                  name="team_id"
                  defaultValue=""
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">미지정</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {pending ? "승인 중…" : "승인 완료"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              닫기
            </button>
            {error && <p className="w-full text-sm text-red-600">{error}</p>}
          </div>
        </form>
      </div>
    </div>
  );
}
