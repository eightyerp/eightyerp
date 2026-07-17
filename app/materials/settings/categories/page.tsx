import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CategorySettings from "@/components/materials/CategorySettings";
import { listMaterialCategories } from "@/lib/crm/categories";

export default async function MaterialCategoriesPage() {
  let errorMessage: string | null = null;

  try {
    const categories = await listMaterialCategories({ includeInactive: true });
    return (
      <DashboardLayout>
        <CategorySettings categories={categories} />
      </DashboardLayout>
    );
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "자재분류를 불러오지 못했습니다. 마이그레이션을 확인해 주세요.";
  }

  return (
    <DashboardLayout>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        {errorMessage}
      </div>
    </DashboardLayout>
  );
}
