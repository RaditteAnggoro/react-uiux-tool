import { DEFAULT_LIMITS, type ReportDocumentV1, type ReportElement } from "../../../../src/reports/core/types";

export type PdfTextRun = { text: string; x: number; y: number; width: number; height: number; rotation: number };
export type PdfReportPage = { aspect: number } & ({ image: string } | { runs: PdfTextRun[] });

export function appendPdfPages(document: ReportDocumentV1, pages: PdfReportPage[], name: string): ReportDocumentV1 {
  const { page, bands } = document;
  const reserved = bands.filter(band => (band.kind === "pageHeader" || band.kind === "pageFooter") && band.repeat !== false)
    .reduce((height, band) => height + band.height, 0);
  const availableWidth = page.width - page.margins.left - page.margins.right;
  const availableHeight = page.height - page.margins.top - page.margins.bottom - reserved;
  if (availableWidth <= 0 || availableHeight <= 1) throw new Error("The report page has no room for the PDF.");
  const prefix = `pdf-${crypto.randomUUID()}`;
  const result: ReportDocumentV1 = { ...document, bands: [...bands, ...pages.map((source, index) => {
    const { aspect } = source;
    const width = Math.min(availableWidth, availableHeight * aspect);
    const height = Math.min(availableHeight, width / aspect);
    const id = `${prefix}-${index + 1}`;
    const label = `${name}: ${index + 1}`.slice(0, 120);
    const offset = (availableWidth - width) / 2;
    const elements: ReportElement[] = "image" in source
      ? [{ id: `el-${id}`, type: "image", box: { x: offset, y: 0, width, height },
          props: { src: source.image, fit: "contain", alt: label } }]
      : source.runs.map((run, index) => ({
          id: `el-${id}-${index + 1}`, type: "text",
          box: { x: offset + width * run.x, y: height * run.y, width: width * run.width, height: height * run.height },
          props: { text: run.text, fontSize: Math.max(6, Math.round(height * run.height * 72 / 25.4)),
            wrap: false, ...(run.rotation ? { rotation: run.rotation } : {}) },
        }));
    return {
      id, label, kind: "detail" as const, height, pageBreakBefore: true,
      elements,
    };
  })] };
  if (result.bands.length > DEFAULT_LIMITS.maxBands || new TextEncoder().encode(JSON.stringify(result, null, 2)).length > DEFAULT_LIMITS.maxBytes) {
    throw new Error("Adding these PDF pages would exceed the report size limit.");
  }
  return result;
}

export { appendReportSections } from "../../../../src/reports/core/subreport";
