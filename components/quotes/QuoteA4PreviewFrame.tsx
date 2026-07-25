"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * 화면용 A4 프레임: PC는 실물 폭, 모바일은 비율 유지 축소.
 * 인쇄 포털에는 쓰지 않음 (transform 잔존 방지).
 */
export default function QuoteA4PreviewFrame({
  children,
  className = "",
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const inner = innerRef.current;
    if (!viewport || !inner) return;

    function measure() {
      const vw = viewport!.clientWidth;
      const a4Px = inner!.offsetWidth || 1;
      const next = Math.min(1, vw / a4Px);
      setScale(next);
      setContentHeight(inner!.scrollHeight);
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  const scaledHeight =
    contentHeight != null ? Math.ceil(contentHeight * scale) : undefined;

  return (
    <div
      ref={viewportRef}
      className={`quote-a4-frame w-full overflow-x-hidden ${className}`}
    >
      <div
        className="quote-a4-frame-clip mx-auto"
        style={{
          width: "100%",
          maxWidth: "210mm",
          height: scaledHeight,
        }}
      >
        <div
          ref={innerRef}
          className="quote-preview-sheet mx-auto"
          style={{
            width: "210mm",
            transform: scale < 0.999 ? `scale(${scale})` : undefined,
            transformOrigin: "top center",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
