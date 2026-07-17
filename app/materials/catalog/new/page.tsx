import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CatalogForm from "@/components/materials/CatalogForm";
import { listMaterialCategories } from "@/lib/crm/categories";
import type { MaterialCategory } from "@/types/database";

export default async function NewCatalogPage() {
  let categories: MaterialCategory[] = [];
  let errorMessage: string | null = null;

  try {
    categories = await listMaterialCategories({ includeInactive: false });
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "분류 목록을 불러오지 못했습니다.";
  }

  return (
    <DashboardLayout>
      {errorMessage ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {errorMessage}
        </div>
      ) : (
        <CatalogForm mode="create" categories={categories} />
      )}
    </DashboardLayout>
  );
}
