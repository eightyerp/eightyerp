"use client";

import { buildQuotePdfFileName } from "@/lib/crm/quote-document";

type Props = {
  href: string;
  customerName: string;
  fileType: string;
  className?: string;
  children: React.ReactNode;
};

/**
 * 업로드 원본 Storage 객체를 변경하지 않고,
 * 브라우저 다운로드 시에만 안전한 파일명을 적용한다.
 */
export default function QuoteShareDownloadLink({
  href,
  customerName,
  fileType,
  className,
  children,
}: Props) {
  async function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (fileType !== "pdf") return;
    event.preventDefault();
    try {
      const res = await fetch(href);
      if (!res.ok) {
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildQuotePdfFileName(customerName);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={handleClick}
      className={className}
    >
      {children}
    </a>
  );
}
