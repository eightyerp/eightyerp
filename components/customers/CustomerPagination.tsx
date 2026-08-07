import Link from "next/link";

type CustomerPaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  searchParams: Record<string, string | undefined>;
};

export function buildCustomerPaginationHref(
  page: number,
  searchParams: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (!value || key === "page") continue;
    params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/customers?${qs}` : "/customers";
}

export default function CustomerPagination({
  page,
  totalPages,
  total,
  searchParams,
}: CustomerPaginationProps) {
  if (totalPages <= 1) return null;

  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2,
  );

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-xs text-slate-600">
        {total}건 중 {page}/{totalPages} 페이지
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <Link
          href={buildCustomerPaginationHref(prev, searchParams)}
          aria-disabled={page <= 1}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
            page <= 1
              ? "pointer-events-none border-gray-100 text-slate-600"
              : "border-gray-200 text-gray-600 hover:bg-slate-100"
          }`}
        >
          이전
        </Link>
        {pages.map((p, index) => {
          const showEllipsis =
            index > 0 && p - (pages[index - 1] ?? p) > 1;
          return (
            <span key={p} className="flex items-center gap-1">
              {showEllipsis && (
                <span className="px-1 text-xs text-slate-600">…</span>
              )}
              <Link
                href={buildCustomerPaginationHref(p, searchParams)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  p === page
                    ? "bg-navy-800 text-white"
                    : "border border-gray-200 text-gray-600 hover:bg-slate-100"
                }`}
              >
                {p}
              </Link>
            </span>
          );
        })}
        <Link
          href={buildCustomerPaginationHref(next, searchParams)}
          aria-disabled={page >= totalPages}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
            page >= totalPages
              ? "pointer-events-none border-gray-100 text-slate-600"
              : "border-gray-200 text-gray-600 hover:bg-slate-100"
          }`}
        >
          다음
        </Link>
      </div>
    </div>
  );
}
