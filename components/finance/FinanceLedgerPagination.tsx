import Link from "next/link";

type FinanceLedgerPaginationProps = {
  pathname: string;
  page: number;
  totalPages: number;
  total: number;
  searchParams: Record<string, string | undefined>;
};

export function buildFinanceLedgerHref(
  pathname: string,
  page: number,
  searchParams: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (!value || key === "page") continue;
    params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export default function FinanceLedgerPagination({
  pathname,
  page,
  totalPages,
  total,
  searchParams,
}: FinanceLedgerPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="원장 페이지"
      className="flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <p className="text-xs font-medium text-slate-600">
        총 {total.toLocaleString("ko-KR")}건 · {page}/{totalPages} 페이지
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={buildFinanceLedgerHref(
            pathname,
            Math.max(1, page - 1),
            searchParams,
          )}
          aria-disabled={page <= 1}
          className={page <= 1 ? disabledClass : pageClass}
        >
          이전
        </Link>
        <Link
          href={buildFinanceLedgerHref(
            pathname,
            Math.min(totalPages, page + 1),
            searchParams,
          )}
          aria-disabled={page >= totalPages}
          className={page >= totalPages ? disabledClass : pageClass}
        >
          다음
        </Link>
      </div>
    </nav>
  );
}

const pageClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50";
const disabledClass =
  "pointer-events-none rounded-lg border border-slate-100 bg-white px-3 py-1.5 text-sm font-semibold text-slate-400";
