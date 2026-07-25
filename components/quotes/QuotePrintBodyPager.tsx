"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { QuotePageFooter } from "@/components/quotes/QuotePrintPages";

export type QuotePrintBodyBlock = {
  key: string;
  node: ReactNode;
  /** 다음 블록과 같은 페이지에 두려고 시도 (공종 제목+첫 행) */
  keepWithNext?: boolean;
  /** 연속 페이지 공종 헤더 */
  groupLabel?: string;
  role?: "group-title" | "doc-title" | "line" | "totals" | "other";
};

type Props = {
  blocks: QuotePrintBodyBlock[];
  pageIndexOffset: number;
  totalPageCount: number;
  quoteNumber?: string | null;
  documentTitle?: string;
  onBodyPageCountChange?: (count: number) => void;
  /** 공종 이어붙임 페이지에 열 머리글 등 추가 */
  continuationExtra?: ReactNode;
};

/**
 * A4 297mm 기준.
 * 푸터(하단 8mm + 높이 6mm) + 본문·푸터 사이 안전간격 11mm ≈ 10~12mm.
 */
const FOOTER_ZONE_MM = 8 + 6 + 11; // 25mm
const PAGE_HEIGHT_MM = 297;
/** space-y-6 */
const BLOCK_GAP_PX = 24;
/** 공종 연속 헤더「공종명 (계속)」+ 열 머리글 대략 높이 — 이어서 시작하는 페이지에만 적용 */
const CONTINUATION_RESERVE_PX = 72;

/**
 * A4 본문 영역을 측정해 블록 단위로 페이지를 나눈다.
 * - 공종명+소계+첫 항목만 keep-together
 * - 이후 항목은 행 단위로 이어서 배치 (페이지를 최대한 채움)
 */
