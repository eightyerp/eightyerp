/**
 * 운영(production)에서는 항상 false.
 * 개발환경에서만 admin/super_admin에게 마이그레이션·경로 진단 안내를 노출.
 * Vercel 프로덕션 빌드(NODE_ENV=production)에서는 절대 표시하지 않음.
 */
export function canShowDevDiagnostics(isAdmin: boolean): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.NODE_ENV === "development" && isAdmin;
}
