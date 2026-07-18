import Link from "next/link";
import { notFound } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import SiteMaterialsWorkspace from "@/components/materials/SiteMaterialsWorkspace";
import { listMaterialCatalog } from "@/lib/crm/catalog";
import { listMaterialCategories } from "@/lib/crm/categories";
import { getCustomerById } from "@/lib/crm/customers";
import { getProjectById } from "@/lib/crm/projects";
import {
  createSignedUrlsForPaths,
  listProjectIdMaterials,
} from "@/lib/crm/site-materials";
import type {
  MaterialCatalogItem,
  MaterialCategory,
} from "@/types/database";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ProjectMaterialsPage({ params }: Props) {
  const { id: projectId } = await params;

  const project = await getProjectById(projectId).catch(() => null);
  if (!project) notFound();

  const customer = await getCustomerById(project.customer_id).catch(() => null);
  if (!customer || customer.deleted_at) notFound();

  let materials: Awaited<ReturnType<typeof listProjectIdMaterials>> = [];
  let categories: MaterialCategory[] = [];
  let catalogItems: MaterialCatalogItem[] = [];
  let signedUrls: Record<string, string> = {};
  let loadError: string | null = null;

  try {
    const [mats, cats, catalog] = await Promise.all([
      listProjectIdMaterials(projectId),
      listMaterialCategories({ includeInactive: false }),
      listMaterialCatalog({ pageSize: 300 }),
    ]);
    materials = mats;
    categories = cats;
    catalogItems = catalog;
    const imagePaths = materials
      .map((m) => m.cover_image_path)
      .filter((p): p is string => Boolean(p));
    signedUrls = await createSignedUrlsForPaths(imagePaths);
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "알 수 없는 오류";
  }

  if (loadError) {
    return (
      <DashboardLayout>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-medium">현장 자재를 불러오지 못했습니다.</p>
          <p className="mt-2">{loadError}</p>
          <Link
            href={`/customers/${customer.id}`}
            className="mt-4 inline-block text-navy-800 underline"
          >
            고객 상세로
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <SiteMaterialsWorkspace
        customerId={customer.id}
        projectId={projectId}
        siteName={project.name}
        siteStatus={project.status}
        customerName={customer.name}
        phone={customer.phone}
        address={project.address || customer.address}
        assigneeName={
          project.employees?.name || customer.employees?.name || null
        }
        materials={materials}
        categories={categories}
        catalogItems={catalogItems}
        signedUrls={signedUrls}
        backHref={`/customers/${customer.id}`}
        backLabel="고객 상세"
      />
    </DashboardLayout>
  );
}
