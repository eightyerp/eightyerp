import { getContactBucket } from "@/lib/crm/contact";
import { requireCustomerAccess } from "@/lib/crm/customer-access";
import { createClient } from "@/lib/supabase-server";
import type {
  ContactBucket,
  Customer,
  CustomerStatus,
  Employee,
  LeadSource,
} from "@/types/database";

const PIPELINE_PAGE_SIZE = 500;

export type CustomerPipelineItem = Pick<
  Customer,
  | "id"
  | "name"
  | "phone"
  | "address"
  | "consultation_type"
  | "status"
  | "assigned_employee_id"
  | "next_contact_at"
  | "created_at"
  | "updated_at"
> & {
  employees: Pick<Employee, "id" | "name" | "title"> | null;
  lead_sources: Pick<LeadSource, "id" | "name"> | null;
  contact_bucket: ContactBucket;
};

export const CUSTOMER_PIPELINE_STAGES = [
  {
    key: "new",
    label: "신규 문의",
    description: "신규 접수 · 첫 연락 전",
    statuses: ["신규", "미연락"],
    className: "border-sky-200 bg-sky-50/80",
  },
  {
    key: "consulting",
    label: "상담 진행",
    description: "첫 연락 · 상담 · 방문",
    statuses: ["1차 연락완료", "상담중", "방문예약"],
    className: "border-blue-200 bg-blue-50/70",
  },
  {
    key: "quoting",
    label: "실측 · 견적",
    description: "실측 예약 · 견적 작성/제출",
    statuses: ["실측예약", "견적작성중", "견적제출"],
    className: "border-violet-200 bg-violet-50/70",
  },
  {
    key: "negotiating",
    label: "계약 협의",
    description: "조건 조율 · 계약 전환 대기",
    statuses: ["계약협의"],
    className: "border-amber-200 bg-amber-50/80",
  },
  {
    key: "delivery",
    label: "계약 · 시공",
    description: "계약 완료 · 시공 진행",
    statuses: ["계약완료", "계약", "시공예정", "시공중"],
    className: "border-emerald-200 bg-emerald-50/70",
  },
  {
    key: "closed",
    label: "완료 · 이탈",
    description: "완료 · 보류 · 취소/두절",
    statuses: ["완료", "보류", "연락두절", "취소"],
    className: "border-slate-200 bg-slate-50/90",
  },
] as const satisfies readonly {
  key: string;
  label: string;
  description: string;
  statuses: readonly CustomerStatus[];
  className: string;
}[];

export type CustomerPipelineStageKey =
  (typeof CUSTOMER_PIPELINE_STAGES)[number]["key"];

const STATUS_TO_STAGE = new Map<CustomerStatus, CustomerPipelineStageKey>(
  CUSTOMER_PIPELINE_STAGES.flatMap((stage) =>
    stage.statuses.map((status) => [status, stage.key] as const),
  ),
);

export function getCustomerPipelineStage(
  status: CustomerStatus,
): CustomerPipelineStageKey {
  return STATUS_TO_STAGE.get(status) ?? "closed";
}

export function groupCustomerPipeline(
  customers: readonly CustomerPipelineItem[],
): Record<CustomerPipelineStageKey, CustomerPipelineItem[]> {
  const grouped: Record<CustomerPipelineStageKey, CustomerPipelineItem[]> = {
    new: [],
    consulting: [],
    quoting: [],
    negotiating: [],
    delivery: [],
    closed: [],
  };

  for (const customer of customers) {
    grouped[getCustomerPipelineStage(customer.status)].push(customer);
  }

  return grouped;
}

export async function listCustomerPipeline(): Promise<{
  customers: CustomerPipelineItem[];
  scopeLabel: string;
}> {
  const access = await requireCustomerAccess();
  const employeeId = access.employeeId;
  if (!access.canViewAllCompanyCustomers && !employeeId) {
    return { customers: [], scopeLabel: access.scopeLabel };
  }

  const supabase = await createClient();
  const customers: CustomerPipelineItem[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from("customers")
      .select(
        `
        id, name, phone, address, consultation_type, status,
        assigned_employee_id, next_contact_at, created_at, updated_at,
        employees ( id, name, title ),
        lead_sources ( id, name )
      `,
      )
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PIPELINE_PAGE_SIZE - 1);

    if (!access.canViewAllCompanyCustomers) {
      query = query.eq("assigned_employee_id", employeeId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const page = (data ?? []) as unknown as Omit<
      CustomerPipelineItem,
      "contact_bucket"
    >[];
    customers.push(
      ...page.map((customer) => ({
        ...customer,
        contact_bucket: getContactBucket(customer.next_contact_at),
      })),
    );

    if (page.length < PIPELINE_PAGE_SIZE) break;
    from += PIPELINE_PAGE_SIZE;
  }

  return { customers, scopeLabel: access.scopeLabel };
}
