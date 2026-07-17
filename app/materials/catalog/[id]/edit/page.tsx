import { notFound } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CatalogForm from "@/components/materials/CatalogForm";
import {
  createSignedCatalogUrl,
  getCatalogItem,
} from "@/lib/crm/catalog";
import { listMaterialCategories } from "@/lib/crm/categories";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditCatalogPage({ params }: Props) {
  const { id } = await params;
  const item = await getCatalogItem(id);
  if (!item) notFound();

  const categories = await listMaterialCategories({ includeInactive: true });
  const activeCategories = categories.filter(
    (c) => c.is_active || c.id === item.category_id,
  );

  const paths = [
    ...new Set(
      [
        item.cover_image_path,
        ...(item.material_catalog_images ?? []).map((img) => img.file_path),
      ].filter((p): p is string => Boolean(p)),
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
      <CatalogForm
        mode="edit"
        categories={activeCategories}
        item={item}
        signedUrls={signedUrls}
      />
    </DashboardLayout>
  );
}
