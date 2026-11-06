import type { ReportDocumentV1, ReportElement } from "../../core/types.js";

/**
 * EXPERIMENTAL .yrf producer. The mapping below is derived only from three local
 * samples. It has NOT been validated against the vendor renderer, so the output is
 * labelled experimental and must be verified before business use.
 */
export interface YrfCreateResult {
  ok: boolean;
  text?: string;
  warnings: string[];
  error?: string;
}

/** Approximate scale observed for A4 samples (2320/210 ≈ 11). Unverified. */
const UNITS_PER_MM = 11;

function objectFor(element: ReportElement, index: number): Record<string, unknown> | null {
  const base = {
    name: element.id || `Object${index + 1}`,
    left: Math.round(element.box.x * UNITS_PER_MM),
    top: Math.round(element.box.y * UNITS_PER_MM),
    width: Math.round(element.box.width * UNITS_PER_MM),
    height: Math.round(element.box.height * UNITS_PER_MM),
  };
  if (element.type === "text") {
    return { type: "label", ...base, caption: String(element.props.text ?? "") };
  }
  if (element.type === "field") {
    const label = String(element.props.label ?? "");
    const binding = typeof element.bindings?.path === "string" ? element.bindings.path : "";
    return { type: "textbox", ...base, caption: label || binding };
  }
  if (element.type === "line") return { type: "line", ...base };
  if (element.type === "table") {
    const columns = Array.isArray(element.props.columns)
      ? (element.props.columns as Array<Record<string, unknown>>)
      : [];
    return {
      type: "textbox",
      ...base,
      caption: columns.map((column) => String(column.label ?? "")).join(" | "),
    };
  }
  if (element.type === "image" || element.type === "rect") return { type: "shape", ...base };
  return null;
}

function bandFor(band: ReportDocumentV1["bands"][number]): Record<string, unknown> {
  const type =
    band.kind === "pageHeader"
      ? "pageHeader"
      : band.kind === "pageFooter"
        ? "pageFooter"
        : band.kind === "groupHeader"
          ? "groupHeader"
          : band.kind === "groupFooter"
            ? "groupFooter"
            : "detail";
  return {
    name: band.id,
    type,
    height: Math.round(band.height * UNITS_PER_MM),
    objects: band.elements
      .map((element, index) => objectFor(element, index))
      .filter((value): value is Record<string, unknown> => value !== null),
  };
}

export function createYrfFromNative(document: ReportDocumentV1): YrfCreateResult {
  const warnings = [
    "Experimental output: the mapping is inferred from three local samples and has not been validated by the vendor renderer.",
    `Position scale is approximate (${UNITS_PER_MM} units/mm); verify with the vendor preview before publishing.`,
    "Vendor scripts, data bindings, and advanced components are not generated.",
  ];
  const landscape = document.page.orientation === "landscape";
  const title = document.bands.find((band) => band.kind === "reportTitle");
  const pageBands = document.bands.filter((band) => band.kind !== "reportTitle");

  const yrf = {
    waiReportForm: { version: "1.0.0", license: "" },
    pageSetting: {
      paper: {
        type: document.page.size === "custom" ? "A4" : document.page.size,
        width: Math.round(document.page.width * UNITS_PER_MM),
        height: Math.round(document.page.height * UNITS_PER_MM),
      },
      margin: {
        left: Math.round(document.page.margins.left * UNITS_PER_MM),
        right: Math.round(document.page.margins.right * UNITS_PER_MM),
        top: Math.round(document.page.margins.top * UNITS_PER_MM),
        bottom: Math.round(document.page.margins.bottom * UNITS_PER_MM),
      },
      orientation: landscape ? 1 : 0,
    },
    styles: {},
    script: {},
    vbScript: "",
    layout: {
      reportHeader: title ? bandFor(title) : { name: "ReportHeader", type: "reportHeader", height: 150, objects: [] },
      pages: [
        {
          bands: pageBands.map(bandFor),
        },
      ],
      reportFooter: { name: "ReportFooter", type: "reportFooter", height: 150, objects: [] },
    },
  };
  const text = `${JSON.stringify(yrf, null, 2)}\n`;
  return { ok: true, text, warnings };
}
