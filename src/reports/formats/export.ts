import type { ReportDocumentV1 } from "../core/types.js";
import { parseReport, serializeReport, validateReportDocument } from "../core/schema.js";
import { renderReportHtml } from "../renderers/print-html.js";
import { exportCsv } from "./csv.js";
import { exportPdf } from "./pdf.js";
import { exportXlsx } from "./xlsx.js";
import { exportDocx } from "./docx.js";
import { parameterWarnings, withParameterDefaults } from "../core/parameters.js";
import { reportBarcode } from "../core/barcode.js";
import { outputDocument } from "../core/visibility.js";

export type ExportFormat = "html" | "csv" | "pdf" | "xlsx" | "docx";

export interface ExportResult {
  filename: string;
  mime: string;
  bytes: Uint8Array;
  warnings: string[];
}

export const EXPORT_FORMATS: readonly ExportFormat[] = ["html", "csv", "pdf", "xlsx", "docx"];

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "report"
  );
}

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === "string" && (EXPORT_FORMATS as readonly string[]).includes(value);
}

/**
 * Export a validated native document. Exports never mutate the source and never
 * claim to be editable templates afterwards.
 */
function fidelityWarnings(document: ReportDocumentV1, format: ExportFormat): string[] {
  const types = new Set(
    document.bands.flatMap((band) => band.elements.map((element) => element.type)),
  );
  const advancedTables = document.bands
    .flatMap((band) => band.elements)
    .filter(
      (element) =>
        element.type === "table" &&
        (Array.isArray(element.props.headerRows) ||
          Array.isArray(element.props.merges) ||
          Array.isArray(element.props.rowRules)),
    ).length;
  const warnings: string[] = [];
  if (advancedTables && ["pdf", "xlsx", "docx"].includes(format)) warnings.push(`${format.toUpperCase()}: advanced table headers, merged cells or row styling may be simplified`);
  if (format === "pdf") {
    const hasRichFormatting = document.bands.some((band) => band.elements.some(({ props, type }) =>
      props.underline === true || props.strike === true || props.list === "bullet" ||
      props.list === "number" || (Number(props.borderWidth ?? 0) > 0 && !["rect", "text", "field", "image"].includes(type)) ||
      props.wrap === false,
    ));
    if (hasRichFormatting) warnings.push("PDF: underline, strikethrough, lists, borders or text wrapping may not be rendered");
    const unsupportedConditionalColor = document.bands.some((band) => band.elements.some((element) => [...(element.conditions ?? []), element.props.rowCondition].some((rule) => {
      if (!rule || typeof rule !== "object") return false;
      const entry = rule as Record<string, unknown>;
      return [entry.color, entry.background].some((value) => typeof value === "string" && !/^#[0-9a-f]{6}$/i.test(value));
    })));
    if (unsupportedConditionalColor) warnings.push("PDF: conditional colors must use six-digit hex values");
  }
  if (format === "xlsx" || format === "docx" || format === "csv") {
    if (types.has("image") && format !== "csv") warnings.push(`${format.toUpperCase()}: image elements are not exported`);
    if (format === "csv") warnings.push("CSV: layout, styling, and non-table elements are dropped");
    if (format === "docx" && [...types].some(type => type !== "table")) {
      warnings.push("DOCX: exports the report title and tables; design elements and layout are omitted");
    }
  }
  return warnings;
}

export function exportReport(
  document: unknown,
  format: ExportFormat,
  data: Record<string, unknown> = {},
): ExportResult {
  const validation = validateReportDocument(document);
  if (!validation.ok) {
    const first = validation.errors[0];
    throw new Error(`Document is invalid: ${first?.path ?? "$"} ${first?.message ?? ""}`.trim());
  }
  const doc = outputDocument(document as ReportDocumentV1);
  if (doc.linkedReports?.length) throw new Error("Resolve linked reports in Report Studio before exporting.");
  const warnings = [
    ...validation.warnings.map((issue) => `${issue.path} ${issue.message}`.trim()),
    ...parameterWarnings(doc, data).map((issue) => `${issue.path} ${issue.message}`),
    ...fidelityWarnings(doc, format),
  ];
  const barcodes = doc.bands.flatMap(band => band.elements).filter(element => element.type === "barcode");
  if (barcodes.length && (format === "pdf" || format === "html")) {
    const sample = withParameterDefaults(doc, data);
    for (const element of barcodes) {
      const code = reportBarcode(element, sample);
      if (!code) warnings.push(`Barcode ${element.id}: the bound value is missing or invalid`);
      else if (element.box.width / code.width < 0.2 || code.kind === "qrcode" && element.box.height / code.height < 0.2) {
        warnings.push(`Barcode ${element.id}: increase the frame size for print scanning`);
      }
    }
  } else if (barcodes.length && format === "xlsx") {
    warnings.push("XLSX: barcode graphics are omitted");
  }
  const base = slug(doc.title);
  if (format === "html") {
    return {
      filename: `${base}.html`,
      mime: "text/html; charset=utf-8",
      bytes: new TextEncoder().encode(renderReportHtml(doc, { data })),
      warnings,
    };
  }
  if (format === "csv") {
    return {
      filename: `${base}.csv`,
      mime: "text/csv; charset=utf-8",
      bytes: new TextEncoder().encode(exportCsv(doc, data)),
      warnings,
    };
  }
  if (format === "xlsx") {
    return {
      filename: `${base}.xlsx`,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: exportXlsx(doc, data),
      warnings,
    };
  }
  if (format === "docx") {
    return {
      filename: `${base}.docx`,
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: exportDocx(doc, data),
      warnings,
    };
  }
  if (format === "pdf") {
    const diagnostics = { unsupportedCharacters: 0, unsupportedImages: 0, clippedCells: 0, limitedGraphics: 0 };
    const bytes = exportPdf(doc, data, diagnostics);
    if (diagnostics.unsupportedImages) warnings.push(`PDF: ${diagnostics.unsupportedImages} image(s) could not be rendered; use an 8-bit non-interlaced PNG or JPEG`);
    if (diagnostics.unsupportedCharacters) warnings.push(`PDF: ${diagnostics.unsupportedCharacters} unsupported character(s) are replaced with "?" (WinAnsi fonts)`);
    if (diagnostics.clippedCells) warnings.push(`PDF: ${diagnostics.clippedCells} table cell(s) may be clipped; widen the column or shorten the value`);
    if (diagnostics.limitedGraphics) warnings.push(`PDF: ${diagnostics.limitedGraphics} chart or crosstab occurrence(s) exceed the frame or data limit`);
    return {
      filename: `${base}.pdf`,
      mime: "application/pdf",
      bytes,
      warnings,
    };
  }
  throw new Error(`Export format "${String(format)}" is not implemented`);
}

/** Round trip helper used by export tests and future save flows. */
export function cloneDocument(document: ReportDocumentV1): ReportDocumentV1 {
  const parsed = parseReport(serializeReport(document));
  if (!parsed.ok) throw new Error("Document could not be serialized");
  return parsed.document!;
}
