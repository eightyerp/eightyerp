"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  addCatalogToSiteAction,
  createSiteMaterialAction,
  deleteSiteMaterialAction,
  duplicateSiteMaterialAction,
  reorderSiteMaterialAction,
  updateSiteMaterialAction,
  type SiteMaterialActionResult,
} from "@/app/actions/site-materials";
import { SPACE_NAME_SUGGESTIONS } from "@/lib/crm/material-constants";
import type {
  MaterialCatalogItem,
  MaterialCategory,
  ProjectMaterial,
} from "@/types/database";

const initial: SiteMaterialActionResult = { success: false };

type Props = {
  customerId: string;
  projectId?: string | null;
  customerName: string;
  address: string | null;
  assigneeName: string | null;
  materials: ProjectMaterial[];
  categories: MaterialCategory[];
  catalogItems: MaterialCatalogItem[];
  favorites: MaterialCatalogItem[];
  recentSpaces: string[];
  signedUrls: Record<string, string>;
  totalAdditional: number;
  backHref: string;
  backLabel: string;
};

type GroupMode = "space" | "category";
type AddMode = "catalog" | "manual" | null;

export default function SiteMaterialsWorkspace({
  customerId,
  projectId = null,
  customerName,
  address,
  assigneeName,
  materials,
  categories,
  catalogItems,
  favorites,
  recentSpaces,
  signedUrls,
  totalAdditional,
  backHref,
  backLabel,
}: Props) {
  const [groupMode, setGroupMode] = useState<GroupMode>("space");
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [editing, setEditing] = useState<ProjectMaterial | null>(null);
  const [deleteOf, setDeleteOf] = useState<ProjectMaterial | null>(null);

  const groups = useMemo(() => {
    if (groupMode === "category") {
      const map = new Map<string, ProjectMaterial[]>();
      for (const m of materials) {
        const key = m.material_categories?.name || "미분류";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(m);
      }
      return [...map.entries()].map(([title, items]) => ({ title, items }));
    }
    const map = new Map<string, ProjectMaterial[]>();
    for (const m of materials) {
      const key = m.space_name?.trim() || "공통";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return [...map.entries()].map(([title, items]) => ({ title, items }));
  }, [materials, groupMode]);

  const spaceOptions = useMemo(() => {
    return [
      ...new Set([...SPACE_NAME_SUGGESTIONS, ...recentSpaces].filter(Boolean)),
    ];
  }, [recentSpaces]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={backHref} className="text-xs text-navy-800 underline">
            ← {backLabel}
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-navy-900">
            {customerName} · 마감자재
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            {[address || "주소 미등록", assigneeName ? `담당 ${assigneeName}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1 text-sm text-navy-800">
            자재 {materials.length}건 · 추가금액 합계{" "}
            {totalAdditional.toLocaleString("ko-KR")}원
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setAddMode("catalog");
            }}
            className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-medium"
          >
            카탈로그에서 추가
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setAddMode("manual");
            }}
            className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white"
          >
            직접 입력
          </button>
        </div>
      </div>

      {favorites.length > 0 && (
        <section className="rounded-xl border bg-white p-3">
          <p className="text-xs font-medium text-gray-600">즐겨찾기 원클릭 추가</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {favorites.map((fav) => (
              <form
                key={fav.id}
                action={async (fd) => {
                  const r = await addCatalogToSiteAction(fd);
                  if (!r.success) alert(r.error);
                }}
              >
                <input type="hidden" name="customer_id" value={customerId} />
                {projectId && (
                  <input type="hidden" name="project_id" value={projectId} />
                )}
                <input type="hidden" name="catalog_id" value={fav.id} />
                <input type="hidden" name="space_name" value="공통" />
                <button
                  type="submit"
                  className="rounded-full border border-gold-300 bg-gold-50 px-3 py-1 text-[11px]"
                >
                  ★ {fav.product_name}
                </button>
              </form>
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setGroupMode("space")}
          className={`rounded border px-3 py-1 text-xs ${groupMode === "space" ? "bg-navy-800 text-white" : ""}`}
        >
          공간별 보기
        </button>
        <button
          type="button"
          onClick={() => setGroupMode("category")}
          className={`rounded border px-3 py-1 text-xs ${groupMode === "category" ? "bg-navy-800 text-white" : ""}`}
        >
          분류별 보기
        </button>
      </div>

      {groups.map((group) => (
        <section key={group.title} className="space-y-3">
          <h2 className="text-sm font-semibold text-navy-900">{group.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((m) => (
              <MaterialCard
                key={m.id}
                material={m}
                signedUrls={signedUrls}
                onEdit={() => {
                  setEditing(m);
                  setAddMode("manual");
                }}
                onDelete={() => setDeleteOf(m)}
                customerId={customerId}
              />
            ))}
          </div>
        </section>
      ))}

      {materials.length === 0 && (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-500">
          등록된 현장 자재가 없습니다.
        </p>
      )}

      {(addMode || editing) && (
        <MaterialModal
          mode={editing ? "edit" : addMode!}
          customerId={customerId}
          projectId={projectId}
          categories={categories}
          catalogItems={catalogItems}
          spaceOptions={spaceOptions}
          editing={editing}
          onClose={() => {
            setAddMode(null);
            setEditing(null);
          }}
        />
      )}

      {deleteOf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="font-semibold text-navy-900">자재 삭제</h3>
            <p className="mt-2 text-sm">{deleteOf.product_name}</p>
            <form
              action={async (fd) => {
                const r = await deleteSiteMaterialAction(fd);
                if (!r.success) alert(r.error);
                else setDeleteOf(null);
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

function MaterialCard({
  material: m,
  signedUrls,
  onEdit,
  onDelete,
  customerId,
}: {
  material: ProjectMaterial;
  signedUrls: Record<string, string>;
  onEdit: () => void;
  onDelete: () => void;
  customerId: string;
}) {
  const coverPath =
    m.cover_image_path ||
    m.project_material_images?.find((i) => i.is_cover)?.file_path ||
    m.project_material_images?.[0]?.file_path ||
    null;
  const cover = coverPath ? signedUrls[coverPath] : null;

  return (
    <article className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="h-32 bg-gray-100">
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
          {[m.space_name || "공통", m.material_categories?.name]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-sm font-semibold text-navy-900">{m.product_name}</p>
        <p className="text-gray-600">
          {[m.brand, m.model_number, m.color, m.specification]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {m.application_location && (
          <p className="text-gray-500">적용: {m.application_location}</p>
        )}
        <p>
          수량 {m.quantity ?? "-"}
          {m.unit ? ` ${m.unit}` : ""} · 추가{" "}
          {(m.additional_price ?? 0).toLocaleString("ko-KR")}원
        </p>
        {(m.staff_note || m.site_note) && (
          <p className="text-gray-400">
            {[m.staff_note && `내부: ${m.staff_note}`, m.site_note && `현장: ${m.site_note}`]
              .filter(Boolean)
              .join(" / ")}
          </p>
        )}
        <div className="flex flex-wrap gap-1 pt-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded border px-2 py-1 text-[11px]"
          >
            수정
          </button>
          <form
            action={async (fd) => {
              const r = await duplicateSiteMaterialAction(fd);
              if (!r.success) alert(r.error);
            }}
          >
            <input type="hidden" name="material_id" value={m.id} />
            <button type="submit" className="rounded border px-2 py-1 text-[11px]">
              복제
            </button>
          </form>
          <form
            action={async (fd) => {
              const r = await reorderSiteMaterialAction(fd);
              if (!r.success) alert(r.error);
            }}
          >
            <input type="hidden" name="material_id" value={m.id} />
            <input type="hidden" name="customer_id" value={customerId} />
            <input type="hidden" name="direction" value="up" />
            <button type="submit" className="rounded border px-2 py-1 text-[11px]">
              ↑
            </button>
          </form>
          <form
            action={async (fd) => {
              const r = await reorderSiteMaterialAction(fd);
              if (!r.success) alert(r.error);
            }}
          >
            <input type="hidden" name="material_id" value={m.id} />
            <input type="hidden" name="customer_id" value={customerId} />
            <input type="hidden" name="direction" value="down" />
            <button type="submit" className="rounded border px-2 py-1 text-[11px]">
              ↓
            </button>
          </form>
          <button
            type="button"
            onClick={onDelete}
            className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-600"
          >
            삭제
          </button>
        </div>
      </div>
    </article>
  );
}

function MaterialModal({
  mode,
  customerId,
  projectId,
  categories,
  catalogItems,
  spaceOptions,
  editing,
  onClose,
}: {
  mode: "catalog" | "manual" | "edit";
  customerId: string;
  projectId?: string | null;
  categories: MaterialCategory[];
  catalogItems: MaterialCatalogItem[];
  spaceOptions: string[];
  editing: ProjectMaterial | null;
  onClose: () => void;
}) {
  const [catalogQ, setCatalogQ] = useState("");
  const [selectedCatalog, setSelectedCatalog] =
    useState<MaterialCatalogItem | null>(null);
  const [spaceCustom, setSpaceCustom] = useState(
    editing?.space_name || "공통",
  );

  const [createState, createAction] = useActionState(
    createSiteMaterialAction,
    initial,
  );
  const [updateState, updateAction] = useActionState(
    updateSiteMaterialAction,
    initial,
  );
  const formState = mode === "edit" ? updateState : createState;

  const filteredCatalog = useMemo(() => {
    const q = catalogQ.trim().toLowerCase();
    if (!q) return catalogItems.slice(0, 40);
    return catalogItems
      .filter((c) =>
        [c.product_name, c.brand, c.model_number, c.material_categories?.name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 40);
  }, [catalogItems, catalogQ]);

  const title =
    mode === "edit"
      ? "자재 수정"
      : mode === "catalog"
        ? "카탈로그에서 선택"
        : "직접 입력";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-navy-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-sm text-gray-400">
            닫기
          </button>
        </div>

        {mode === "catalog" && !selectedCatalog && (
          <div className="mt-3 space-y-3">
            <input
              value={catalogQ}
              onChange={(e) => setCatalogQ(e.target.value)}
              placeholder="분류·브랜드·제품명 검색"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {filteredCatalog.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCatalog(c)}
                  className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <span>
                    <span className="font-medium">{c.product_name}</span>
                    <span className="ml-2 text-xs text-gray-500">
                      {[c.material_categories?.name, c.brand, c.color]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="text-xs text-navy-800">
                    {(c.base_price ?? 0).toLocaleString("ko-KR")}
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
        )}

        {(mode === "manual" || mode === "edit" || selectedCatalog) && (
          <form
            action={mode === "edit" ? updateAction : createAction}
            className="mt-3 grid gap-3 sm:grid-cols-2"
            onSubmit={() => {
              // keep open until success handled via state
            }}
          >
            {mode === "edit" && editing && (
              <input type="hidden" name="material_id" value={editing.id} />
            )}
            <input type="hidden" name="customer_id" value={customerId} />
            {projectId && (
              <input type="hidden" name="project_id" value={projectId} />
            )}
            <input
              type="hidden"
              name="catalog_material_id"
              value={
                selectedCatalog?.id || editing?.catalog_material_id || ""
              }
            />
            <input type="hidden" name="is_active" value="true" />

            <label className="text-xs sm:col-span-2">
              자재분류 *
              <select
                name="category_id"
                required
                defaultValue={
                  selectedCatalog?.category_id ||
                  editing?.category_id ||
                  categories[0]?.id ||
                  ""
                }
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs sm:col-span-2">
              공간
              <div className="mt-1 flex flex-wrap gap-1">
                {spaceOptions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpaceCustom(s)}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${spaceCustom === s ? "bg-navy-800 text-white" : ""}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <input
                name="space_name"
                value={spaceCustom}
                onChange={(e) => setSpaceCustom(e.target.value)}
                className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="직접 입력 가능"
              />
            </label>

            <Field
              name="brand"
              label="브랜드"
              defaultValue={selectedCatalog?.brand || editing?.brand}
            />
            <Field
              name="product_name"
              label="제품명 *"
              required
              defaultValue={
                selectedCatalog?.product_name || editing?.product_name
              }
            />
            <Field
              name="model_number"
              label="모델번호"
              defaultValue={
                selectedCatalog?.model_number || editing?.model_number
              }
            />
            <Field
              name="color"
              label="색상"
              defaultValue={selectedCatalog?.color || editing?.color}
            />
            <Field
              name="specification"
              label="규격"
              defaultValue={
                selectedCatalog?.specification || editing?.specification
              }
            />
            <Field
              name="application_location"
              label="적용위치"
              defaultValue={editing?.application_location}
            />
            <Field
              name="quantity"
              label="수량"
              type="number"
              defaultValue={String(
                editing?.quantity ?? (selectedCatalog ? 1 : ""),
              )}
            />
            <Field
              name="unit"
              label="단위"
              defaultValue={
                selectedCatalog?.unit || editing?.unit || "개"
              }
            />
            <Field
              name="base_price"
              label="기본단가"
              type="number"
              defaultValue={String(
                selectedCatalog?.base_price ?? editing?.base_price ?? 0,
              )}
            />
            <Field
              name="additional_price"
              label="추가금액"
              type="number"
              defaultValue={String(editing?.additional_price ?? 0)}
            />
            <Field
              name="supplier"
              label="공급업체"
              defaultValue={selectedCatalog?.supplier || editing?.supplier}
            />
            <Field
              name="delivery_expected_at"
              label="납품예정일"
              type="date"
              defaultValue={editing?.delivery_expected_at ?? ""}
            />
            <label className="text-xs sm:col-span-2">
              내부 메모 (staff)
              <textarea
                name="staff_note"
                rows={2}
                defaultValue={
                  selectedCatalog?.description || editing?.staff_note || ""
                }
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs sm:col-span-2">
              현장 메모
              <textarea
                name="site_note"
                rows={2}
                defaultValue={editing?.site_note ?? ""}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs sm:col-span-2">
              사진
              <input
                type="file"
                name="images"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="mt-1 block w-full text-xs"
              />
            </label>

            {mode === "manual" && !selectedCatalog && (
              <label className="flex items-center gap-2 text-xs sm:col-span-2">
                <input type="checkbox" name="save_to_catalog" value="true" />
                카탈로그에도 저장
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
                onClick={onClose}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                취소
              </button>
              {formState.error && (
                <p className="self-center text-sm text-red-600">
                  {formState.error}
                </p>
              )}
              {formState.success && formState.message && (
                <p className="self-center text-sm text-emerald-700">
                  {formState.message}
                </p>
              )}
            </div>
          </form>
        )}
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
