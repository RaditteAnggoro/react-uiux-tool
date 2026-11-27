import { asRecord, datasetRows } from "./data.js";
import { toDecimalString, tryParseDecimal } from "./decimal.js";
import { tableCellText } from "./table.js";
import type { ReportElement } from "./types.js";

const MAX_KEYS = 100;

export function summarizeCrosstab(element: ReportElement, data: Record<string, unknown> | undefined, locale: string) {
  const binding = typeof element.bindings?.path === "string" ? element.bindings.path : "";
  const rowKey = String(element.props.rowKey ?? "row");
  const columnKey = String(element.props.columnKey ?? "column");
  const valueKey = String(element.props.valueKey ?? "value");
  const count = element.props.aggregate === "count";
  const rowTotals = new Map<string, bigint>();
  const columnTotals = new Map<string, bigint>();
  const cells = new Map<string, Map<string, bigint>>();
  let grand = 0n;
  let limited = false;
  for (const entry of datasetRows(data, binding)) {
    const row = asRecord(entry);
    const rowName = String(row[rowKey] ?? "");
    const columnName = String(row[columnKey] ?? "");
    if ((!rowTotals.has(rowName) && rowTotals.size >= MAX_KEYS) ||
        (!columnTotals.has(columnName) && columnTotals.size >= MAX_KEYS)) {
      limited = true;
      continue;
    }
    const amount = count ? 100n : tryParseDecimal(row[valueKey], 2)?.units ?? 0n;
    let rowCells = cells.get(rowName);
    if (!rowCells) cells.set(rowName, rowCells = new Map());
    rowCells.set(columnName, (rowCells.get(columnName) ?? 0n) + amount);
    rowTotals.set(rowName, (rowTotals.get(rowName) ?? 0n) + amount);
    columnTotals.set(columnName, (columnTotals.get(columnName) ?? 0n) + amount);
    grand += amount;
  }
  const formatted = (units: bigint) => tableCellText(toDecimalString({ units, scale: 2 }), { format: "decimal", decimals: 2 }, locale);
  const columns = [...columnTotals.keys()];
  return {
    header: [String(element.props.rowLabel ?? rowKey), ...columns, "Total"],
    rows: [...rowTotals].map(([name, total]) => [
      name, ...columns.map(column => formatted(cells.get(name)?.get(column) ?? 0n)), formatted(total),
    ]),
    footer: ["Total", ...columns.map(column => formatted(columnTotals.get(column) ?? 0n)), formatted(grand)],
    limited,
  };
}
