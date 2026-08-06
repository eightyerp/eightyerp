"use client";

import type { ReactNode } from "react";

export type QuoteAssigneeContactDisplay = {
  assigneeName?: string | null;
  assigneeTitle?: string | null;
  assigneePhone?: string | null;
  assigneeEmail?: string | null;
  /** 담당자 연락처가 없을 때 대체 표시 */
  companyPhone?: string | null;
};

type Props = {
  contact?: QuoteAssigneeContactDisplay | null;
  /** print: 전화 버튼 없음, mobile: tel 링크 제공 */
  variant?: "mobile" | "print";
  className?: string;
};

function formatDisplayPhone(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10 && digits.startsWith("02")) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

function telHref(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 9) return null;
  return `tel:${digits}`;
}

/**
 * 견적 표지·미리보기·공유 공용 담당자 연락처 블록.
 * 명함 이미지는 표시하지 않는다 (데이터는 유지).
 */
export default function QuoteAssigneeContactBlock({
  contact,
  variant = "mobile",
  className = "",
}: Props) {
  const isPrint = variant === "print";
  const name = contact?.assigneeName?.trim() || "";
  const title = contact?.assigneeTitle?.trim() || "";
  const label =
    name && title ? `${name} ${title}` : name || title;
  const assigneePhone = formatDisplayPhone(contact?.assigneePhone ?? "");
  const companyPhone = formatDisplayPhone(contact?.companyPhone ?? "");
  const email = contact?.assigneeEmail?.trim() || "";

  const phoneParts = [assigneePhone, companyPhone].filter(
    (p, i, arr) => Boolean(p) && arr.indexOf(p) === i,
  );
  const phone = phoneParts.join(" · ");
  const phoneIsCompanyOnly =
    !assigneePhone && Boolean(companyPhone);
  const callHref =
    !isPrint && assigneePhone
      ? telHref(assigneePhone)
      : !isPrint && companyPhone
        ? telHref(companyPhone)
        : null;

  if (!label && !phone && !email) return null;

  const phoneNode: ReactNode = phone ? (
    callHref ? (
      <a
        href={callHref}
        className={`inline-flex items-center gap-2 font-semibold tabular-nums text-navy-900 underline-offset-2 hover:underline ${
          isPrint ? "text-[12px]" : "text-[14px] sm:text-[15px]"
        }`}
      >
        <span>{phone}</span>
        <span className="rounded-md border border-navy-800/25 bg-navy-800/5 px-2 py-0.5 text-[11px] font-semibold text-navy-800 no-underline print:hidden">
          전화 걸기
        </span>
      </a>
    ) : (
      <p
        className={`font-semibold tabular-nums text-navy-900 ${
          isPrint ? "text-[12px]" : "text-[14px] sm:text-[15px]"
        }`}
      >
        {phone}
      </p>
    )
  ) : null;

  return (
    <div
      className={`border-t border-slate-200 pt-2.5 ${
        isPrint ? "text-[10px]" : "text-[11px] sm:text-[12px]"
      } ${className}`}
    >
      <div className="min-w-0 space-y-1 text-slate-900">
        {label ? (
          <p className="leading-snug">
            <span className="text-slate-600">담당자</span>
            <span
              className={`ml-2 font-bold text-navy-900 ${
                isPrint ? "text-[12px]" : "text-[13px] sm:text-[14px]"
              }`}
            >
              {label}
            </span>
          </p>
        ) : phoneIsCompanyOnly ? (
          <p className="text-slate-600">대표번호</p>
        ) : null}
        {phoneNode}
        {email ? (
          <p className="text-slate-600">
            <span className="text-slate-600">E.</span> {email}
          </p>
        ) : null}
      </div>
    </div>
  );
}
