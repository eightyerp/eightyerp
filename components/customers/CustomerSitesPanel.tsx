"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  deleteProjectAction,
  updateProjectAction,
  type ProjectActionResult,
} from "@/app/actions/projects";
import CreateSiteButton from "@/components/customers/CreateSiteButton";
import {
  formatEmployeeOptionLabel,
  isContractCustomerStatus,
} from "@/lib/crm/constants";
import { PROJECT_STATUSES } from "@/lib/crm/project-constants";
import type { Employee, Project } from "@/types/database";

function empLabel(
  e: Pick<Employee, "name" | "title" | "teams"> | null | undefined,
) {
  if (!e) return "담당 미지정";
  return formatEmployeeOptionLabel(e);
}

const initial: ProjectActionResult = { success: false };

const STATUS_CLASS: Record<string, string> = {
  준비: "bg-slate-100 text-slate-900",
  진행중: "bg-sky-100 text-sky-900",
  완료: "bg-emerald-50 text-emerald-800",
  보류: "bg-amber-100 text-amber-900",
  취소: "bg-zinc-100 text-zinc-600",
};

type Props = {
  customerId: string;
  customerName: string;
  customerAddress: string | null;
  customerStatus: string;
  defaultAssigneeId: string | null;
  projects: Project[];
  employees: Employee[];
  isAdmin: boolean;
  currentEmployeeId: string | null;
};

export default function CustomerSitesPanel({
  customerId,
  customerName,
  customerAddress,
  customerStatus,
  defaultAssigneeId,
  projects,
  employees,
  isAdmin,
  currentEmployeeId,
}: Props) {
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleteOf, setDeleteOf] = useState<Project | null>(null);
  const [updateState, updateAction] = useActionState(updateProjectAction, initial);
  const primaryProject = projects[0] ?? null;
  const isContract = isContractCustomerStatus(customerStatus);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-navy-900">현장 목록</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            계약 전 점검·상담부터 견적·계약·공사까지 같은 현장 ID로 이어갑니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/customers/${customerId}/materials`}
            className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-medium text-navy-900"
          >
            고객 전체 마감자재
          </Link>
          <CreateSiteButton
            customerId={customerId}
            customerName={customerName}
            customerAddress={customerAddress}
            customerStatus={customerStatus}
            defaultAssigneeId={defaultAssigneeId}
            employees={employees}
            existingProjectId={primaryProject?.id ?? null}
            isAdmin={isAdmin}
            currentEmployeeId={currentEmployeeId}
            variant="panel"
          />
        </div>
      </div>

      {editing && (
        <form
          action={updateAction}
          className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2"
        >
          <input type="hidden" name="customer_id" value={customerId} />
          <input type="hidden" name="project_id" value={editing.id} />
          <label className="text-xs text-gray-600 sm:col-span-2">
            현장명 *
            <input
              name="name"
              required
              defaultValue={editing.name}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-gray-600 sm:col-span-2">
            현장주소
            <input
              name="address"
              defaultValue={editing.address ?? ""}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>

          {isContract ? (
            <label className="text-xs text-gray-600">
              현장상태
              <select
                name="status"
                defaultValue={editing.status}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              >
                {PROJECT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="text-xs text-gray-600">
              현장상태
              <input type="hidden" name="status" value="준비" />
              <p className="mt-1 rounded-lg border bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                준비 · 계약 전 점검/상담
              </p>
            </div>
          )}

          {isAdmin ? (
            <label className="text-xs text-gray-600">
              담당자
              <select
                name="assigned_employee_id"
                defaultValue={editing.assigned_employee_id ?? ""}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">미지정</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {empLabel(employee)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="text-xs text-gray-600">
              담당자
              <input
                type="hidden"
                name="assigned_employee_id"
                value={currentEmployeeId ?? editing.assigned_employee_id ?? ""}
              />
              <p className="mt-1 rounded-lg border bg-gray-50 px-3 py-2 text-sm text-navy-900">
                {empLabel(
                  employees.find(
                    (employee) =>
                      employee.id ===
                      (currentEmployeeId ?? editing.assigned_employee_id),
                  ),
                )}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-navy-800 px-4 py-2 text-sm text-white"
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              닫기
            </button>
            {updateState.error && (
              <p className="self-center text-sm text-red-600">{updateState.error}</p>
            )}
            {updateState.message && (
              <p className="self-center text-sm text-emerald-700">
                {updateState.message}
              </p>
            )}
          </div>
        </form>
      )}

      <div className="space-y-2">
        {projects.map((project) => (
          <article
            key={project.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-navy-900">{project.name}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_CLASS[project.status] || "bg-slate-100 text-slate-900"}`}
                >
                  {project.status}
                </span>
                {!isContract && project.status === "준비" && (
                  <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                    점검·상담 단계
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {[
                  project.address || "주소 미등록",
                  `담당 ${empLabel(project.employees)}`,
                ].join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              <Link
                href={`/projects/${project.id}/schedule`}
                className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white"
              >
                {isContract ? "공사 일정 등록" : "현장 일정"}
              </Link>
              <Link
                href={`/customers/${customerId}/projects/${project.id}/materials`}
                className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-medium text-navy-900"
              >
                마감자재
              </Link>
              <button
                type="button"
                onClick={() => setEditing(project)}
                className="rounded-lg border px-3 py-2 text-xs"
              >
                수정
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setDeleteOf(project)}
                  className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600"
                >
                  삭제
                </button>
              )}
            </div>
          </article>
        ))}
        {projects.length === 0 && (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm leading-6 text-slate-600">
            등록된 현장이 없습니다. 점검·Window Lab 상담을 시작하려면 먼저 현장을 만들어 주세요.
          </p>
        )}
      </div>

      {isAdmin && deleteOf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="font-semibold text-navy-900">현장 삭제</h3>
            <p className="mt-2 text-sm">{deleteOf.name}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              점검·상담·견적·계약에 연결된 현장은 삭제되지 않습니다. 업무가 중단된 현장은 삭제 대신 보류/취소 상태를 우선 사용하세요.
            </p>
            <form
              action={async (formData) => {
                const result = await deleteProjectAction(formData);
                if (!result.success) alert(result.error);
                else setDeleteOf(null);
              }}
              className="mt-3 space-y-3"
            >
              <input type="hidden" name="project_id" value={deleteOf.id} />
              <input type="hidden" name="customer_id" value={customerId} />
              <textarea
                name="delete_reason"
                required
                rows={3}
                placeholder="삭제 사유 *"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteOf(null)}
                  className="rounded border px-3 py-2 text-sm"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="rounded bg-red-600 px-3 py-2 text-sm text-white"
                >
                  삭제
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
