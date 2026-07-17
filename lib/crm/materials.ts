/**
 * 레거시 진입점 — 직원용 현장 자재는 site-materials 사용.
 * 고객 승인 기능은 제공하지 않습니다.
 */
export {
  addFromCatalog,
  calcTotalAdditionalPrice,
  createSignedProjectMaterialUrl,
  createSignedUrlsForPaths,
  createSiteMaterial,
  duplicateSiteMaterial,
  getSiteMaterial,
  groupByCategory,
  groupBySpace,
  listCustomerMaterials,
  listProjectIdMaterials,
  listRecentSpaceNames,
  parseSiteMaterialForm,
  reorderSiteMaterial,
  softDeleteSiteMaterial,
  updateSiteMaterial,
} from "@/lib/crm/site-materials";

export async function getPortalMaterialBundle() {
  throw new Error("고객 승인 포털은 현재 제공하지 않습니다.");
}
