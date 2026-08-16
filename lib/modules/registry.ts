export const ERP_MODULE_IDS = [
  "core", "crm", "quotes", "contracts", "projects", "schedules", "finance",
  "inventory", "documents", "notifications", "analytics", "hr", "system", "ai",
] as const;

export type ErpModuleId = (typeof ERP_MODULE_IDS)[number];

export type ErpModuleDefinition = {
  id: ErpModuleId;
  label: string;
  description: string;
  publicInterfaces: readonly string[];
};

export const ERP_MODULES: readonly ErpModuleDefinition[] = [
  { id: "core", label: "핵심", description: "인증·회사·권한·공통 UI", publicInterfaces: ["getCurrentUserAccess", "DashboardLayout"] },
  { id: "crm", label: "고객·영업", description: "고객·상담·유입경로", publicInterfaces: ["Customer", "getCustomers", "listCustomerPipeline"] },
  { id: "quotes", label: "견적", description: "창호·인테리어·Excel 견적", publicInterfaces: ["ErpQuote", "createQuote"] },
  { id: "contracts", label: "계약", description: "계약 생명주기", publicInterfaces: ["Contract", "transition_quote_to_contract"] },
  { id: "projects", label: "현장", description: "현장·자재 배정", publicInterfaces: ["Project"] },
  { id: "schedules", label: "일정", description: "고객상담·공정 일정", publicInterfaces: ["ScheduleAccess"] },
  { id: "finance", label: "회계·정산", description: "수금·지출·손익", publicInterfaces: ["FinanceWorkspace"] },
  { id: "inventory", label: "자재·구매", description: "카탈로그·분류·발주", publicInterfaces: ["MaterialCatalog"] },
  { id: "documents", label: "문서", description: "견적·계약·증빙 문서", publicInterfaces: ["QuoteDocumentView"] },
  { id: "notifications", label: "알림", description: "알림 이벤트와 이력", publicInterfaces: ["enqueueNotificationEvent"] },
  { id: "analytics", label: "통계·경영", description: "경영·광고 성과", publicInterfaces: [] },
  { id: "hr", label: "직원", description: "직원 Master·정산", publicInterfaces: ["Employee"] },
  { id: "system", label: "시스템", description: "가입·초대·회사 설정", publicInterfaces: ["requireAdminAccess"] },
  { id: "ai", label: "AI", description: "Excel 인식·추천", publicInterfaces: ["QuoteExcelAdapter"] },
] as const;
