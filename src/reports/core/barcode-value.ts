export type BarcodeKind = "code128" | "qrcode";

export function barcodeValueValid(kind: unknown, value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && (kind === "code128"
    ? /^[\x20-\x7e]{1,80}$/.test(value)
    : kind === "qrcode" && new TextEncoder().encode(value).length <= 256);
}
