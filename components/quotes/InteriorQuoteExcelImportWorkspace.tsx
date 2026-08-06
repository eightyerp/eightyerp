"use client";

import { useRouter } from "next/navigation";
import InteriorQuoteExcelImportModal from "./InteriorQuoteExcelImportModal";
import type { InteriorImportCustomerOption } from "@/lib/crm/interior-quote-import";
import type { Employee } from "@/types/database";

export default function InteriorQuoteExcelImportWorkspace({ customers, employees, lockEmployeeId, defaultEmployeeId }: { customers: InteriorImportCustomerOption[]; employees: Employee[]; lockEmployeeId: string | null; defaultEmployeeId: string | null }) {
  const router = useRouter();
  return <InteriorQuoteExcelImportModal open onClose={() => router.push("/quotes")} customers={customers} employees={employees} lockEmployeeId={lockEmployeeId} defaultEmployeeId={defaultEmployeeId} />;
}
