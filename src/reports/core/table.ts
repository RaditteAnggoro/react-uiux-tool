import { parseDecimal, toDecimalString } from "./decimal.js";

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
