import type * as XLSX from "xlsx";

export type WorkbookSecurityFinding = { code: "MACRO" | "EXTERNAL_LINK" | "DANGEROUS_FORMULA"; message: string };

export function scanWorkbookSecurity(workbook: XLSX.WorkBook): WorkbookSecurityFinding[] {
  const findings: WorkbookSecurityFinding[] = [];
  if ((workbook as XLSX.WorkBook & { vbaraw?: unknown }).vbaraw) findings.push({ code: "MACRO", message: "매크로가 포함된 파일은 사용할 수 없습니다." });
  const links = (workbook.Workbook as { Names?: Array<{ Ref?: string }> } | undefined)?.Names ?? [];
  if (links.some((item) => /\[[^\]]+\]|https?:\/\//i.test(item.Ref ?? ""))) findings.push({ code: "EXTERNAL_LINK", message: "외부 링크가 포함된 파일은 사용할 수 없습니다." });
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    for (const key of Object.keys(sheet ?? {})) {
      if (key.startsWith("!")) continue;
      const formula = (sheet[key] as XLSX.CellObject | undefined)?.f;
      if (formula && (/\[[^\]]+\]/.test(formula) || /(?:WEBSERVICE|HYPERLINK|DDE)\s*\(/i.test(formula))) {
        findings.push({ code: "DANGEROUS_FORMULA", message: "외부 참조 수식이 포함된 파일은 사용할 수 없습니다." });
        return findings;
      }
    }
  }
  return findings;
}

export function assertWorkbookSafe(workbook: XLSX.WorkBook): void {
  const finding = scanWorkbookSecurity(workbook)[0];
  if (finding) throw new Error(finding.message);
}
