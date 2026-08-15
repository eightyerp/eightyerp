import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CollectionsV2Preview from "@/components/finance/CollectionsV2Preview";
import { getFinanceV2PreviewBundle } from "@/lib/crm/finance-v2-preview-bundle";

export default async function CollectionsV2PreviewPage() {
  const bundle = await getFinanceV2PreviewBundle();
  if (!bundle) redirect("/dashboard");

  return (
    <DashboardLayout>
      <CollectionsV2Preview bundle={bundle} />
    </DashboardLayout>
  );
}
