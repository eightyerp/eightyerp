"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  createSiteMaterialAction,
  deleteSiteMaterialAction,
  updateSiteMaterialAction,
  type SiteMaterialActionResult,
} from "@/app/actions/site-materials";
import type {
  MaterialCatalogItem,
  MaterialCategory,
  ProjectMaterial,
} from "@/types/database";

const initial: SiteMaterialActionResult = { success: false };

type Props = {
  customerId: string;
  projectId?: string | null;
  siteName?: string | null;
  siteStatus?: string | null;
  customerName: string;
  phone: string | null;
  address: string | null;
  assigneeName: string | null;
  materials: ProjectMaterial[];
  categories: MaterialCategory[];
  catalogItems: MaterialCatalogItem[];
  signedUrls: Record<string, string>;
  backHref: string;
  backLabel: string;
};

type Mode = "closed" | "manual" | "catalog" | "edit";

export default function SiteMaterialsWorkspace({
  customerId,
  projectId = null,
  siteName,
  siteStatus,
  customerName,
  phone,
  address,
  assigneeName,
  materials,
  categories,
  catalogItems,
  signedUrls,
  backHref,
  backLabel,
}: Props) {
  const active = useMemo(
    () => materials.filter((m) => !m.deleted_at),
    [materials],
  );
  const [mode, setMode] = useState<Mode>("closed");
  const [editing, setEditing] = useState<ProjectMaterial | null>(null);
  const [pickedCatalog, setPickedCatalog] =
    useState<MaterialCatalogItem | null>(null);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [catalogQ, setCatalogQ] = useState("");
  const [deleteOf, setDeleteOf] = useState<ProjectMaterial | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [createState, createAction, createPending] = useActionState(
    createSiteMaterialAction,
    initial,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateSiteMaterialAction,
    initial,
  );
  const formState = editing ? updateState : createState;
  const pending = createPending || updatePending;

  useEffect(() => {
    if (!formState.success || !formState.message) return;
    const id = window.setTimeout(() => {
      setToast(formState.message!);
      setMode("closed");
      setEditing(null);
      setPickedCatalog(null);
    }, 0);
    return () => window.clearTimeout(id);
  }, [formState.success, formState.message]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const filteredCatalog = useMemo(() => {
    const q = catalogQ.trim().toLowerCase();
    return catalogItems
      .filter((c) => !categoryId || c.category_id === categoryId)
      .filter((c) => {
        if (!q) return true;
        return [c.product_name, c.brand, c.color]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 40);
  }, [catalogItems, categoryId, catalogQ]);

  function openManual() {
    setEditing(null);
    setPickedCatalog(null);
    setCategoryId(categories[0]?.id ?? "");
    setMode("manual");
  }

  function openCatalog() {
    setEditing(null);
    setPickedCatalog(null);
    setCategoryId(categories[0]?.id ?? "");
    setCatalogQ("");
    setMode("catalog");
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={backHref} className="text-xs text-navy-800 underline">
            ← {backLabel}
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-navy-900">마감자재</h1>
          <p className="mt-1 text-sm text-gray-600">
            {[
              customerName,
              phone,
              siteName ? `현장 ${siteName}` : null,
              siteStatus,
              assigneeName ? `담당 ${assigneeName}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {address && (
            <p className="mt-0.5 text-xs text-gray-500">주소: {address}</p>
          )}
          <p className="mt-1 text-sm text-navy-800">등록 자재 {active.length}건</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openCatalog}
            className="rounded-lg border border-gold-300 bg-gold-50 px-4 py-2 text-sm font-medium text-navy-900"
          >
            카탈로그에서 추가
          </button>
          <button
            type="button"
            onClick={openManual}
            className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-medium text-white"
          >
            직접 입력
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((m) => {
          const cover =
            m.cover_image_path && signedUrls[m.cover_image_path]
              ? signedUrls[m.cover_image_path]
              : null;
          return (
            <article
              key={m.id}
              className="overflow-hidden rounded-xl border bg-white shadow-sm"
            >
              <div className="h-28 bg-gray-100">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-gray-400">
                    No image
                  </div>
                )}
              </div>
              <div className="space-y-1 p-3 text-xs">
                <p className="text-[11px] text-gray-500">
                  {m.material_categories?.name || "미분류"}
                </p>
                <p className="text-sm font-semibold text-navy-900">
                  {m.product_name}
                </p>
                <p className="text-gray-600">
                  {[m.brand, m.color, m.specification].filter(Boolean).join(" · ")}
                </p>
                {m.application_location && (
                  <p className="text-gray-500">위치: {m.application_location}</p>
                )}
                <p>
                  수량 {m.quantity ?? "-"} {m.unit || ""}
                </p>
                {(m.note || m.site_note || m.staff_note) && (
                  <p className="truncate text-gray-400">
                    메모: {m.note || m.site_note || m.staff_note}
                  </p>
                )}
                <div className="flex gap-1 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(m);
                      setPickedCatalog(null);
                      setCategoryId(m.category_id);
                      setMode("edit");
                    }}
                    className="min-h-9 rounded border px-3 text-xs"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteOf(m)}
                    className="min-h-9 rounded border border-red-200 px-3 text-xs text-red-600"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {active.length === 0 && (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-500">
          등록된 자재가 없습니다. 카탈로그 또는 직접 입력으로 추가해 주세요.
        </p>
      )}

      {(mode === "manual" || mode === "edit" || (mode === "catalog" && pickedCatalog)) && (
        <MaterialFormModal
          customerId={customerId}
          projectId={projectId}
          categories={categories}
          categoryId={
            pickedCatalog?.category_id || editing?.category_id || categoryId
          }
          catalog={pickedCatalog}
          editing={editing}
          action={editing ? updateAction : createAction}
          state={formState}
          pending={pending}
          onClose={() => {
            setMode("closed");
            setEditing(null);
            setPickedCatalog(null);
          }}
        />
      )}

      {mode === "catalog" && !pickedCatalog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-navy-900">카탈로그에서 선택</h3>
              <button
                type="button"
                onClick={() => setMode("closed")}
                className="text-sm text-gray-400"
              >
                닫기
              </button>
            </div>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">전체 분류</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              value={catalogQ}
              onChange={(e) => setCatalogQ(e.target.value)}
              placeholder="제품명·브랜드 검색"
              className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
            />
            <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
              {filteredCatalog.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPickedCatalog(c)}
                  className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <span>
                    {c.product_name}
                    <span className="ml-2 text-xs text-gray-500">
                      {[c.brand, c.color].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              ))}
              {filteredCatalog.length === 0 && (
                <p className="py-6 text-center text-xs text-gray-500">
                  검색 결과가 없습니다.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteOf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="font-semibold text-navy-900">자재 삭제</h3>
            <p className="mt-2 text-sm">{deleteOf.product_name}</p>
            <form
              action={async (fd) => {
                const r = await deleteSiteMaterialAction(fd);
                if (!r.success) setToast(r.error || "삭제 실패");
                else {
                  setToast("삭제되었습니다.");
                  setDeleteOf(null);
                }
              }}
              className="mt-3 space-y-3"
            >
              <input type="hidden" name="material_id" value={deleteOf.id} />
              <input type="hidden" name="customer_id" value={customerId} />
              {projectId && (
                <input type="hidden" name="project_id" value={projectId} />
              )}
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

function MaterialFormModal({
  customerId,
  projectId,
  categories,
  categoryId,
  catalog,
  editing,
  action,
  state,
  pending,
  onClose,
}: {
  customerId: string;
  projectId?: string | null;
  categories: MaterialCategory[];
  categoryId: string;
  catalog: MaterialCatalogItem | null;
  editing: ProjectMaterial | null;
  action: (payload: FormData) => void;
  state: SiteMaterialActionResult;
  pending: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-navy-900">
            {editing ? "자재 수정" : "자재 등록"}
          </h3>
          <button type="button" onClick={onClose} className="text-sm text-gray-400">
            닫기
          </button>
        </div>
        <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
          {editing && (
            <input type="hidden" name="material_id" value={editing.id} />
          )}
          <input type="hidden" name="customer_id" value={customerId} />
          {projectId && (
            <input type="hidden" name="project_id" value={projectId} />
          )}
          <input
            type="hidden"
            name="catalog_material_id"
            value={catalog?.id || editing?.catalog_material_id || ""}
          />
          <input type="hidden" name="is_active" value="true" />
          <input type="hidden" name="unit_price" value="0" />
          <input type="hidden" name="additional_price" value="0" />

          <label className="text-xs text-gray-600 sm:col-span-2">
            자재분류 *
            <select
              name="category_id"
              required
              defaultValue={categoryId}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Field
            name="product_name"
            label="제품명 *"
            required
            defaultValue={catalog?.product_name || editing?.product_name}
          />
          <Field
            name="brand"
            label="브랜드"
            defaultValue={catalog?.brand || editing?.brand}
          />
          <Field
            name="color"
            label="색상"
            defaultValue={catalog?.color || editing?.color}
          />
          <Field
            name="specification"
            label="규격"
            defaultValue={catalog?.specification || editing?.specification}
          />
          <Field
            name="application_location"
            label="적용 위치"
            defaultValue={editing?.application_location}
          />
          <Field
            name="quantity"
            label="수량"
            type="number"
            defaultValue={String(editing?.quantity ?? (catalog ? 1 : ""))}
          />
          <Field
            name="unit"
            label="단위"
            defaultValue={catalog?.unit || editing?.unit || "개"}
          />
          <label className="text-xs text-gray-600 sm:col-span-2">
            메모
            <textarea
              name="note"
              rows={2}
              defaultValue={
                editing?.note ||
                editing?.site_note ||
                editing?.staff_note ||
                ""
              }
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs sm:col-span-2">
            대표 사진 (1장)
            <input
              type="file"
              name="images"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="mt-1 block w-full text-xs"
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="min-h-10 rounded-lg bg-navy-800 px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {pending ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 rounded-lg border px-4 py-2 text-sm"
            >
              취소
            </button>
            {state.error && (
              <p className="self-center text-sm text-red-600">{state.error}</p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  name,
  label,
  defaultValue,
  required,
  type = "text",
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="text-xs text-gray-600">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
      />
    </label>
  );
}
