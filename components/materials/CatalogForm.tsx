"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  createCatalogAction,
  reorderCatalogImageAction,
  setCatalogCoverAction,
  updateCatalogAction,
  type CatalogActionResult,
} from "@/app/actions/catalog";
import { quickCreateCategoryAction } from "@/app/actions/categories";
import type { MaterialCatalogItem, MaterialCategory } from "@/types/database";

const initial: CatalogActionResult = { success: false };

type Props = {
  mode: "create" | "edit";
  categories: MaterialCategory[];
  item?: MaterialCatalogItem | null;
  signedUrls?: Record<string, string>;
};

export default function CatalogForm({
  mode,
  categories: initialCategories,
  item = null,
  signedUrls = {},
}: Props) {
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState(
    item?.category_id ?? initialCategories[0]?.id ?? "",
  );
  const [showQuickCategory, setShowQuickCategory] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickPending, setQuickPending] = useState(false);

  const action = mode === "edit" ? updateCatalogAction : createCatalogAction;
  const [state, formAction] = useActionState(action, initial);

  async function handleQuickCategory() {
    setQuickError(null);
    setQuickPending(true);
    try {
      const fd = new FormData();
      fd.set("name", quickName);
      const result = await quickCreateCategoryAction(fd);
      if (!result.success || !result.category) {
        setQuickError(result.error || "분류 추가 실패");
        return;
      }
      setCategories((prev) =>
        [...prev, result.category!].sort(
          (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ko"),
        ),
      );
      setCategoryId(result.category.id);
      setQuickName("");
      setShowQuickCategory(false);
    } finally {
      setQuickPending(false);
    }
  }

  const existingImages = [...(item?.material_catalog_images ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-navy-900">
            {mode === "edit" ? "자재 수정" : "자재 등록"}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            자재분류를 선택하고 제품 정보를 등록합니다.
          </p>
        </div>
        <Link
          href="/materials/catalog"
          className="rounded-lg border px-3 py-2 text-xs text-gray-700"
        >
          목록으로
        </Link>
      </div>

      <form
        action={formAction}
        className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2"
      >
        {mode === "edit" && item && (
          <input type="hidden" name="catalog_id" value={item.id} />
        )}

        <div className="sm:col-span-2">
          <label className="text-xs text-gray-600">
            자재분류 *
            <select
              name="category_id"
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">선택</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setShowQuickCategory((v) => !v)}
            className="mt-2 text-xs font-medium text-navy-800 underline"
          >
            + 자재분류 추가
          </button>
          {showQuickCategory && (
            <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
              <label className="min-w-[180px] flex-1 text-xs text-gray-600">
                새 분류명
                <input
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={quickPending}
                onClick={handleQuickCategory}
                className="rounded-lg bg-navy-800 px-3 py-2 text-xs text-white disabled:opacity-50"
              >
                {quickPending ? "추가 중…" : "추가하고 선택"}
              </button>
              {quickError && (
                <p className="w-full text-xs text-red-600">{quickError}</p>
              )}
            </div>
          )}
        </div>

        <Field name="brand" label="브랜드" defaultValue={item?.brand} />
        <Field
          name="product_name"
          label="제품명 *"
          required
          defaultValue={item?.product_name}
          placeholder="예: 지아마루 오크"
        />
        <Field
          name="model_number"
          label="모델번호"
          defaultValue={item?.model_number}
        />
        <Field name="color" label="색상" defaultValue={item?.color} />
        <Field
          name="specification"
          label="규격"
          defaultValue={item?.specification}
        />
        <Field name="unit" label="단위" defaultValue={item?.unit ?? "개"} />
        <Field
          name="base_price"
          label="기본단가(원)"
          type="number"
          defaultValue={String(item?.base_price ?? 0)}
        />
        <Field name="supplier" label="공급업체" defaultValue={item?.supplier} />
        <label className="text-xs text-gray-600 sm:col-span-2">
          제품 설명
          <textarea
            name="description"
            rows={2}
            defaultValue={item?.description ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs text-gray-600 sm:col-span-2">
          내부 메모
          <textarea
            name="internal_memo"
            rows={2}
            defaultValue={item?.internal_memo ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          />
        </label>

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            name="is_favorite"
            value="true"
            defaultChecked={item?.is_favorite}
          />
          즐겨찾기
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            name="is_active"
            value="true"
            defaultChecked={item?.is_active ?? true}
          />
          사용 여부
        </label>

        <label className="text-xs sm:col-span-2">
          대표사진
          <input
            type="file"
            name="cover_images"
            accept="image/jpeg,image/png,image/webp"
            className="mt-1 block w-full text-xs"
          />
        </label>
        <label className="text-xs sm:col-span-2">
          추가사진 (여러 장, 자재당 최대 10장, 장당 10MB)
          <input
            type="file"
            name="gallery_images"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="mt-1 block w-full text-xs"
          />
        </label>

        {existingImages.length > 0 && (
          <div className="space-y-2 sm:col-span-2">
            <p className="text-xs font-medium text-gray-600">등록된 사진</p>
            <div className="flex flex-wrap gap-3">
              {existingImages.map((img) => {
                const url = signedUrls[img.file_path];
                return (
                  <div key={img.id} className="w-28 space-y-1">
                    <div className="relative h-20 overflow-hidden rounded border bg-gray-50">
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                      {img.is_cover && (
                        <span className="absolute left-1 top-1 rounded bg-gold-500 px-1 text-[10px] text-white">
                          대표
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {!img.is_cover && (
                        <form
                          action={async (fd) => {
                            const r = await setCatalogCoverAction(fd);
                            if (!r.success) alert(r.error);
                          }}
                        >
                          <input type="hidden" name="catalog_id" value={item!.id} />
                          <input type="hidden" name="image_id" value={img.id} />
                          <button
                            type="submit"
                            className="rounded border px-1 py-0.5 text-[10px]"
                          >
                            대표
                          </button>
                        </form>
                      )}
                      <form
                        action={async (fd) => {
                          const r = await reorderCatalogImageAction(fd);
                          if (!r.success) alert(r.error);
                        }}
                      >
                        <input type="hidden" name="catalog_id" value={item!.id} />
                        <input type="hidden" name="image_id" value={img.id} />
                        <input type="hidden" name="direction" value="up" />
                        <button
                          type="submit"
                          className="rounded border px-1 py-0.5 text-[10px]"
                        >
                          ↑
                        </button>
                      </form>
                      <form
                        action={async (fd) => {
                          const r = await reorderCatalogImageAction(fd);
                          if (!r.success) alert(r.error);
                        }}
                      >
                        <input type="hidden" name="catalog_id" value={item!.id} />
                        <input type="hidden" name="image_id" value={img.id} />
                        <input type="hidden" name="direction" value="down" />
                        <button
                          type="submit"
                          className="rounded border px-1 py-0.5 text-[10px]"
                        >
                          ↓
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button
            type="submit"
            className="rounded-lg bg-navy-800 px-4 py-2 text-sm text-white"
          >
            저장
          </button>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          {state.message && (
            <p className="text-sm text-emerald-700">{state.message}</p>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  defaultValue,
  required,
  type = "text",
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="text-xs text-gray-600">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
      />
    </label>
  );
}
