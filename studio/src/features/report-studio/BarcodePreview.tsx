import { useMemo } from "react";
import { barcodeGeometry, reportBarcode, type BarcodeKind } from "../../../../src/reports/core/barcode";
import type { ReportElement } from "../../../../src/reports/core/types";

export default function BarcodePreview(props: ({ element: ReportElement; data?: Record<string, unknown> } |
  { kind: BarcodeKind; value: string }) & { missing: string }) {
  const element = "element" in props ? props.element : undefined;
  const data = "element" in props ? props.data : undefined;
  const kind = "kind" in props ? props.kind : undefined;
  const value = "value" in props ? props.value : undefined;
  const code = useMemo(() => element ? reportBarcode(element, data) : barcodeGeometry(kind, value),
    [element, data, kind, value]);
  if (!code) return <span className="rs-image-stub">{props.missing}</span>;
  return <svg width="100%" height="100%" style={{ display: "block", background: "white" }} role="img"
    aria-label={code.kind === "qrcode" ? "QR Code" : "Code 128"}
    viewBox={`0 0 ${code.width} ${code.height}`} preserveAspectRatio={code.kind === "qrcode" ? "xMidYMid meet" : "none"}
    shapeRendering="crispEdges" fill="black">
    {code.rects.map((rect, index) => <rect key={index} {...rect} />)}
  </svg>;
}
