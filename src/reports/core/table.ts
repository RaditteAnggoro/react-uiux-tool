import { parseDecimal, toDecimalString } from "./decimal.js";

export interface HeaderGroup { label: string; start: number; count: number }
export interface HeaderMatrixCell { row: number; column: number; rowSpan: number; colSpan: number; label: string; align: string }
export function validTableMerges(input: unknown, columnCount: number): boolean {
  if (!Array.isArray(input) || input.length > 200 || columnCount < 1) return false;
  const rectangles: Array<{ row: number; col: number; rowSpan: number; colSpan: number }> = [];
  for (const candidate of input) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const entry = candidate as Record<string, unknown>;
    const row = Number(entry.row), col = Number(entry.col), rowSpan = Number(entry.rowSpan ?? 1), colSpan = Number(entry.colSpan ?? 1);
    if (![row, col, rowSpan, colSpan].every(Number.isInteger) || row < 0 || row > 10000 || col < 0 || rowSpan < 1 || rowSpan > 5000 || colSpan < 1 || col + colSpan > columnCount) return false;
    if (rectangles.some((other) => row < other.row + other.rowSpan && other.row < row + rowSpan && col < other.col + other.colSpan && other.col < col + colSpan)) return false;
    rectangles.push({ row, col, rowSpan, colSpan });
  }
  return true;
}
/** Resolve a rectangular header matrix; reject overlapping or out-of-range spans. */
export function tableHeaderMatrix(input: unknown, columnCount: number): HeaderMatrixCell[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > 20 || columnCount < 1 || columnCount > 200) return null;
  const covered = Array.from({ length: input.length }, () => Array<boolean>(columnCount).fill(false));
  const result: HeaderMatrixCell[] = [];
  for (let row = 0; row < input.length; row++) {
    if (!Array.isArray(input[row])) return null;
    let column = 0;
    for (const item of input[row]) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      while (column < columnCount && covered[row]![column]) column++;
      const entry = item as Record<string, unknown>;
      const colSpan = entry.colSpan === undefined ? 1 : Number(entry.colSpan);
      const rowSpan = entry.rowSpan === undefined ? 1 : Number(entry.rowSpan);
      if (!Number.isInteger(colSpan) || !Number.isInteger(rowSpan) || colSpan < 1 || rowSpan < 1 || column + colSpan > columnCount || row + rowSpan > input.length) return null;
      for (let r = row; r < row + rowSpan; r++) for (let c = column; c < column + colSpan; c++) {
        if (covered[r]![c]) return null;
        covered[r]![c] = true;
      }
      result.push({ row, column, rowSpan, colSpan, label: String(entry.label ?? ""), align: entry.align === "right" || entry.align === "center" ? entry.align : "left" });
      column += colSpan;
    }
  }
  return covered.every((row) => row.every(Boolean)) ? result : null;
}
/** Consecutive columns with the same group share a heading; empty groups remain separate. */
export function tableHeaderGroups(columns: Array<Record<string, unknown>>): HeaderGroup[] {
  const groups: HeaderGroup[] = [];
  columns.forEach((column, index) => {
    const label = typeof column.headerGroup === "string" ? column.headerGroup.trim() : "";
    const previous = groups.at(-1);
    if (label && previous?.label === label) previous.count++;
    else groups.push({ label, start: index, count: 1 });
  });
  return groups;
}

/** Shared table column contract. Widths are proportional and remain backward compatible. */
export function tableColumnWidths(columns: Array<Record<string, unknown>>, total: number): number[] {
  const weights = columns.map((column) => {
    const width = Number(column.width);
    return Number.isFinite(width) && width > 0 ? width : 1;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((weight) => total * weight / sum);
}

/** Decimal strings stay exact; percent values are expressed in percentage points. */
export function tableCellText(value: unknown, column: Record<string, unknown>, locale: string): string {
  if (value === undefined || value === null || value === "") return "";
  const format = column.format ?? (column.currency === true ? "currency" : "text");
  if (format !== "currency" && format !== "decimal" && format !== "percent") return String(value);
  const requested = Number(column.decimals ?? 2);
  const digits = Number.isInteger(requested) && requested >= 0 && requested <= 6 ? requested : 2;
  try {
    if (typeof value !== "string" && typeof value !== "number") return String(value);
    const decimal = parseDecimal(value, digits);
    const raw = toDecimalString(decimal);
    const negative = raw.startsWith("-");
    const [whole, fraction] = (negative ? raw.slice(1) : raw).split(".");
    const grouping = new Intl.NumberFormat(locale).format(BigInt(whole!));
    const separator = new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
    return `${negative ? "-" : ""}${grouping}${fraction ? separator + fraction : ""}${format === "percent" ? "%" : ""}`;
  } catch { return String(value); }
}

/** Pick legible black or white text for a solid hexadecimal table header. */
export function tableHeaderTextColor(value: unknown): string {
  const hex = typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#f1f4f8";
  const linear = [1, 3, 5].map((index) => { const c = parseInt(hex.slice(index, index + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return (0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!) < 0.179 ? "#ffffff" : "#000000";
}
