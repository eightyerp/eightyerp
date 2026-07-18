export const SPACE_NAME_SUGGESTIONS = [
  "공통",
  "현관",
  "거실",
  "주방",
  "안방",
  "침실",
  "욕실",
  "발코니",
  "다용도실",
  "기타",
] as const;

export const ORDER_STATUSES = [
  "미발주",
  "발주대기",
  "발주완료",
  "입고완료",
  "취소",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const CATALOG_BUCKET = "material-catalog";
export const PROJECT_MATERIALS_BUCKET = "project-materials";

export const MATERIAL_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MATERIAL_MAX_IMAGES = 10;

export const MATERIAL_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const CATALOG_PAGE_SIZE = 24;

export const SITE_MATERIAL_HISTORY_ACTIONS = [
  "등록",
  "수정",
  "복제",
  "삭제",
  "복원",
  "발주상태 변경",
  "대표사진 변경",
] as const;
