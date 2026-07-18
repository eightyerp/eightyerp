import {
  getDeliveryDate,
  getDeliveryRisk,
  isDeliveryLate,
} from "@/lib/crm/site-material-risk";
import type { MaterialCatalogItem, ProjectMaterial } from "@/types/database";

export type ViewMode = "card" | "table";
export type GroupMode = "none" | "space" | "category";
export type SortMode =
  | "created"
  | "space"
  | "category"
  | "delivery"
  | "additional";

export type MaterialFilters = {
  q: string;
  space: string;
  categoryId: string;
  brand: string;
  orderStatus: string;
  lateOnly: boolean;
  favoriteCatalogOnly: boolean;
  deletedOnly: boolean;
};

export function formatWon(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("ko-KR");
}

export function calcLineAmount(m: ProjectMaterial): number {
  const qty = Number(m.quantity ?? 0);
  const price = Number(m.unit_price ?? 0);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
  return Math.round(qty * price);
}

export function filterAndSortMaterials(input: {
  materials: ProjectMaterial[];
  filters: MaterialFilters;
  sort: SortMode;
  favoriteCatalogIds: Set<string>;
  constructionStartAt?: string | null;
}): ProjectMaterial[] {
  const { filters, sort, favoriteCatalogIds } = input;
  let list = [...input.materials];

  if (filters.deletedOnly) {
    list = list.filter((m) => Boolean(m.deleted_at));
  } else {
    list = list.filter((m) => !m.deleted_at);
  }

  const q = filters.q.trim().toLowerCase();
  if (q) {
    list = list.filter((m) =>
      [
        m.product_name,
        m.model_number,
        m.brand,
        m.color,
        m.supplier,
        m.staff_note,
        m.site_note,
        m.order_note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }

  if (filters.space) {
    list = list.filter(
      (m) => (m.space_name?.trim() || "공통") === filters.space,
    );
  }
  if (filters.categoryId) {
    list = list.filter((m) => m.category_id === filters.categoryId);
  }
  if (filters.brand) {
    list = list.filter((m) => (m.brand || "") === filters.brand);
  }
  if (filters.orderStatus) {
    list = list.filter(
      (m) => (m.order_status || "미발주") === filters.orderStatus,
    );
  }
  if (filters.lateOnly) {
    list = list.filter((m) => isDeliveryLate(m));
  }
  if (filters.favoriteCatalogOnly) {
    list = list.filter(
      (m) =>
        m.catalog_material_id &&
        favoriteCatalogIds.has(m.catalog_material_id),
    );
  }

  list.sort((a, b) => {
    switch (sort) {
      case "space":
        return (a.space_name || "공통").localeCompare(
          b.space_name || "공통",
          "ko",
        );
      case "category":
        return (a.material_categories?.name || "").localeCompare(
          b.material_categories?.name || "",
          "ko",
        );
      case "delivery": {
        const ad = getDeliveryDate(a) || "9999-99-99";
        const bd = getDeliveryDate(b) || "9999-99-99";
        return ad.localeCompare(bd);
      }
      case "additional":
        return (b.additional_price ?? 0) - (a.additional_price ?? 0);
      case "created":
      default:
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    }
  });

  return list;
}

export function groupMaterials(
  materials: ProjectMaterial[],
  mode: GroupMode,
): { key: string; items: ProjectMaterial[] }[] {
  if (mode === "none") return [{ key: "전체", items: materials }];
  const map = new Map<string, ProjectMaterial[]>();
  for (const m of materials) {
    const key =
      mode === "space"
        ? m.space_name?.trim() || "공통"
        : m.material_categories?.name || "미분류";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return [...map.entries()].map(([key, items]) => ({ key, items }));
}

export function exportMaterialsCsv(input: {
  materials: ProjectMaterial[];
  customerName: string;
  siteName: string;
  includePrices: boolean;
}): void {
  const headers = [
    "공간",
    "자재분류",
    "브랜드",
    "제품명",
    "모델번호",
    "색상",
    "규격",
    "적용위치",
    "수량",
    "단위",
    ...(input.includePrices ? ["단가", "공급가액", "추가금액"] : []),
    "공급업체",
    "납기예정일",
    "발주상태",
    "직원메모",
    "현장팀메모",
  ];

  const rows = input.materials.map((m) => {
    const base = [
      m.space_name || "공통",
      m.material_categories?.name || "",
      m.brand || "",
      m.product_name,
      m.model_number || "",
      m.color || "",
      m.specification || "",
      m.application_location || "",
      m.quantity ?? "",
      m.unit || "",
    ];
    const prices = input.includePrices
      ? [m.unit_price ?? 0, calcLineAmount(m), m.additional_price ?? 0]
      : [];
    const rest = [
      m.supplier || "",
      getDeliveryDate(m) || "",
      m.order_status || "미발주",
      m.staff_note || "",
      m.site_note || "",
    ];
    return [...base, ...prices, ...rest].map(csvEscape);
  });

  const bom = "\uFEFF";
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  a.href = url;
  a.download = `${sanitizeFile(input.customerName)}_${sanitizeFile(input.siteName || "현장")}_마감자재_${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string | number): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function sanitizeFile(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "이름없음";
}

export function openPrintMaterials(input: {
  materials: ProjectMaterial[];
  customerName: string;
  address: string | null;
  siteName: string;
  includePrices: boolean;
  signedUrls: Record<string, string>;
}): void {
  const rows = input.materials
    .map((m) => {
      const cover =
        m.cover_image_path ||
        m.project_material_images?.find((i) => i.is_cover)?.file_path ||
        m.project_material_images?.[0]?.file_path ||
        "";
      const img = cover ? input.signedUrls[cover] : "";
      const priceCols = input.includePrices
        ? `<td>${formatWon(m.unit_price)}</td><td>${formatWon(calcLineAmount(m))}</td><td>${formatWon(m.additional_price)}</td>`
        : "";
      return `<tr>
        <td>${img ? `<img src="${img}" style="width:56px;height:56px;object-fit:cover"/>` : ""}</td>
        <td>${esc(m.space_name || "공통")}</td>
        <td>${esc(m.material_categories?.name || "")}</td>
        <td>${esc(m.brand || "")}</td>
        <td>${esc(m.product_name)}</td>
        <td>${esc(m.model_number || "")}</td>
        <td>${esc(m.color || "")}</td>
        <td>${esc(m.specification || "")}</td>
        <td>${esc(m.application_location || "")}</td>
        <td>${esc(String(m.quantity ?? ""))} ${esc(m.unit || "")}</td>
        ${priceCols}
        <td>${esc(m.site_note || "")}</td>
      </tr>`;
    })
    .join("");

  const priceHeaders = input.includePrices
    ? "<th>단가</th><th>공급가액</th><th>추가금액</th>"
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>마감자재표</title>
  <style>
    body{font-family:sans-serif;padding:24px;color:#111}
    h1{font-size:18px;margin:0 0 8px}
    p{margin:0 0 4px;font-size:12px;color:#444}
    table{width:100%;border-collapse:collapse;margin-top:16px;font-size:11px}
    th,td{border:1px solid #ccc;padding:6px;vertical-align:top}
    th{background:#f3f4f6}
  </style></head><body>
  <h1>마감자재표</h1>
  <p>고객: ${esc(input.customerName)}</p>
  <p>현장: ${esc(input.siteName || "-")}</p>
  <p>공사주소: ${esc(input.address || "-")}</p>
  <table>
    <thead><tr>
      <th>사진</th><th>공간</th><th>분류</th><th>브랜드</th><th>제품명</th>
      <th>모델</th><th>색상</th><th>규격</th><th>적용위치</th><th>수량</th>
      ${priceHeaders}<th>현장팀메모</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload=()=>window.print()</script>
  </body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function riskBadge(m: ProjectMaterial, constructionStartAt?: string | null) {
  return getDeliveryRisk(m, constructionStartAt);
}

export function catalogMatches(
  item: MaterialCatalogItem,
  q: string,
  categoryId: string,
): boolean {
  if (categoryId && item.category_id !== categoryId) return false;
  const text = q.trim().toLowerCase();
  if (!text) return true;
  return [item.product_name, item.brand, item.model_number, item.color]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(text);
}
