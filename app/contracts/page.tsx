import Link from "next/link";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { contractRevisionLabel, contractStatusLabel } from "@/lib/crm/contract-constants";
import { listContracts } from "@/lib/crm/contracts";
import type { Contract } from "@/types/database";

export default async function ContractsPage() {
  let contracts: Contract[] = [];
  let error: string | null = null;
  try {
    contracts = await listContracts();
  } catch {
    error = "계약 목록을 불러오지 못했습니다. 계약 라이프사이클 마이그레이션 적용 상태를 확인해 주세요.";
  }
  return <DashboardLayout><div className="space-y-6"><div><h1 className="text-xl font-bold text-gray-900 lg:text-2xl">계약관리</h1><p className="mt-1 text-sm text-gray-500">원계약 · 변경계약 · 추가계약 · 해지 이력을 관리합니다.</p></div>{error && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}<div className="overflow-hidden rounded-xl border border-gray-200 bg-white"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="px-4 py-3">계약번호</th><th className="px-4 py-3">고객 / 현장</th><th className="px-4 py-3">상태</th><th className="px-4 py-3 text-right">계약금액</th><th className="px-4 py-3">계약일</th></tr></thead><tbody>{contracts.map((contract) => <tr key={contract.id} className="border-t border-gray-100 hover:bg-gray-50"><td className="px-4 py-3"><Link href={`/contracts/${contract.id}`} className="font-medium text-navy-900 hover:underline">{contract.contract_number}<span className="block text-xs text-gray-500">{contractRevisionLabel(contract.contract_kind, contract.revision_seq) ?? "원계약"}</span></Link></td><td className="px-4 py-3">{contract.customers?.name ?? "-"}<span className="block text-xs text-gray-500">{contract.projects?.name ?? "-"}</span></td><td className="px-4 py-3">{contractStatusLabel(contract.status)}</td><td className="px-4 py-3 text-right">{Number(contract.contract_amount).toLocaleString("ko-KR")}원</td><td className="px-4 py-3 text-gray-500">{contract.contract_date}</td></tr>)}{!contracts.length && !error && <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-500">등록된 계약이 없습니다.</td></tr>}</tbody></table></div></div></div></DashboardLayout>;
}
