"use client";

import { useState } from "react";
import Link from "next/link";
import {
  deleteCatalogAction,
  duplicateCatalogAction,
  toggleFavoriteCatalogAction,
} from "@/app/actions/catalog";
import type { MaterialCatalogItem, MaterialCategory } from "@/types/database";

type Props = {
  items: MaterialCatalogItem[];
  categories: MaterialCategory[];
  brands: string[];
  signedUrls: Record<string, string>;
  initialQ?: string;
  initialCategoryId?: string;
  initialBrand?: string;
  initialFavorite?: boolean;
  initialView?: "card" | "table";
  page: number;
  totalPages: number;
  total: number;
};

export default function CatalogList({
  items,
  categories,
  brands,
  signedUrls,
  initialQ = "",
  initialCategoryId = "",
  initialBrand = "",
  initialFavorite = false,
  initialView = "card",
  page,
  totalPages,
  total,
}: Props) {
  const [deleteOf, setDeleteOf] = useState<MaterialCatalogItem | null>(null);
  const [view, setView] = useState<"card" | "table">(initialView);

  function buildHref(nextPage: number) {
    const params = new URLSearchParams();
    if (initialQ) params.set("q", initialQ);
    if (initialCategoryId) params.set("category", initialCategoryId);
    if (initialBrand) params.set("brand", initialBrand);
    if (initialFavorite) params.set("favorite", "1");
    params.set("view", view);
    params.set("page", String(nextPage));
    return `/materials/catalog?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-900">자재 카탈로그</h1>
          <p className="mt-1 text-sm text-gray-600">
            총 {total.toLocaleString("ko-KR")}건 · 자재분류 → 자재제품
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/materials/settings/categories"
            className="rounded-lg border px-3 py-2 text-xs font-medium text-navy-900"
          >
            자재분류 관리
          </Link>
          <Link
            href="/materials/catalog/new"
            className="rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-white"
          >
            자재 등록
          </Link>
        </div>
      </div>

      <form
        method="get"
        action="/materials/catalog"
        className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-3"
      >
        <input type="hidden" name="view" value={view} />
        <input
          name="q"
          defaultValue={initialQ}
          placeholder="제품명·브랜드·모델 검색"
          className="min-w-[180px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
        <select
          name="category"
          defaultValue={initialCategoryId}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
        >
          <option value="">전체 자재분류</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="brand"
          defaultValue={initialBrand}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
        >
          <option value="">전체 브랜드</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-gray-600">
          <input
            type="checkbox"
            name="favorite"
            value="1"
            defaultChecked={initialFavorite}
          />
          즐겨찾기만
        </label>
        <button
          type="submit"
          className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-medium text-navy-900"
        >
          검색
        </button>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => setView("card")}
            className={`rounded border px-2 py-1 text-[11px] ${view === "card" ? "bg-navy-800 text-white" : ""}`}
          >
            카드
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className={`rounded border px-2 py-1 text-[11px] ${view === "table" ? "bg-navy-800 text-white" : ""}`}
          >
            표
          </button>
        </div>
      </form>

      {view === "card" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <CatalogCard
              key={item.id}
              item={item}
              categories={categories}
              signedUrls={signedUrls}
              onDelete={() => setDeleteOf(item)}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2">분류</th>
                <th className="px-3 py-2">제품명</th>
                <th className="px-3 py-2">브랜드</th>
                <th className="px-3 py-2">모델</th>
                <th className="px-3 py-2">단가</th>
                <th className="px-3 py-2">작업</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const categoryName =
                  item.material_categories?.name ||
                  categories.find((c) => c.id === item.category_id)?.name ||
                  "-";
                return (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-2 text-xs">{categoryName}</td>
                    <td className="px-3 py-2 font-medium">
                      {item.is_favorite ? "★ " : ""}
                      {item.product_name}
                    </td>
                    <td className="px-3 py-2 text-xs">{item.brand || "-"}</td>
                    <td className="px-3 py-2 text-xs">
                      {item.model_number || "-"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {(item.base_price ?? 0).toLocaleString("ko-KR")}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Link
                          href={`/materials/catalog/${item.id}/edit`}
                          className="rounded border px-2 py-1 text-[11px]"
                        >
                          수정
                        </Link>
                        <button
                          type="button"
                          onClick={() => setDeleteOf(item)}
                          className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-600"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {items.length === 0 && (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-500">
          등록된 자재가 없습니다.
        </p>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Link
            href={buildHref(Math.max(1, page - 1))}
            className={`rounded border px-3 py-1 text-xs ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
          >
            이전
          </Link>
          <span className="text-xs text-gray-600">
            {page} / {totalPages}
          </span>
          <Link
            href={buildHref(Math.min(totalPages, page + 1))}
            className={`rounded border px-3 py-1 text-xs ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
          >
            다음
          </Link>
        </div>
      )}

      {deleteOf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="font-semibold text-navy-900">자재 삭제</h3>
            <p className="mt-2 text-sm text-gray-600">{deleteOf.product_name}</p>
            <form
              action={async (fd) => {
                const r = await deleteCatalogAction(fd);
                if (!r.success) alert(r.error);
                else setDeleteOf(null);
              }}
              className="mt-3 space-y-3"
            >
              <input type="hidden" name="catalog_id" value={deleteOf.id} />
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

function CatalogCard({
  item,
  categories,
  signedUrls,
  onDelete,
}: {
  item: MaterialCatalogItem;
  categories: MaterialCategory[];
  signedUrls: Record<string, string>;
  onDelete: () => void;
}) {
  const coverPath =
    item.cover_image_path ||
    item.material_catalog_images?.find((img) => img.is_cover)?.file_path ||
    item.material_catalog_images?.[0]?.file_path ||
    null;
  const cover = coverPath ? signedUrls[coverPath] : null;
  const categoryName =
    item.material_categories?.name ||
    categories.find((c) => c.id === item.category_id)?.name ||
    "-";

  return (
    <article className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="h-36 bg-gray-100">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-400">
            No image
          </div>
        )}
      </div>
      <div className="space-y-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-navy-900">{item.product_name}</p>
          {item.is_favorite && <span className="text-xs text-gold-600">★</span>}
        </div>
        <p className="text-xs text-gray-500">
          {[categoryName, item.brand, item.model_number, item.color]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-xs text-navy-800">
          {(item.base_price ?? 0).toLocaleString("ko-KR")}원
          {item.unit ? ` / ${item.unit}` : ""}
        </p>
        <div className="flex flex-wrap gap-1 pt-2">
          <Link
            href={`/materials/catalog/${item.id}/edit`}
            className="rounded border px-2 py-1 text-[11px]"
          >
            수정
          </Link>
          <form
            action={async (fd) => {
              try {
                await duplicateCatalogAction(fd);
              } catch (error) {
                if (typeof error === "object" && error && "digest" in error) {
                  throw error;
                }
                alert(error instanceof Error ? error.message : "복제 실패");
              }
            }}
          >
            <input type="hidden" name="catalog_id" value={item.id} />
            <button type="submit" className="rounded border px-2 py-1 text-[11px]">
              복제
            </button>
          </form>
          <form
            action={async (fd) => {
              const r = await toggleFavoriteCatalogAction(fd);
              if (!r.success) alert(r.error);
            }}
          >
            <input type="hidden" name="catalog_id" value={item.id} />
            <input
              type="hidden"
              name="is_favorite"
              value={item.is_favorite ? "false" : "true"}
            />
            <button type="submit" className="rounded border px-2 py-1 text-[11px]">
              {item.is_favorite ? "★해제" : "★추가"}
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
