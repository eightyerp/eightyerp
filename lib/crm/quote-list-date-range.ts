import { buildKstDateTimeBounds } from "@/lib/date-range";
import {
  listQuotesPage,
  type QuoteListFilters,
  type QuoteListPageResult,
} from "@/lib/crm/quote-mgmt";
import {
  QUOTE_LIST_PAGE_SIZE,
  QUOTE_LIST_SELECT,
} from "@/lib/crm/quote-list-query";
import type { ScheduleAccess } from "@/lib/crm/schedule-access";
import { createClient } from "@/lib/supabase-server";
import type { ErpQuote } from "@/types/database";

function normalizeQuoteSearch(value: string | undefined): string {
  return (value ?? "").trim().replace(/[%_,()]/g, "");
}

/**
 * 기간이 없으면 기존 listQuotesPage를 그대로 사용한다.
 * 기간이 있을 때만 KST 자정 경계를 UTC timestamptz로 변환해 서버 필터를 적용한다.
 */
export async function listQuotesPageWithDateRange(
  filters: QuoteListFilters,
  page: number,
  access: ScheduleAccess,
  scopedEmployees: readonly { id: string }[],
): Promise<QuoteListPageResult> {
  const bounds = buildKstDateTimeBounds(filters.createdFrom, filters.createdTo);
  if (bounds.error) throw new Error(bounds.error);
  if (!bounds.fromInclusiveUtc && !bounds.toExclusiveUtc) {
    return listQuotesPage(filters, page, access, scopedEmployees);
  }

  const supabase = await createClient();
  const safePage = Math.max(1, page);
  const scopedIds = scopedEmployees.map((employee) => employee.id);
  const q = normalizeQuoteSearch(filters.q);

  if (
    filters.employeeId &&
    !access.canViewAll &&
    !scopedIds.includes(filters.employeeId)
  ) {
    return { quotes: [], total: 0, totalPages: 1 };
  }

  const customerScopePromise =
    access.canViewAll || scopedIds.length === 0
      ? Promise.resolve([] as string[])
      : supabase
          .from("customers")
          .select("id")
          .in("assigned_employee_id", scopedIds)
          .is("deleted_at", null)
          .then(({ data, error }) => {
            if (error) throw new Error("견적 조회 범위를 확인하지 못했습니다.");
            return (data ?? []).map((row) => String(row.id));
          });

  const searchCustomerPromise = q
    ? supabase
        .from("customers")
        .select("id")
        .ilike("name", `%${q}%`)
        .is("deleted_at", null)
        .then(({ data, error }) => {
          if (error) throw new Error("견적 고객 검색에 실패했습니다.");
          return (data ?? []).map((row) => String(row.id));
        })
    : Promise.resolve([] as string[]);

  const [customerScopeIds, searchCustomerIds] = await Promise.all([
    customerScopePromise,
    searchCustomerPromise,
  ]);

  let query = supabase
    .from("quotes")
    .select(QUOTE_LIST_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (!access.canViewAll) {
    const scope = [`created_by.eq.${access.userId}`];
    if (scopedIds.length > 0) {
      scope.push(`assigned_employee_id.in.(${scopedIds.join(",")})`);
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

  if (filters.quoteType) query = query.eq("quote_type", filters.quoteType);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.employeeId) query = query.eq("assigned_employee_id", filters.employeeId);
  if (filters.lxOnly) query = query.eq("is_lx_material", true);
  if (filters.contractOnly) query = query.eq("is_contract_quote", true);
  if (bounds.fromInclusiveUtc) query = query.gte("created_at", bounds.fromInclusiveUtc);
  if (bounds.toExclusiveUtc) query = query.lt("created_at", bounds.toExclusiveUtc);

  const fromRow = (safePage - 1) * QUOTE_LIST_PAGE_SIZE;
  const { data, error, count } = await query.range(
    fromRow,
    fromRow + QUOTE_LIST_PAGE_SIZE - 1,
  );
  if (error) throw new Error("견적 목록을 불러오지 못했습니다.");

  const total = count ?? 0;
  return {
    quotes: (data ?? []) as unknown as ErpQuote[],
    total,
    totalPages: Math.max(1, Math.ceil(total / QUOTE_LIST_PAGE_SIZE)),
  };
}
