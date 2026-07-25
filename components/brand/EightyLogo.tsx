import type { SVGProps } from "react";
import { isEightyMarkSrc } from "@/lib/crm/quote-brand-shared";

export type EightyLogoVariant = "navy" | "white";
export type EightyLogoLayout = "full" | "symbol";

type Props = {
  /** 밝은 배경: navy / 네이비·다크 배경: white */
  variant?: EightyLogoVariant;
  /** full: 80 + EIGHTY + 보조문구 / symbol: 80만 */
  layout?: EightyLogoLayout;
  className?: string;
  title?: string;
} & Omit<SVGProps<SVGSVGElement>, "color">;

const COLOR = {
  navy: "#13233A",
  white: "#FFFFFF",
} as const;

export { isEightyMarkSrc };
export { EIGHTY_LOGO_MARK_SRC } from "@/lib/crm/quote-brand-shared";

/**
 * 에잇티 전용 브랜드 마크 (인라인 SVG).
 * 다른 회사 로고·업로드 이미지와 분리되며, 외부 폰트/이미지에 의존하지 않는다.
 */
export default function EightyLogo({
  variant = "navy",
  layout = "full",
  className = "",
  title = "EIGHTY",
  ...rest
}: Props) {
  const fill = COLOR[variant];
  const isSymbol = layout === "symbol";

  if (isSymbol) {
    return (
      <svg
        viewBox="0 0 68 48"
        role="img"
        aria-label={title}
        className={className}
        xmlns="http://www.w3.org/2000/svg"
        {...rest}
      >
        <title>{title}</title>
        <EightyMonogram stroke={fill} />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 260 58"
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      <title>{title}</title>
      <g transform="translate(0 5)">
        <EightyMonogram stroke={fill} />
      </g>
      <g fill={fill}>
        <text
          x="82"
          y="28"
          fontFamily="Arial, Helvetica, 'Segoe UI', sans-serif"
          fontSize="24"
          fontWeight="700"
          letterSpacing="3"
        >
          EIGHTY
        </text>
        <text
          x="82"
          y="46"
          fontFamily="Arial, Helvetica, 'Segoe UI', sans-serif"
          fontSize="8"
          fontWeight="600"
          letterSpacing="2.2"
          opacity="0.75"
        >
          INTERIOR · WINDOWS
        </text>
      </g>
    </svg>
  );
}

/** 동일 높이·굵기의 기하학적 80 — 내부 여백 넉넉, 장식 최소 */
function EightyMonogram({ stroke }: { stroke: string }) {
  return (
    <g
      fill="none"
      stroke={stroke}
      strokeWidth="6.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <rect x="3.25" y="1.25" width="28" height="20" rx="10" />
      <rect x="3.25" y="22.75" width="28" height="20" rx="10" />
      <rect x="38.25" y="1.25" width="26" height="41.5" rx="13" />
      <line
        x1="51.25"
        y1="10"
        x2="51.25"
        y2="34"
        strokeWidth="1.4"
        opacity="0.4"
      />
    </g>
  );
}
