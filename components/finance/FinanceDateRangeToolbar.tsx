"use client";

import { useRouter, useSearchParams } from "next/navigation";
import DateRangeFilter from "@/components/common/DateRangeFilter";
import type { DateRangeValue } from "@/lib/date-range";

export type FinanceDateFieldOption = {
  value: string;
  label: string;
};

type FinanceDateRangeToolbarProps = {
  pathname: string;
  dateField: string;
  defaultDateField: string;
  from: string;
  to: string;
  dateFields: readonly FinanceDateFieldOption[];
  label: string;
};

export default function FinanceDateRangeToolbar({
  pathname,
  dateField,
  defaultDateField,
  from,
  to,
  dateFields,
  label,
}: FinanceDateRangeToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(next: {
    dateField?: string;
    range?: DateRangeValue;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextField = next.dateField ?? dateField;
    const range = next.range ?? { from, to };

    if (nextField && nextField !== defaultDateField) {
      params.set("dateField", nextField);
    } else {
      params.delete("dateField");
    }

    if (range.from) params.set("from", range.from);
    else params.delete("from");
    if (range.to) params.set("to", range.to);
    else params.delete("to");

    params.delete("page");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        <label>
          <span className="mb-1.5 block text-xs font-bold text-slate-700">
            기준일
          </span>
          <select
            value={dateField}
            onChange={(event) => navigate({ dateField: event.target.value })}
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
          >
            {dateFields.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
            조회기간이 어떤 업무일을 기준으로 하는지 선택합니다.
          </p>
        </label>

        <DateRangeFilter
          key={`${dateField}:${from}:${to}`}
          from={from}
          to={to}
          label={label}
          mode="apply"
          onApply={(range) => navigate({ range })}
        />
      </div>
    </section>
  );
}
