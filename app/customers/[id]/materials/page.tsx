import Link from "next/link";
import { notFound } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import SiteMaterialsWorkspace from "@/components/materials/SiteMaterialsWorkspace";
import { listFavoriteCatalog, listMaterialCatalog } from "@/lib/crm/catalog";
import { listMaterialCategories } from "@/lib/crm/categories";
import { getCustomerById } from "@/lib/crm/customers";
import {
  calcTotalAdditionalPrice,
  createSignedUrlsForPaths,
  listCustomerMaterials,
  listRecentSpaceNames,
} from "@/lib/crm/site-materials";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CustomerMaterialsPage({ params }: Props) {
  const { id } = await params;

  let customer;
  try {
    customer = await getCustomerById(id);
  } catch {
    notFound();
  }
  if (!customer || customer.deleted_at) notFound();

  let errorMessage: string | null = null;

  try {
    const [materials, categories, catalogItems, favorites, recentSpaces] =
      await Promise.all([
        listCustomerMaterials(id),
        listMaterialCategories({ includeInactive: false }),
        listMaterialCatalog({ pageSize: 200 }),
        listFavoriteCatalog().catch(() => []),
        listRecentSpaceNames(id).catch(() => []),
      ]);

    const imagePaths = materials.flatMap((m) => [
      m.cover_image_path,
      ...(m.project_material_images ?? []).map((i) => i.file_path),
    ]);
    const signedUrls = await createSignedUrlsForPaths(
      imagePaths.filter((p): p is string => Boolean(p)),
    );

    return (
      <DashboardLayout>
        <SiteMaterialsWorkspace
          customerId={id}
          customerName={customer.name}
          address={customer.address}
          assigneeName={customer.employees?.name ?? null}
          materials={materials}
          categories={categories}
          catalogItems={catalogItems}
          favorites={favorites}
          recentSpaces={recentSpaces}
          signedUrls={signedUrls}
          totalAdditional={calcTotalAdditionalPrice(materials)}
          backHref={`/customers/${id}`}
          backLabel="고객 상세"
        />
      </DashboardLayout>
    );
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "자재 데이터를 불러오지 못했습니다. 마이그레이션을 확인해 주세요.";
  }

  return (
    <DashboardLayout>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <p className="font-medium">마감자재를 불러오지 못했습니다.</p>
        <p className="mt-2">{errorMessage}</p>
        <p className="mt-2 text-xs">
          supabase/migrations/20260720000001_project_materials_staff.sql 을
          실행했는지 확인해 주세요.
        </p>
        <Link
          href={`/customers/${id}`}
          className="mt-4 inline-block text-navy-800 underline"
        >
          고객 상세로 돌아가기
        </Link>
      </div>
    </DashboardLayout>
  );
}
