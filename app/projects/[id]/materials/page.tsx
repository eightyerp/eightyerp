import Link from "next/link";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import SiteMaterialsWorkspace from "@/components/materials/SiteMaterialsWorkspace";
import { listFavoriteCatalog, listMaterialCatalog } from "@/lib/crm/catalog";
import { listMaterialCategories } from "@/lib/crm/categories";
import { getCustomerById } from "@/lib/crm/customers";
import {
  calcTotalAdditionalPrice,
  createSignedUrlsForPaths,
  listProjectIdMaterials,
  listRecentSpaceNames,
} from "@/lib/crm/site-materials";
import { createClient } from "@/lib/supabase-server";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ProjectMaterialsPage({ params }: Props) {
  const { id: projectId } = await params;

  try {
    const materials = await listProjectIdMaterials(projectId);
    const customerId = materials[0]?.customer_id;
    if (!customerId) {
      return (
        <DashboardLayout>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            <p className="font-medium">이 현장 ID에 연결된 자재가 없습니다.</p>
            <p className="mt-2">
              projects 테이블이 없거나 아직 자재가 등록되지 않았습니다. 고객
              상세의 마감자재 화면에서 등록해 주세요.
            </p>
            <Link
              href="/customers"
              className="mt-4 inline-block text-navy-800 underline"
            >
              고객 목록
            </Link>
          </div>
        </DashboardLayout>
      );
    }

    const customer = await getCustomerById(customerId);
    if (!customer) {
      return (
        <DashboardLayout>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm">
            고객 정보를 찾을 수 없습니다.
          </div>
        </DashboardLayout>
      );
    }

    const [categories, catalogItems, favorites, recentSpaces] =
      await Promise.all([
        listMaterialCategories({ includeInactive: false }),
        listMaterialCatalog({ pageSize: 200 }),
        listFavoriteCatalog().catch(() => []),
        listRecentSpaceNames(customerId).catch(() => []),
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
          customerId={customerId}
          projectId={projectId}
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
          backHref={`/customers/${customerId}`}
          backLabel="고객 상세"
        />
      </DashboardLayout>
    );
  } catch (error) {
    // projects 테이블 존재 여부 안내
    const supabase = await createClient();
    const { error: projErr } = await supabase
      .from("projects")
      .select("id")
      .limit(1);

    return (
      <DashboardLayout>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-medium">현장 자재를 불러오지 못했습니다.</p>
          <p className="mt-2">
            {error instanceof Error ? error.message : "알 수 없는 오류"}
          </p>
          {projErr && (
            <p className="mt-2 text-xs">
              projects 테이블이 없습니다. 고객별 자재 화면(
              /customers/[id]/materials )을 이용해 주세요.
            </p>
          )}
        </div>
      </DashboardLayout>
    );
  }
}
