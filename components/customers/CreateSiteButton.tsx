"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  createProjectAction,
  type ProjectActionResult,
} from "@/app/actions/projects";
import { isContractCustomerStatus } from "@/lib/crm/constants";
import {
  PROJECT_STATUSES,
  canShowCreateSiteButton,
  defaultProjectName,
} from "@/lib/crm/project-constants";
import type { Employee } from "@/types/database";

function empLabel(e: Pick<Employee, "name" | "title"> | null | undefined) {
  if (!e) return "담당 미지정";
  return `${e.name}${e.title ? ` ${e.title}` : ""}`;
}

const initial: ProjectActionResult = { success: false };

type Props = {
  customerId: string;
  customerName: string;
  customerAddress: string | null;
  customerStatus: string;
  defaultAssigneeId: string | null;
  employees: Employee[];
  existingProjectId: string | null;
  isAdmin: boolean;
  currentEmployeeId: string | null;
  /** 헤더용 강조 버튼 */
  variant?: "header" | "panel";
};

export default function CreateSiteButton({
  customerId,
  customerName,
  customerAddress,
  customerStatus,
  defaultAssigneeId,
  employees,
  existingProjectId,
  isAdmin,
  currentEmployeeId,
  variant = "header",
}: Props) {
  const [open, setOpen] = useState(false);
  /** 오류 후 사용자가 닫으면 숨김. 재제출/재오픈 시 해제 */
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [state, action, pending] = useActionState(createProjectAction, initial);

  const hasProject = Boolean(existingProjectId);
  const isContract = isContractCustomerStatus(customerStatus);
  const canCreate = canShowCreateSiteButton({
    isAdmin,
    employeeId: currentEmployeeId,
    assignedEmployeeId: defaultAssigneeId,
    customerStatus,
    hasProject,
  });

  const showModal = open || (Boolean(state.error) && !errorDismissed);

  if (hasProject && existingProjectId) {
    return (
      <Link
        href={`/projects/${existingProjectId}/schedule`}
        className={
          variant === "header"
            ? "rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
            : "rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900"
        }
      >
        현장 보기
      </Link>
    );
  }

  if (!canCreate) return null;

  const buttonClass =
    isContract || isAdmin
      ? variant === "header"
        ? "rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 ring-2 ring-emerald-300 ring-offset-1"
        : "rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
      : "rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white hover:bg-navy-700";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErrorDismissed(false);
          setOpen(true);
        }}
        className={buttonClass}
      >
        현장 생성
        {isAdmin && !isContract ? (
          <span className="ml-1 font-normal opacity-80">(테스트)</span>
        ) : null}
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-navy-900">현장 생성</h3>
            <p className="mt-1 text-xs text-gray-500">
              계약 고객을 현장으로 전환합니다. 저장 후 공사 스케줄 화면으로 이동합니다.
            </p>

            <form
              action={action}
              onSubmit={() => {
                setErrorDismissed(false);
                setOpen(true);
              }}
              className="mt-4 grid gap-3 sm:grid-cols-2"
            >
              <input type="hidden" name="customer_id" value={customerId} />

              <div className="sm:col-span-2">
                <p className="text-xs text-gray-500">고객명</p>
                <p className="mt-1 rounded-lg border bg-gray-50 px-3 py-2 text-sm text-navy-900">
                  {customerName}
                </p>
              </div>

              <label className="text-xs text-gray-600 sm:col-span-2">
                현장명 *
                <input
                  name="name"
                  required
                  defaultValue={defaultProjectName(customerName, customerAddress)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </label>

              <label className="text-xs text-gray-600 sm:col-span-2">
                현장주소
                <input
                  name="address"
                  defaultValue={customerAddress ?? ""}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </label>

              <label className="text-xs text-gray-600">
                담당자
                <select
                  name="assigned_employee_id"
                  defaultValue={defaultAssigneeId ?? ""}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">미지정</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {empLabel(e)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-gray-600">
                현장상태
                <select
                  name="status"
                  defaultValue="준비"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                >
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-navy-800 px-4 py-2 text-sm text-white disabled:opacity-60"
                >
                  {pending ? "저장 중…" : "저장"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (state.error) setErrorDismissed(true);
                  }}
                  className="rounded-lg border px-4 py-2 text-sm"
                >
                  닫기
                </button>
                {state.error && (
                  <p className="w-full text-sm text-red-600">{state.error}</p>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
