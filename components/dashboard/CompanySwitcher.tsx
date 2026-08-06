"use client";

import { useState, useTransition } from "react";
import {
  switchActiveCompanyAction,
  type TopBarCompanyOption,
} from "@/app/actions/session";

type CompanySwitcherProps = {
  companies: TopBarCompanyOption[];
  activeCompanyId: string | null;
  activeCompanyName: string;
};

export default function CompanySwitcher({
  companies,
  activeCompanyId,
  activeCompanyName,
}: CompanySwitcherProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const currentName =
    companies.find((company) => company.isCurrent)?.companyName ||
    activeCompanyName ||
    "회사 연결 없음";

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextCompanyId = event.target.value;

    if (!nextCompanyId || nextCompanyId === activeCompanyId) {
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await switchActiveCompanyAction(nextCompanyId);

      if (!result.success) {
        setError(result.error || "회사를 전환하지 못했습니다.");
        return;
      }

      // 회사 전환 후 모든 서버·클라이언트 조회를 새 회사 기준으로 다시 실행
      window.location.reload();
    });
  }

  if (companies.length === 0) {
    return (
      <div
        className="hidden max-w-40 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 sm:flex"
        title="활성 회사 멤버십이 없습니다."
      >
        <span className="truncate">회사 연결 없음</span>
      </div>
    );
  }

  if (companies.length === 1) {
    return (
      <div
        className="flex max-w-32 items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs font-medium text-slate-900 sm:max-w-52 sm:px-3"
        title={currentName}
      >
        <svg
          className="h-4 w-4 shrink-0 text-slate-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"
          />
        </svg>
        <span className="truncate">{currentName}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <label htmlFor="active-company" className="sr-only">
        현재 회사 선택
      </label>

      <select
        id="active-company"
        value={activeCompanyId || ""}
        onChange={handleChange}
        disabled={pending}
        className="h-10 max-w-36 rounded-lg border border-gray-200 bg-gray-50 px-2 text-xs font-medium text-slate-900 outline-none hover:bg-gray-100 focus:border-gold-500 focus:ring-1 focus:ring-gold-500 disabled:cursor-wait disabled:opacity-75 sm:max-w-56 sm:px-3"
        title={currentName}
      >
        {!activeCompanyId && <option value="">회사 선택</option>}

        {companies.map((company) => (
          <option key={company.companyId} value={company.companyId}>
            {company.companyName}
          </option>
        ))}
      </select>

      {error && (
        <span
          className="absolute -bottom-4 left-0 whitespace-nowrap text-[10px] text-red-600"
          title={error}
        >
          전환 실패
        </span>
      )}
    </div>
  );
}