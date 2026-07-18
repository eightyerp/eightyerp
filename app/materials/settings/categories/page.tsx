import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CategorySettings from "@/components/materials/CategorySettings";
import { listMaterialCategories } from "@/lib/crm/categories";
import type { MaterialCategory } from "@/types/database";

export default async function MaterialCategoriesPage() {
  let categories: MaterialCategory[] = [];
  let errorMessage: string | null = null;

  try {
    categories = await listMaterialCategories({ includeInactive: true });
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "자재분류를 불러오지 못했습니다. 마이그레이션을 확인해 주세요.";
  }

  if (errorMessage) {
    return (
      <DashboardLayout>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {errorMessage}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <CategorySettings categories={categories} />
    </DashboardLayout>
  );
}
