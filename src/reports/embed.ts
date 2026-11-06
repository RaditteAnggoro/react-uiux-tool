import type { ReportDocumentV1 } from "./core/types.js";
import { RDM_KIND, RDM_SCHEMA_VERSION } from "./core/types.js";
import {
  createDefaultDocument,
  parseReport,
  serializeReport,
  validateReportDocument,
} from "./core/schema.js";
import { TEMPLATE_CATALOG, buildTemplate, getTemplate } from "./core/templates.js";
import { renderReportHtml, type RenderOptions } from "./renderers/print-html.js";
import type { ExportFormat, ExportResult } from "./formats/export.js";

/**
 * Embeddable Report SDK. Pure functions with no network, no filesystem, and no
 * environment access. HTML/CSV rendering works in a browser; PDF/XLSX/DOCX use Node
 * buffers and are documented as server-side only.
 */
export const REPORT_SDK_VERSION = "0.1.0" as const;
export { RDM_KIND, RDM_SCHEMA_VERSION };

export interface TemplateSummary {
  id: string;
  name: { en: string; id: string };
  description: { en: string; id: string };
  styleFamily: string;
}

export function listTemplates(): TemplateSummary[] {
  return TEMPLATE_CATALOG.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    styleFamily: template.styleFamily,
  }));
}

export function createReport(
  templateId: string,
  options: { locale?: string; styleFamily?: string } = {},
): ReportDocumentV1 {
  if (!getTemplate(templateId)) {
    throw new Error(`Unknown report template: ${templateId}`);
  }
  const document = buildTemplate(
    templateId,
    options.styleFamily as never,
    options.locale,
  );
  return document;
}

export function createEmptyReport(options: { locale?: string } = {}): ReportDocumentV1 {
  return createDefaultDocument({ locale: options.locale });
}

export function renderReport(
  document: ReportDocumentV1,
  data: Record<string, unknown> = {},
  options: Omit<RenderOptions, "data"> = {},
): string {
  return renderReportHtml(document, { ...options, data });
}

export function validateDocument(input: unknown): {
  ok: boolean;
  errors: Array<{ code: string; path: string; message: string }>;
  warnings: Array<{ code: string; path: string; message: string }>;
} {
  const result = validateReportDocument(input);
  return { ok: result.ok, errors: result.errors, warnings: result.warnings };
}

export function parseDocument(text: string): ReportDocumentV1 {
  const parsed = parseReport(text);
  if (!parsed.ok) {
    const first = parsed.errors[0];
    throw new Error(`${first?.path ?? "$"}: ${first?.message ?? "Invalid report document"}`);
  }
  return parsed.document!;
}

export function serializeDocument(document: ReportDocumentV1): string {
  return serializeReport(document);
}

export async function exportDocument(
  document: ReportDocumentV1,
  format: ExportFormat,
  data: Record<string, unknown> = {},
): Promise<ExportResult> {
  // Loaded lazily so importing this module never pulls Node-only PDF/XLSX/DOCX code.
  const { exportReport } = await import("./formats/export.js");
  return exportReport(document, format, data);
}

export const EMBED_USAGE = {
  browserSafeFormats: ["html", "csv"] as const,
  serverOnlyFormats: ["pdf", "xlsx", "docx"] as const,
};
