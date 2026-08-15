import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import FinanceWorkHubPreview from "@/components/finance/FinanceWorkHubPreview";
import { getFinanceV2PreviewBundle } from "@/lib/crm/finance-v2-preview-bundle";

export default async function FinanceWorkPreviewPage() {
  const bundle = await getFinanceV2PreviewBundle();
  if (!bundle) redirect("/dashboard");

  return (
    <DashboardLayout>
      <FinanceWorkHubPreview bundle={bundle} />
    </DashboardLayout>
  );
}
