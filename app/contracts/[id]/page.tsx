import Link from "next/link";
import { notFound } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ContractDetailView from "@/components/contracts/ContractDetailView";
import { getContractById } from "@/lib/crm/contracts";

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let contract;
  try {
    contract = await getContractById(id);
  } catch {
    return <DashboardLayout><p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">계약 정보를 불러오지 못했습니다.</p></DashboardLayout>;
  }
  if (!contract) notFound();
  return <DashboardLayout><div className="space-y-6"><div className="flex items-center justify-between gap-3"><div><p className="text-xs text-gray-400">계약 상세</p><h1 className="text-xl font-bold text-gray-900 lg:text-2xl">{contract.title || contract.contract_number}</h1></div><Link href="/contracts" className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">목록으로</Link></div><ContractDetailView contract={contract}/></div></DashboardLayout>;
}