export default function QuotePrintBodyPager({
  blocks,
  pageIndexOffset,
  totalPageCount,
  quoteNumber,
  onBodyPageCountChange,
  continuationExtra,
}: Props) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [pageKeys, setPageKeys] = useState<string[][]>(() => [
    blocks.map((b) => b.key),
  ]);

  const blockMap = useMemo(() => {
    const map = new Map<string, QuotePrintBodyBlock>();
    for (const b of blocks) map.set(b.key, b);
    return map;
  }, [blocks]);

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root || blocks.length === 0) {
      setPageKeys([[]]);
      onBodyPageCountChange?.(1);
      return;
    }

    const pageShell = root.querySelector<HTMLElement>("[data-measure-shell]");
    const inner = root.querySelector<HTMLElement>("[data-measure-inner]");
    if (!pageShell || !inner) return;

    const pageHeightPx = pageShell.getBoundingClientRect().height;
    if (pageHeightPx <= 0) return;

    const mmToPx = pageHeightPx / PAGE_HEIGHT_MM;
    const style = window.getComputedStyle(pageShell);
    const padTop = Number.parseFloat(style.paddingTop) || 0;
    const footerZonePx = FOOTER_ZONE_MM * mmToPx;
    const contentMaxHeight = Math.max(0, pageHeightPx - padTop - footerZonePx);
    if (contentMaxHeight <= 0) return;

    const heights = new Map<string, number>();
    for (const el of inner.querySelectorAll<HTMLElement>("[data-block-key]")) {
      const key = el.dataset.blockKey;
      if (!key) continue;
      heights.set(key, Math.ceil(el.getBoundingClientRect().height));
    }

    const pages: string[][] = [];
    let current: string[] = [];
    let used = 0;
    /** 현재 페이지가 공종 이어붙임으로 시작할 때만 연속 헤더 높이 예약 */
    let headerReserve = 0;

    function flush() {
      if (current.length === 0) return;
      pages.push(current);
      current = [];
      used = 0;
      headerReserve = 0;
    }

    function peekHeaderReserve(keys: string[]): number {
      if (pages.length === 0) return 0;
      if (current.length > 0) return headerReserve;
      const first = blockMap.get(keys[0] ?? "");
      return first?.role === "line" ? CONTINUATION_RESERVE_PX : 0;
    }

    function pageLimitFor(keys: string[]): number {
      return Math.max(0, contentMaxHeight - peekHeaderReserve(keys));
    }

    function heightOf(keys: string[]): number {
      if (keys.length === 0) return 0;
      let total = 0;
      for (let i = 0; i < keys.length; i++) {
        total += heights.get(keys[i]!) ?? 0;
        if (i > 0) total += BLOCK_GAP_PX;
      }
      return total;
    }

    function fitsKeys(keys: string[]): boolean {
      const extra = heightOf(keys);
      const limit = pageLimitFor(keys);
      if (extra <= 0) return true;
      if (current.length === 0) return extra <= limit;
      return used + BLOCK_GAP_PX + extra <= limit;
    }

    function pushKeys(keys: string[]) {
      if (keys.length === 0) return;
      if (current.length > 0 && !fitsKeys(keys)) flush();

      if (current.length === 0) {
        headerReserve = peekHeaderReserve(keys);
      }

      const chunkH = heightOf(keys);
      if (current.length === 0) {
        current.push(...keys);
        used = chunkH;
      } else {
        current.push(...keys);
        used = used + BLOCK_GAP_PX + chunkH;
      }
    }

    let i = 0;
    while (i < blocks.length) {
      const block = blocks[i]!;

      // 상세견적서 제목은 단독 배치 (공종 시작 keep와 충돌 방지)
      if (block.role === "doc-title") {
        pushKeys([block.key]);
        i += 1;
        continue;
      }

      // 공종명(+소계) + 첫 세부항목만 함께 유지. 이후 항목은 행 단위.
      if (block.role === "group-title") {
        const firstLine =
          i + 1 < blocks.length && blocks[i + 1]?.role === "line"
            ? blocks[i + 1]!
            : null;
        if (firstLine) {
          const groupStart = [block.key, firstLine.key];
          if (current.length > 0 && !fitsKeys(groupStart)) flush();
          pushKeys(groupStart);
          i += 2;
          continue;
        }
        pushKeys([block.key]);
        i += 1;
        continue;
      }

      // 합계표·세부항목 등: 행/블록 단위로 최대한 채움
      pushKeys([block.key]);
      i += 1;
    }
    flush();

    const normalized =
      pages.length > 0 ? pages : [blocks.map((b) => b.key)];
    setPageKeys(normalized);
    onBodyPageCountChange?.(Math.max(1, normalized.length));
  }, [blockMap, blocks, onBodyPageCountChange]);

  function continuationFor(keys: string[]) {
    const first = keys[0] ? blockMap.get(keys[0]) : null;
    if (!first) return null;

    const hasGroupTitle = keys.some(
      (k) => blockMap.get(k)?.role === "group-title",
    );

    // 공종 중간에서 이어질 때만 「공종명 (계속)」
    if (first.role !== "line" || hasGroupTitle || !first.groupLabel) {
      return null;
    }
    return first.groupLabel;
  }

  return (
    <>
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none fixed -left-[200vw] top-0 opacity-0"
      >
        <div
          data-measure-shell
          className="quote-body-page quote-body-page--measure"
          style={{ width: "210mm", height: "297mm" }}
        >
          <div data-measure-inner className="quote-body-page-inner space-y-6">
            {blocks.map((block) => (
              <div key={block.key} data-block-key={block.key}>
                {block.node}
              </div>
            ))}
          </div>
        </div>
      </div>

      {pageKeys.map((keys, index) => {
        const contGroup = continuationFor(keys);
        return (
          <div key={`body-page-${index}`} className="quote-body-page">
            <div className="quote-body-page-inner space-y-6">
              {contGroup ? (
                <div className="quote-print-continuation space-y-1.5">
                  <div className="quote-print-group-title flex items-center justify-between border-b border-slate-200 pb-2">
                    <h3 className="text-[12px] font-bold text-navy-900">
                      {contGroup} (계속)
                    </h3>
                  </div>
                  {continuationExtra}
                </div>
              ) : null}
              {keys.map((key) => {
                const block = blockMap.get(key);
                if (!block) return null;
                return (
                  <div key={key} className="quote-print-block">
                    {block.node}
                  </div>
                );
              })}
            </div>
            <QuotePageFooter
              pageIndex={pageIndexOffset + index}
              pageCount={totalPageCount}
              quoteNumber={quoteNumber}
            />
          </div>
        );
      })}
    </>
  );
}
