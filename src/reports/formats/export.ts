import type { ReportDocumentV1 } from "../core/types.js";
import { parseReport, serializeReport, validateReportDocument } from "../core/schema.js";
import { renderReportHtml } from "../renderers/print-html.js";
import { exportCsv } from "./csv.js";
import { exportPdf } from "./pdf.js";
import { exportXlsx } from "./xlsx.js";
import { exportDocx } from "./docx.js";

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
  const tableCount = document.bands
    .flatMap((band) => band.elements)
    .filter((element) => element.type === "table").length;
  const warnings: string[] = [];
  if (format === "pdf") {
    if (types.has("chart")) warnings.push("PDF: chart elements are not rendered yet");
    if (types.has("crosstab")) warnings.push("PDF: crosstab cells are not rendered yet");
    const hasRichFormatting = document.bands.some((band) => band.elements.some(({ props }) =>
      props.underline === true || props.strike === true || props.list === "bullet" ||
      props.list === "number" || Number(props.borderWidth ?? 0) > 0 ||
      Number(props.rotation ?? 0) !== 0 || props.wrap === false,
    ));
    if (hasRichFormatting) warnings.push("PDF: underline, strikethrough, lists, borders, rotation or text wrapping may not be rendered");
  }
  if (format === "xlsx" || format === "docx" || format === "csv") {
    if (types.has("image") && format !== "csv") warnings.push(`${format.toUpperCase()}: image elements are not exported`);
    if (tableCount > 1) {
      warnings.push(`${format.toUpperCase()}: only the first table is exported (${tableCount} tables found)`);
    }
    if (format === "csv") warnings.push("CSV: layout, styling, and non-table elements are dropped");
    if (format === "docx") warnings.push("DOCX: paragraphs and the first table only; charts and crosstabs are dropped");
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
  const doc = document as ReportDocumentV1;
  const warnings = [
    ...validation.warnings.map((issue) => `${issue.path} ${issue.message}`.trim()),
    ...fidelityWarnings(doc, format),
  ];
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
    const diagnostics = { unsupportedCharacters: 0, unsupportedImages: 0, clippedCells: 0 };
    const bytes = exportPdf(doc, data, diagnostics);
    if (diagnostics.unsupportedImages) warnings.push(`PDF: ${diagnostics.unsupportedImages} image(s) could not be rendered; use an 8-bit non-interlaced PNG or JPEG`);
    if (diagnostics.unsupportedCharacters) warnings.push(`PDF: ${diagnostics.unsupportedCharacters} unsupported character(s) are replaced with "?" (Latin-1 subset)`);
    if (diagnostics.clippedCells) warnings.push(`PDF: ${diagnostics.clippedCells} table cell(s) may be clipped; widen the column or shorten the value`);
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
