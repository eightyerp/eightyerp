import { redirect } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ExpenseV2PreviewBoard from "@/components/finance/ExpenseV2PreviewBoard";
import { getExpenseAccess, listExpenseRequests } from "@/lib/crm/expenses";

export default async function ExpenseV2PreviewPage() {
  const access = await getExpenseAccess();
  if (!access.isFinanceAdmin) redirect("/finance/payments");

  const rows = await listExpenseRequests(100);
  const previewRows = rows.map((row) => ({
    id: row.id,
    description: row.description,
    totalAmount: Number(row.total_amount || 0),
    status: row.status,
    paymentMethod: row.payment_method,
    category: row.category,
    workTrade: row.work_trade,
    taxEvidenceType: row.tax_evidence_type,
    hasDocument: Boolean(row.expense_documents?.length),
    projectName: row.projects?.name ?? null,
    vendorName: row.vendors?.name ?? row.vendor_name_snapshot ?? null,
  }));

  return (
    <DashboardLayout>
      <ExpenseV2PreviewBoard rows={previewRows} />
    </DashboardLayout>
  );
}
