import { barcodeValueValid, type BarcodeKind } from "../../core/barcode-value.js";

const editableKinds = new Set(["label", "textbox", "line", "shape", "image"]);
const opaqueKinds = new Map([
  ["AR.DataControl", "data-control"],
  ["AR.XML", "xml"],
  ["AR.Barcode", "barcode"],
  ["barcode", "barcode"],
  ["qrcode", "barcode"],
  ["rtf", "rich-text"],
  ["subReport", "subreport"],
] as const);

const localLayoutKinds = new Set(["AR.Barcode", "barcode", "qrcode", "rtf", "subReport"]);
const layoutFields = new Set(["left", "top", "width", "height"]);

export function hasYrfLocalLayout(kind: string): boolean {
  return localLayoutKinds.has(kind);
}

export function yrfBarcodeKind(kind: string, format: unknown): BarcodeKind | null {
  if (kind === "qrcode") return "qrcode";
  return kind === "barcode" && format === "code128" ? "code128" : null;
}

export function isYrfLocalField(kind: string, field: string, value: unknown, format?: unknown): boolean {
  if (hasYrfLocalLayout(kind) && layoutFields.has(field)) {
    return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1_000_000 &&
      (!(field === "width" || field === "height") || value >= 0);
  }
  if (typeof value !== "string" || value.length > 4000) return false;
  const barcode = yrfBarcodeKind(kind, format);
  if (barcode && field === "value") return value === "" || barcodeValueValid(barcode, value);
  if ((kind === "AR.DataControl" || kind === "AR.XML") && field === "visible") return value === "0" || value === "1";
  if (kind === "AR.XML" && field === "recordsetPattern") return !/[\u0000-\u001f\u007f]/.test(value);
  if (kind === "rtf" && field === "data") return !/^\s*\{\\rtf/i.test(value) && !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
  if (kind === "subReport" && field === "reportName") return value === "" || /^[\p{L}\p{N}_][\p{L}\p{N}\p{M} ._-]{0,160}\.(?:yrf|rpx)$/iu.test(value);
  return false;
}

export type OpaqueYrfKind = typeof opaqueKinds extends ReadonlyMap<string, infer K> ? K : never;

export function yrfObjectCapability(kind: string): "visual" | OpaqueYrfKind | "unknown" {
  if (editableKinds.has(kind)) return "visual";
  return opaqueKinds.get(kind as Parameters<typeof opaqueKinds.get>[0]) ?? "unknown";
}

export function hasYrfScriptField(key: string): boolean {
  return /scripts?$|^(?:onformat|onbeforeprint|onafterprint|beforeprint|afterprint)$/i.test(key);
}
