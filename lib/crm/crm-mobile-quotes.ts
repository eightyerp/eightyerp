import { getCurrentUserAccess } from "@/lib/crm/access";
import { isMissingEmployeeMergeColumnError } from "@/lib/crm/employee-master-shared";
import { createClient } from "@/lib/supabase-server";

const CRM_QUOTE_PAGE_SIZE = 30;

export type CrmMobileQuoteListItem = {
  id: string;
  customer_id: string;
  quote_type: string;
  title: string;
  quote_number: string | null;
  status: string;
  final_amount: number;
  customer_total_amount: number | null;
  created_at: string;
  customers: {
    id: string;
    name: string;
    assigned_employee_id: string | null;
  } | null;
};

export type CrmMobileQuoteListResult = {
  quotes: CrmMobileQuoteListItem[];
  total: number;
  page: number;
  totalPages: number;
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeSearch(value: string | undefined): string {
  return (value ?? "").trim().replace(/[%_,()]/g, "");
}

async function listManagerEmployeeIds(teamId: string): Promise<string[]> {
  const supabase = await createClient();
  const load = (filterMerged: boolean) => {
    let query = supabase
      .from("employees")
      .select("id")
      .eq("is_active", true)
      .eq("team_id", teamId);
    if (filterMerged) query = query.is("merged_into_employee_id", null);
    return query;
  };

  let { data, error } = await load(true);
  if (isMissingEmployeeMergeColumnError(error)) {
    ({ data, error } = await load(false));
  }
  if (error) throw new Error("견적 담당범위를 확인하지 못했습니다.");
  return (data ?? []).map((row) => String(row.id));
}

/**
 * 직원 CRM 견적목록 전용 경량 조회.
 * ERP 견적목록의 큰 QUOTE_LIST_SELECT와 직원 전체 객체 조회를 사용하지 않는다.
 */
export async function listCrmMobileQuotes(input: {
  q?: string;
  page?: number;
} = {}): Promise<CrmMobileQuoteListResult> {
  const access = await getCurrentUserAccess();
  if (!access.isAuthenticated || !access.userId || !access.canAccessErp) {
    throw new Error("CRM 접근 권한이 없습니다.");
  }

  const employeeId = access.profile?.employee_id ?? null;
  const teamId = access.profile?.employees?.team_id ?? null;
  const canViewAll = access.isAdmin;
  const isManager = access.role === "manager";

  let scopedEmployeeIds: string[] = [];
  if (!canViewAll) {
    if (isManager && teamId) {
      scopedEmployeeIds = await listManagerEmployeeIds(teamId);
    } else if (employeeId) {
      scopedEmployeeIds = [employeeId];
    } else {
      return { quotes: [], total: 0, page: 1, totalPages: 1 };
    }
  }

  const supabase = await createClient();
  const q = normalizeSearch(input.q);
  const page = Math.max(1, input.page ?? 1);

  const customerScopePromise =
    canViewAll || scopedEmployeeIds.length === 0
      ? Promise.resolve([] as string[])
      : supabase
          .from("customers")
          .select("id")
          .in("assigned_employee_id", scopedEmployeeIds)
          .is("deleted_at", null)
          .then(({ data, error }) => {
            if (error) throw new Error("견적 고객범위를 확인하지 못했습니다.");
            return (data ?? []).map((row) => String(row.id));
          });

  const searchCustomerPromise = q
    ? supabase
        .from("customers")
        .select("id")
        .ilike("name", `%${q}%`)
        .is("deleted_at", null)
        .then(({ data, error }) => {
          if (error) throw new Error("견적 고객검색에 실패했습니다.");
          return (data ?? []).map((row) => String(row.id));
        })
    : Promise.resolve([] as string[]);

  const [customerScopeIds, searchCustomerIds] = await Promise.all([
    customerScopePromise,
    searchCustomerPromise,
  ]);

  let query = supabase
    .from("quotes")
    .select(
      `
      id, customer_id, quote_type, title, quote_number, status,
      final_amount, customer_total_amount, created_at,
      customers:customers!quotes_customer_id_fkey (
        id, name, assigned_employee_id
      )
      `,
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (!canViewAll) {
    const scope = [`created_by.eq.${access.userId}`];
    if (scopedEmployeeIds.length > 0) {
      scope.push(`assigned_employee_id.in.(${scopedEmployeeIds.join(",")})`);
    }
    if (customerScopeIds.length > 0) {
      scope.push(`customer_id.in.(${customerScopeIds.join(",")})`);
    }
    query = query.or(scope.join(","));
  }

  if (q) {
    const search = [`quote_number.ilike.%${q}%`, `title.ilike.%${q}%`];
    if (searchCustomerIds.length > 0) {
      search.push(`customer_id.in.(${searchCustomerIds.join(",")})`);
    }
    query = query.or(search.join(","));
  }

  const from = (page - 1) * CRM_QUOTE_PAGE_SIZE;
  const { data, error, count } = await query.range(
    from,
    from + CRM_QUOTE_PAGE_SIZE - 1,
  );
  if (error) throw new Error("견적 목록을 불러오지 못했습니다.");

  const quotes: CrmMobileQuoteListItem[] = (data ?? []).map((row) => ({
    id: row.id,
    customer_id: row.customer_id,
    quote_type: row.quote_type,
    title: row.title,
    quote_number: row.quote_number,
    status: row.status,
    final_amount: Number(row.final_amount ?? 0),
    customer_total_amount:
      row.customer_total_amount == null ? null : Number(row.customer_total_amount),
    created_at: row.created_at,
    customers: relationOne(row.customers),
  }));
  const total = count ?? quotes.length;

  return {
    quotes,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / CRM_QUOTE_PAGE_SIZE)),
  };
}
