"use client";

import { useEffect, useState } from "react";
import {
  formatDateRangeQuickInput,
  getDateRangePreset,
  normalizeDateRange,
  parseDateRangeQuickInput,
  type DateRangePreset,
  type DateRangeValue,
} from "@/lib/date-range";

type DateRangeFilterProps = {
  from: string;
  to: string;
  label?: string;
  mode?: "form" | "apply";
  fromName?: string;
  toName?: string;
  onApply?: (range: DateRangeValue) => void;
};

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "오늘" },
  { value: "yesterday", label: "어제" },
  { value: "recent7", label: "최근 7일" },
  { value: "recent30", label: "최근 30일" },
  { value: "thisMonth", label: "이번달" },
  { value: "lastMonth", label: "지난달" },
  { value: "thisYear", label: "올해" },
  { value: "all", label: "전체" },
];

export default function DateRangeFilter({
  from,
  to,
  label = "조회기간",
  mode = "apply",
  fromName = "from",
  toName = "to",
  onApply,
}: DateRangeFilterProps) {
  const [draft, setDraft] = useState<DateRangeValue>({ from, to });
  const [quickInput, setQuickInput] = useState(
    formatDateRangeQuickInput({ from, to }),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft({ from, to });
    setQuickInput(formatDateRangeQuickInput({ from, to }));
    setError(null);
  }, [from, to]);

  function commit(range: DateRangeValue) {
    const normalized = normalizeDateRange(range.from, range.to);
    if (normalized.error) {
      setError(normalized.error);
      return;
    }
    const next = { from: normalized.from, to: normalized.to };
    setDraft(next);
    setQuickInput(formatDateRangeQuickInput(next));
    setError(null);
    onApply?.(next);
  }

  function applyQuickInput() {
    const parsed = parseDateRangeQuickInput(quickInput);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    commit({ from: parsed.from, to: parsed.to });
  }

  function applyDraft() {
    commit(draft);
  }

  function applyPreset(preset: DateRangePreset) {
    commit(getDateRangePreset(preset));
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-700">{label}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            빠른입력 예: 260801~260817
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => applyPreset(preset.value)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1.25fr_1fr_auto_1fr_auto] md:items-end">
        <div>
          <label className={labelClass}>빠른입력</label>
          <div className="flex gap-2">
            <input
              value={quickInput}
              onChange={(event) => setQuickInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyQuickInput();
                }
              }}
              placeholder="260801~260817"
              inputMode="numeric"
              className={inputClass}
            />
            <button
              type="button"
              onClick={applyQuickInput}
              className="shrink-0 rounded-lg border border-navy-800 bg-white px-3 py-2 text-sm font-semibold text-navy-900 hover:bg-navy-50"
            >
              입력 반영
            </button>
          </div>
        </div>

        <div>
          <label className={labelClass}>시작일</label>
          <input
            type="date"
            name={fromName}
            value={draft.from}
            onChange={(event) => {
              setDraft((current) => ({ ...current, from: event.target.value }));
              setError(null);
            }}
            className={inputClass}
          />
        </div>

        <span className="hidden pb-2 text-center text-sm text-slate-400 md:block">~</span>

        <div>
          <label className={labelClass}>종료일</label>
          <input
            type="date"
            name={toName}
            value={draft.to}
            onChange={(event) => {
              setDraft((current) => ({ ...current, to: event.target.value }));
              setError(null);
            }}
            className={inputClass}
          />
        </div>

        {mode === "apply" ? (
          <button
            type="button"
            onClick={applyDraft}
            className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700"
          >
            기간 적용
          </button>
        ) : (
          <p className="pb-2 text-xs text-slate-500">조회 버튼으로 적용</p>
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const labelClass = "mb-1 block text-xs font-medium text-slate-600";
const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";
