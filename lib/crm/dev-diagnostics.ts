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

/** 직원·운영 화면에 노출하는 스키마 부재 안내 (경로/SQL 없음) */
export function schemaMissingStaffMessage(featureLabel: string): string {
  return `${featureLabel}을(를) 사용할 수 없습니다. 관리자에게 문의해 주세요.`;
}

/** 개발+admin 전용 migration 경로 안내. production에서는 항상 null */
export function schemaMissingDevHint(
  migrationRelativePath: string,
  isAdmin: boolean,
): string | null {
  if (!canShowDevDiagnostics(isAdmin)) return null;
  return `[개발] Supabase SQL Editor에서 ${migrationRelativePath} 을 실행해 주세요.`;
}
