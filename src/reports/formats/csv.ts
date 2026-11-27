import type { ReportDocumentV1, ReportElement } from "../core/types.js";
import { datasetRows } from "../core/data.js";
import { tableCellText } from "../core/table.js";

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
    const path = typeof element.bindings?.path === "string" ? element.bindings.path : "";
    const rows = !path && Array.isArray(element.props.staticRows) ? element.props.staticRows : datasetRows(data, path);
    tables.push({
      headers: columns.map((column) => String(column.label ?? column.key ?? "")),
      rows: rows.map((row) =>
        columns.map((column) => {
          const value = row && typeof row === "object" ? (row as Record<string, unknown>)[String(column.key ?? "")] : "";
          return tableCellText(value, column, document.locale);
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
