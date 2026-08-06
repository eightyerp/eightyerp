import { QUOTE_HEADER_ALIASES, normalizeHeader } from "./header-mapper";

export function mapQuoteColumns(row: unknown[]): Partial<Record<keyof typeof QUOTE_HEADER_ALIASES, number>> {
  const result: Partial<Record<keyof typeof QUOTE_HEADER_ALIASES, number>> = {};
  row.forEach((cell, index) => {
    const value = normalizeHeader(cell);
    for (const [key, aliases] of Object.entries(QUOTE_HEADER_ALIASES) as Array<[keyof typeof QUOTE_HEADER_ALIASES, readonly string[]]>) {
      if (result[key] == null && aliases.some((alias) => normalizeHeader(alias) === value)) result[key] = index;
    }
  });
  return result;
}
