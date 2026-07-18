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
  listCustomerMaterials,
} from "@/lib/crm/site-materials";
import type {
  MaterialCatalogItem,
  MaterialCategory,
} from "@/types/database";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ projectId?: string }>;
};

export default async function CustomerMaterialsPage({
  params,
  searchParams,
}: Props) {
  const { id: customerId } = await params;
  const query = await searchParams;
  const projectId = query.projectId?.trim() || null;

  const customer = await getCustomerById(customerId).catch(() => null);
  if (!customer || customer.deleted_at) notFound();

  const project = projectId
    ? await getProjectById(projectId).catch(() => null)
    : null;
  if (projectId && (!project || project.customer_id !== customerId)) {
    notFound();
  }

  let materials: Awaited<ReturnType<typeof listCustomerMaterials>> = [];
  let categories: MaterialCategory[] = [];
  let catalogItems: MaterialCatalogItem[] = [];
  let signedUrls: Record<string, string> = {};
  let loadError: string | null = null;

  try {
    const [mats, cats, catalog] = await Promise.all([
      listCustomerMaterials(customerId, { projectId }),
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
          <p className="font-medium">마감자재를 불러오지 못했습니다.</p>
          <p className="mt-2">{loadError}</p>
          <Link
            href={`/customers/${customerId}`}
            className="mt-4 inline-block text-navy-800 underline"
          >
            고객 상세로
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const assignee =
    project?.employees?.name || customer.employees?.name || null;

  return (
    <DashboardLayout>
      <SiteMaterialsWorkspace
        customerId={customerId}
        projectId={projectId}
        siteName={project?.name ?? null}
        siteStatus={project?.status ?? null}
        customerName={customer.name}
        phone={customer.phone}
        address={project?.address || customer.address}
        assigneeName={assignee}
        materials={materials}
        categories={categories}
        catalogItems={catalogItems}
        signedUrls={signedUrls}
        backHref={`/customers/${customerId}`}
        backLabel="고객 상세"
      />
    </DashboardLayout>
  );
}
