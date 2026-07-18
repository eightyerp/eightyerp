"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  createProjectAction,
  deleteProjectAction,
  updateProjectAction,
  type ProjectActionResult,
} from "@/app/actions/projects";
import { PROJECT_STATUSES } from "@/lib/crm/project-constants";
import type { Employee, Project } from "@/types/database";

function empLabel(e: Pick<Employee, "name" | "title"> | null | undefined) {
  if (!e) return "담당 미지정";
  return `${e.name}${e.title ? ` ${e.title}` : ""}`;
}

const initial: ProjectActionResult = { success: false };

const STATUS_CLASS: Record<string, string> = {
  준비: "bg-slate-100 text-slate-700",
  진행중: "bg-blue-50 text-blue-800",
  완료: "bg-emerald-50 text-emerald-800",
  보류: "bg-amber-50 text-amber-800",
  취소: "bg-zinc-100 text-zinc-600",
};

type Props = {
  customerId: string;
  customerName: string;
  customerAddress: string | null;
  defaultAssigneeId: string | null;
  projects: Project[];
  employees: Employee[];
};

export default function CustomerSitesPanel({
  customerId,
  customerName,
  customerAddress,
  defaultAssigneeId,
  projects,
  employees,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleteOf, setDeleteOf] = useState<Project | null>(null);

  const [createState, createAction] = useActionState(createProjectAction, initial);
  const [updateState, updateAction] = useActionState(updateProjectAction, initial);
  const formState = editing ? updateState : createState;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-navy-900">현장 목록</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            현장을 선택한 뒤 마감자재를 등록합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/customers/${customerId}/materials`}
            className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-medium text-navy-900"
          >
            고객 전체 마감자재
          </Link>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white"
          >
            현장 생성
          </button>
        </div>
      </div>

      {(showForm || editing) && (
        <form
          action={editing ? updateAction : createAction}
          className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2"
        >
          <input type="hidden" name="customer_id" value={customerId} />
          {editing && (
            <input type="hidden" name="project_id" value={editing.id} />
          )}
          <label className="text-xs text-gray-600 sm:col-span-2">
            현장명 *
            <input
              name="name"
              required
              defaultValue={editing?.name ?? `${customerName} 현장`}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-gray-600 sm:col-span-2">
            공사주소
            <input
              name="address"
              defaultValue={editing?.address ?? customerAddress ?? ""}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-gray-600">
            공정상태
            <select
              name="status"
              defaultValue={editing?.status ?? "진행중"}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            담당자
            <select
              name="assigned_employee_id"
              defaultValue={
                editing?.assigned_employee_id ?? defaultAssigneeId ?? ""
              }
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
          {!editing && (
            <label className="flex items-center gap-2 text-xs sm:col-span-2">
              <input type="checkbox" name="go_materials" value="1" defaultChecked />
              저장 후 마감자재 화면으로 이동
            </label>
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
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              닫기
            </button>
            {formState.error && (
              <p className="self-center text-sm text-red-600">{formState.error}</p>
            )}
            {formState.message && (
              <p className="self-center text-sm text-emerald-700">
                {formState.message}
              </p>
            )}
          </div>
        </form>
      )}

      <div className="space-y-2">
        {projects.map((p) => (
          <article
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-navy-900">{p.name}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_CLASS[p.status] || "bg-gray-100 text-gray-600"}`}
                >
                  {p.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {[p.address || "주소 미등록", `담당 ${empLabel(p.employees)}`].join(
                  " · ",
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              <Link
                href={`/customers/${customerId}/projects/${p.id}/materials`}
                className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-medium text-navy-900"
              >
                마감자재
              </Link>
              <button
                type="button"
                onClick={() => {
                  setEditing(p);
                  setShowForm(true);
                }}
                className="rounded-lg border px-3 py-2 text-xs"
              >
                수정
              </button>
              <button
                type="button"
                onClick={() => setDeleteOf(p)}
                className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600"
              >
                삭제
              </button>
            </div>
          </article>
        ))}
        {projects.length === 0 && (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-500">
            등록된 현장이 없습니다. 현장 생성 후 마감자재를 등록해 주세요.
          </p>
        )}
      </div>

      {deleteOf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="font-semibold text-navy-900">현장 삭제</h3>
            <p className="mt-2 text-sm">{deleteOf.name}</p>
            <form
              action={async (fd) => {
                const r = await deleteProjectAction(fd);
                if (!r.success) alert(r.error);
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
