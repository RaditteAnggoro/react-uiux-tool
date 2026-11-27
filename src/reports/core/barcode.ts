import { code128, qrcode, type DrawingContext } from "@bwip-js/generic";
import { resolvePath } from "./data.js";
import type { ReportElement } from "./types.js";
import { barcodeValueValid, type BarcodeKind } from "./barcode-value.js";
export type { BarcodeKind } from "./barcode-value.js";

export type BarcodeRect = { x: number; y: number; width: number; height: number };

function encodeGeometry(kind: BarcodeKind, value: string) {
  const quietZone = kind === "code128" ? 10 : 4;
  const rects: BarcodeRect[] = [];
  let width = 0;
  let height = 0;
  let rowEdges: number[][] = [];
  const unsupported = () => { throw new Error("Unsupported barcode geometry"); };
  const drawing: DrawingContext<void> = {
    scale: () => [1, 1],
    measure: unsupported,
    init(w, h) {
      width = w;
      height = h;
      if (kind === "qrcode") rowEdges = Array.from({ length: h }, () => []);
    },
    line(x0, _y0, x1, _y1, strokeWidth) {
      if (kind !== "code128" || x0 !== x1) return unsupported();
      rects.push({ x: Math.floor(x0 - strokeWidth / 2) + quietZone, y: 0, width: strokeWidth, height: 1 });
    },
    polygon(points) {
      if (kind !== "qrcode") return unsupported();
      // BWIP emits orthogonal outlines. Pair crossings at each module row,
      // including the inner outlines that cut holes in QR finder patterns.
      for (let index = 0; index < points.length; index++) {
        const [x, y] = points[index]!;
        const [nextX, nextY] = points[(index + 1) % points.length]!;
        if (nextX !== x) {
          if (nextY !== y) return unsupported();
          continue;
        }
        for (let row = Math.min(y, nextY); row < Math.max(y, nextY); row++) rowEdges[row]!.push(x);
      }
    },
    hexagon: unsupported,
    ellipse: unsupported,
    fill() {},
    text: unsupported,
    end() {},
  };
  (kind === "code128" ? code128 : qrcode)({ bcid: kind, text: value, scale: 1 }, drawing);
  for (const [row, edges] of rowEdges.entries()) {
    edges.sort((a, b) => a - b);
    if (edges.length % 2) return unsupported();
    for (let index = 0; index < edges.length; index += 2) {
      const start = edges[index]!;
      const end = edges[index + 1]!;
      if (end !== start) rects.push({ x: start + quietZone, y: row + quietZone, width: end - start, height: 1 });
    }
  }
  if (!rects.length) return null;
  return { kind, width: width + 2 * quietZone, height: kind === "code128" ? 1 : height + 2 * quietZone, rects };
}

export function reportBarcode(element: ReportElement, data?: Record<string, unknown>) {
  const kind = element.props.barcodeKind;
  const binding = element.bindings?.path;
  const raw = typeof binding === "string" && binding ? resolvePath(data, binding) : element.props.barcodeValue;
  const value = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : raw;
  return barcodeGeometry(kind, value);
}

export function barcodeGeometry(kind: unknown, value: unknown) {
  if ((kind !== "code128" && kind !== "qrcode") || !barcodeValueValid(kind, value)) return null;
  try {
    return encodeGeometry(kind, value);
  } catch {
    return null;
  }
}
