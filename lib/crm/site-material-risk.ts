import type { ProjectMaterial } from "@/types/database";

export type DeliveryRiskLevel = "ok" | "soon" | "late" | "after_start";

export type DeliveryRisk = {
  level: DeliveryRiskLevel;
  label: string;
  colorClass: string;
};

export function getDeliveryDate(m: ProjectMaterial): string | null {
  return m.expected_delivery_at || m.delivery_expected_at || null;
}

export function getDeliveryRisk(
  m: ProjectMaterial,
  constructionStartAt?: string | null,
  today = new Date(),
): DeliveryRisk {
  const dateStr = getDeliveryDate(m);
  const status = m.order_status || "미발주";

  if (!dateStr) {
    return { level: "ok", label: "납기 미정", colorClass: "text-gray-500" };
  }

  const delivery = new Date(`${dateStr}T00:00:00`);
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);

  const diffDays = Math.floor(
    (delivery.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (status !== "입고완료" && diffDays < 0) {
    return {
      level: "late",
      label: "납기지연",
      colorClass: "text-red-600 bg-red-50 border-red-200",
    };
  }

  if (constructionStartAt && status !== "입고완료" && status !== "취소") {
    const start = new Date(`${constructionStartAt}T00:00:00`);
    if (delivery.getTime() > start.getTime()) {
      return {
        level: "after_start",
        label: "공사시작 이후 납기",
        colorClass: "text-red-600 bg-red-50 border-red-200",
      };
    }
  }

  if (status === "발주대기" && diffDays >= 0 && diffDays <= 3) {
    return {
      level: "soon",
      label: "납기임박",
      colorClass: "text-amber-700 bg-amber-50 border-amber-200",
    };
  }

  return {
    level: "ok",
    label: "정상",
    colorClass: "text-emerald-700 bg-emerald-50 border-emerald-200",
  };
}

export function isDeliveryLate(m: ProjectMaterial, today = new Date()): boolean {
  return getDeliveryRisk(m, null, today).level === "late";
}

export function countOrderWaiting(materials: ProjectMaterial[]): number {
  return materials.filter((m) => (m.order_status || "미발주") === "발주대기")
    .length;
}

export function countDeliveryLate(materials: ProjectMaterial[]): number {
  return materials.filter((m) => isDeliveryLate(m)).length;
}
