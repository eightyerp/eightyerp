import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CatalogList from "@/components/materials/CatalogList";
import {
  createSignedCatalogUrl,
  listCatalogBrands,
  listMaterialCatalogPaged,
} from "@/lib/crm/catalog";
import { listMaterialCategories } from "@/lib/crm/categories";
import type { MaterialCatalogItem, MaterialCategory } from "@/types/database";

type Props = {
  searchParams: Promise<{
    q?: string;
    category?: string;
    brand?: string;
    favorite?: string;
    view?: string;
    page?: string;
  }>;
};

export default async function MaterialsCatalogPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const categoryId = sp.category?.trim() || "";
  const brand = sp.brand?.trim() || "";
  const favoriteOnly = sp.favorite === "1";
  const view = sp.view === "table" ? "table" : "card";
  const page = Math.max(1, Number(sp.page || 1) || 1);

  let items: MaterialCatalogItem[] = [];
  let categories: MaterialCategory[] = [];
  let brands: string[] = [];
  let total = 0;
  let totalPages = 1;
  let errorMessage: string | null = null;

  try {
    const [paged, cats, brandList] = await Promise.all([
      listMaterialCatalogPaged({
        q: q || undefined,
        categoryId: categoryId || undefined,
        brand: brand || undefined,
        favoriteOnly,
        page,
      }),
      listMaterialCategories({ includeInactive: true }),
      listCatalogBrands(),
    ]);
    items = paged.items;
    total = paged.total;
    totalPages = paged.totalPages;
    categories = cats;
    brands = brandList;
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "카탈로그를 불러오지 못했습니다. 마이그레이션을 확인해 주세요.";
  }

  const paths = [
    ...new Set(
      items.flatMap((item) => {
        const fromCover = item.cover_image_path ? [item.cover_image_path] : [];
        const fromImages = (item.material_catalog_images ?? []).map(
          (img) => img.file_path,
        );
        return [...fromCover, ...fromImages];
      }),
    ),
  ];

  const signedUrls: Record<string, string> = {};
  await Promise.all(
    paths.map(async (path) => {
      try {
        signedUrls[path] = await createSignedCatalogUrl(path);
      } catch {
        // ignore
      }
    }),
  );

  return (
    <DashboardLayout>
      {errorMessage ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {errorMessage}
        </div>
      ) : (
        <CatalogList
          items={items}
          categories={categories.filter((c) => c.is_active || c.id === categoryId)}
          brands={brands}
          signedUrls={signedUrls}
          initialQ={q}
          initialCategoryId={categoryId}
          initialBrand={brand}
          initialFavorite={favoriteOnly}
          initialView={view}
          page={page}
          totalPages={totalPages}
          total={total}
        />
      )}
    </DashboardLayout>
  );
}
