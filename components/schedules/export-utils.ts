export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (v: string | number | null | undefined) => {
    const text = String(v ?? "");
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const bom = "\uFEFF";
  const body = [headers.join(","), ...rows.map((r) => r.map(escape).join(","))].join(
    "\n",
  );
  const blob = new Blob([bom + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Excel이 열 수 있는 간단  SpreadsheetML (.xls) */
export function downloadXls(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
) {
  const esc = (v: string | number | null | undefined) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const th = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const trs = rows
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`,
    )
    .join("");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8" /></head>
<body><table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

export function dateStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}
