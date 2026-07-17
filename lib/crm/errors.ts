export function isMissingRelationError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return (
    message.includes("Could not find the table") ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("PGRST205") ||
    message.includes("42P01")
  );
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
