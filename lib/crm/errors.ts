function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

export function isMissingRelationError(error: unknown): boolean {
  const message = errorMessage(error);

  return (
    message.includes("Could not find the table") ||
    message.includes("Could not find the relationship") ||
    /relation ["'].+["'] does not exist/i.test(message) ||
    message.includes("schema cache") ||
    message.includes("PGRST205") ||
    message.includes("PGRST200") ||
    message.includes("42P01")
  );
}

/** RLS/권한 거부 (빈 결과와 구분 — PostgREST가 명시적 오류를 줄 때) */
export function isPermissionDeniedError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    /permission denied|row-level security|42501|PGRST301|not authorized|JWT/i.test(
      message,
    )
  );
}

export type CrmPanelLoadKind = "missing_relation" | "permission" | "other";

export function classifyCrmPanelLoadError(error: unknown): CrmPanelLoadKind {
  if (isMissingRelationError(error)) return "missing_relation";
  if (isPermissionDeniedError(error)) return "permission";
  return "other";
}

export function toCrmErrorMessage(error: unknown): string {
  if (isMissingRelationError(error)) {
    return "CRM_TABLES_MISSING";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "고객 데이터를 불러오지 못했습니다.";
}
