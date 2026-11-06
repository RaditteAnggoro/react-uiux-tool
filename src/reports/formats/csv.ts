import type { ReportDocumentV1, ReportElement } from "../core/types.js";
import { evaluateExpression } from "../core/expressions.js";
import { toDecimalString } from "../core/decimal.js";

const FORMULA = /^[=+\-@\t\r]/;

export function csvEscape(value: unknown): string {
  const text = typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
  const guarded = FORMULA.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

interface TableRows {
  headers: string[];
  rows: string[][];
}

function resolveRows(data: Record<string, unknown> | undefined, path: string | undefined): unknown[] {
  if (!data || !path) return [];
  const [dataset, ...rest] = path.split(".");
  const root = data[dataset ?? ""];
  if (!rest.length) return Array.isArray(root) ? root : [];
  const field = rest.join(".");
  return Array.isArray(root)
    ? root.map((row) =>
        row && typeof row === "object" ? (row as Record<string, unknown>)[field] : undefined,
      )
    : [];
}

export function collectTables(
  document: ReportDocumentV1,
  data: Record<string, unknown> = {},
): TableRows[] {
  const tables: TableRows[] = [];
  const elements: ReportElement[] = document.bands.flatMap((band) => band.elements);
  for (const element of elements) {
    if (element.type !== "table") continue;
    const columns = Array.isArray(element.props.columns)
      ? (element.props.columns as Array<Record<string, unknown>>)
      : [];
    const rows = resolveRows(data, typeof element.bindings?.path === "string" ? element.bindings.path : "");
    tables.push({
      headers: columns.map((column) => String(column.label ?? column.key ?? "")),
      rows: rows.map((row) =>
        columns.map((column) => {
          const value = row && typeof row === "object" ? (row as Record<string, unknown>)[String(column.key ?? "")] : "";
          if (column.currency === true) {
            const result = evaluateExpression(String(value ?? "0"), { locale: document.locale });
            if (result.ok && result.value && typeof result.value === "object") {
              const text = toDecimalString(result.value);
              return new Intl.NumberFormat(document.locale, { minimumFractionDigits: 2 }).format(Number(text));
            }
          }
          return value === null || value === undefined ? "" : String(value);
        }),
      ),
    });
  }
  return tables;
}

export function exportCsv(document: ReportDocumentV1, data: Record<string, unknown> = {}): string {
  const tables = collectTables(document, data);
  if (tables.length === 0) {
    return `${csvEscape("Report")},${csvEscape(document.title)}\n`;
  }
  const lines: string[] = [];
  tables.forEach((table, index) => {
    if (index > 0) lines.push("");
    lines.push(table.headers.map(csvEscape).join(","));
    for (const row of table.rows) lines.push(row.map(csvEscape).join(","));
  });
  return `${lines.join("\n")}\n`;
}
