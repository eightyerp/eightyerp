"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  createCategoryAction,
  deleteCategoryAction,
  reorderCategoryAction,
  updateCategoryAction,
  type CategoryActionResult,
} from "@/app/actions/categories";
import type { MaterialCategory } from "@/types/database";

const initial: CategoryActionResult = { success: false };

type Props = {
  categories: MaterialCategory[];
};

export default function CategorySettings({ categories }: Props) {
  const [editing, setEditing] = useState<MaterialCategory | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteOf, setDeleteOf] = useState<MaterialCategory | null>(null);

  const [createState, createAction] = useActionState(createCategoryAction, initial);
  const [updateState, updateAction] = useActionState(updateCategoryAction, initial);
  const formState = editing ? updateState : createState;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-900">자재분류 관리</h1>
          <p className="mt-1 text-sm text-gray-600">
            직원이 직접 분류를 추가·수정·정렬할 수 있습니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/materials/catalog"
            className="rounded-lg border px-3 py-2 text-xs"
          >
            카탈로그
          </Link>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setShowCreate(true);
            }}
            className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white"
          >
            분류 추가
          </button>
        </div>
      </div>

      {(showCreate || editing) && (
        <form
          action={editing ? updateAction : createAction}
          className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2"
        >
          {editing && (
            <input type="hidden" name="category_id" value={editing.id} />
          )}
          <label className="text-xs text-gray-600">
            이름 *
            <input
              name="name"
              required
              defaultValue={editing?.name ?? ""}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-gray-600">
            코드
            <input
              name="code"
              defaultValue={editing?.code ?? ""}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-gray-600">
            순서
            <input
              name="sort_order"
              type="number"
              defaultValue={String(editing?.sort_order ?? categories.length * 10 + 10)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 self-end text-xs">
            <input
              type="checkbox"
              name="is_active"
              value="true"
              defaultChecked={editing?.is_active ?? true}
            />
            활성
          </label>
          <label className="text-xs text-gray-600 sm:col-span-2">
            설명
            <textarea
              name="description"
              rows={2}
              defaultValue={editing?.description ?? ""}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-navy-800 px-4 py-2 text-sm text-white"
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
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

      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">순서</th>
              <th className="px-3 py-2">이름</th>
              <th className="px-3 py-2">코드</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2">설명</th>
              <th className="px-3 py-2">작업</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2 text-xs text-gray-500">{c.sort_order}</td>
                <td className="px-3 py-2 font-medium text-navy-900">{c.name}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{c.code || "-"}</td>
                <td className="px-3 py-2 text-xs">
                  {c.is_active ? (
                    <span className="text-emerald-700">활성</span>
                  ) : (
                    <span className="text-gray-400">비활성</span>
                  )}
                </td>
                <td className="max-w-[200px] truncate px-3 py-2 text-xs text-gray-500">
                  {c.description || "-"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <form
                      action={async (fd) => {
                        const r = await reorderCategoryAction(fd);
                        if (!r.success) alert(r.error);
                      }}
                    >
                      <input type="hidden" name="category_id" value={c.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button type="submit" className="rounded border px-2 py-1 text-[11px]">
                        ↑
                      </button>
                    </form>
                    <form
                      action={async (fd) => {
                        const r = await reorderCategoryAction(fd);
                        if (!r.success) alert(r.error);
                      }}
                    >
                      <input type="hidden" name="category_id" value={c.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button type="submit" className="rounded border px-2 py-1 text-[11px]">
                        ↓
                      </button>
                    </form>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(c);
                        setShowCreate(true);
                      }}
                      className="rounded border px-2 py-1 text-[11px]"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteOf(c)}
                      className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-600"
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {categories.length === 0 && (
          <p className="p-6 text-center text-sm text-gray-500">분류가 없습니다.</p>
        )}
      </div>

      {deleteOf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="font-semibold text-navy-900">분류 삭제</h3>
            <p className="mt-2 text-sm text-gray-600">{deleteOf.name}</p>
            <p className="mt-1 text-xs text-amber-700">
              연결된 자재가 있으면 삭제되지 않습니다. 비활성화를 사용하세요.
            </p>
            <form
              action={async (fd) => {
                const r = await deleteCategoryAction(fd);
                if (!r.success) alert(r.error);
                else setDeleteOf(null);
              }}
              className="mt-3 space-y-3"
            >
              <input type="hidden" name="category_id" value={deleteOf.id} />
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
