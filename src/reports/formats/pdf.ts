import type { ReportDocumentV1, ReportElement } from "../core/types.js";
import { paginateReport, type PlacedBand } from "../core/pagination.js";
import { evaluateExpression } from "../core/expressions.js";
import { toDecimalString } from "../core/decimal.js";

const MM = 72 / 25.4;
type PdfContent = string[] & { unsupportedCharacters: number };

function escapePdfText(value: string): string {
  return String(value ?? "")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function textLine(state: PdfContent, x: number, y: number, value: string, size: number, bold = false): void {
  if (!value) return;
  state.unsupportedCharacters += [...value].filter((char) => !/^[\x20-\x7E\xA0-\xFF]$/.test(char)).length;
  state.push(
    `BT ${bold ? "/F2" : "/F1"} ${size} Tf ${(x * MM).toFixed(2)} ${(y * MM).toFixed(2)} Td (${escapePdfText(value)}) Tj ET`,
  );
}

function fieldText(
  document: ReportDocumentV1,
  element: ReportElement,
  data: Record<string, unknown>,
  scopeRows: unknown[] | undefined,
  page: number,
  totalPages: number,
): string {
  if (typeof element.props.expression === "string" && element.props.expression.trim()) {
    const result = evaluateExpression(element.props.expression, {
      datasets: { ...data, group: scopeRows ?? [] },
      locale: document.locale,
      page,
      totalPages,
    });
    if (!result.ok) return `#${result.error}`;
    const value = result.value;
    if (value === null) return "";
    if (typeof value === "object") {
      const numeric = Number(toDecimalString(value));
      if (!Number.isFinite(numeric)) return toDecimalString(value);
      try {
        return new Intl.NumberFormat(document.locale, { minimumFractionDigits: 2 }).format(numeric);
      } catch {
        return numeric.toFixed(2);
      }
    }
    return String(value);
  }
  const path = typeof element.bindings?.path === "string" ? element.bindings.path : "";
  const [dataset, ...rest] = path.split(".");
  const root = data[dataset ?? ""];
  const value = Array.isArray(root)
    ? root[0] && typeof root[0] === "object"
      ? (root[0] as Record<string, unknown>)[rest.join(".")]
      : ""
    : root && typeof root === "object"
      ? (root as Record<string, unknown>)[rest.join(".")]
      : "";
  if (element.props.format === "currency" || element.props.format === "decimal") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      try {
        return new Intl.NumberFormat(document.locale, { minimumFractionDigits: 2 }).format(numeric);
      } catch {
        return numeric.toFixed(2);
      }
    }
  }
  return value === undefined || value === null ? "" : String(value);
}

function drawBand(
  document: ReportDocumentV1,
  placed: PlacedBand,
  data: Record<string, unknown>,
  pageNumber: number,
  totalPages: number,
  bodyTop: number,
  content: PdfContent,
): void {
  const bandY = bodyTop - placed.y;
  for (const element of placed.band.elements) {
    const x = document.page.margins.left + element.box.x;
    const y = bandY - element.box.y;
    const size = Number(element.props.fontSize ?? 9);
    const bold = Number(element.props.fontWeight ?? 400) >= 600;
    if (element.type === "text") {
      String(element.props.text ?? "")
        .split("\n")
        .forEach((line, index) => textLine(content, x, y - index * (size / MM) * 0.42, line, size, bold));
    } else if (element.type === "field") {
      const label = typeof element.props.label === "string" ? element.props.label : "";
      textLine(content, x, y, label.toUpperCase(), Math.max(6, size - 2), false);
      textLine(
        content,
        x,
        y - (size / MM) * 0.45,
        fieldText(document, element, data, placed.scopeRows, pageNumber, totalPages),
        size,
        bold,
      );
    } else if (element.type === "line") {
      content.push(
        `0.6 w ${(x * MM).toFixed(2)} ${(y * MM).toFixed(2)} m ${((x + element.box.width) * MM).toFixed(2)} ${(y * MM).toFixed(2)} l S`,
      );
    } else if (element.type === "rect") {
      content.push(
        `0.6 w ${(x * MM).toFixed(2)} ${(y * MM).toFixed(2)} ${(element.box.width * MM).toFixed(2)} ${(element.box.height * MM).toFixed(2)} re S`,
      );
    } else if (element.type === "pageNumber") {
      const template = String(element.props.format ?? "Page {page} of {total}");
      textLine(
        content,
        x,
        y,
        template.replace("{page}", String(pageNumber)).replace("{total}", String(totalPages)),
        size,
        false,
      );
    } else if (element.type === "table") {
      const columns = Array.isArray(element.props.columns)
        ? (element.props.columns as Array<Record<string, unknown>>)
        : [];
      const rows = placed.rows ?? [];
      const rowHeight = Number(element.props.rowHeight ?? 7);
      let rowY = y;
      textLine(
        content,
        x,
        rowY,
        columns.map((column) => String(column.label ?? column.key ?? "")).join("  |  "),
        7,
        true,
      );
      rowY -= rowHeight;
      for (const row of rows) {
        const cells = columns.map((column) => {
          const raw = row && typeof row === "object" ? (row as Record<string, unknown>)[String(column.key ?? "")] : "";
          if (column.currency === true) {
            const numeric = Number(raw);
            if (Number.isFinite(numeric)) {
              try {
                return new Intl.NumberFormat(document.locale, { minimumFractionDigits: 2 }).format(numeric);
              } catch {
                return numeric.toFixed(2);
              }
            }
          }
          return raw === undefined || raw === null ? "" : String(raw);
        });
        textLine(content, x, rowY, cells.join("  |  "), 7);
        rowY -= rowHeight;
      }
    }
  }
}

/** Dependency-free PDF 1.4 writer that follows the same pagination as the HTML print renderer. */
export function exportPdf(document: ReportDocumentV1, data: Record<string, unknown> = {}, diagnostics?: { unsupportedCharacters: number }): Uint8Array {
  const layouts = paginateReport(document, { data });
  const totalPages = layouts.length;
  const bodyTop = document.page.height - document.page.margins.top;
  const pages: PdfContent[] = layouts.map((layout, index) => {
    const content = Object.assign([] as string[], { unsupportedCharacters: 0 });
    for (const placed of layout.bands) {
      drawBand(document, placed, data, index + 1, totalPages, bodyTop, content);
    }
    return content;
  });
  if (diagnostics) diagnostics.unsupportedCharacters = pages.reduce((sum, page) => sum + page.unsupportedCharacters, 0);

  const width = (document.page.width * MM).toFixed(2);
  const height = (document.page.height * MM).toFixed(2);
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [] /Count 0 >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const firstPageObject = 5;
  const firstContentObject = firstPageObject + totalPages;
  objects[1] = `<< /Type /Pages /Kids [${pages
    .map((_, index) => `${firstPageObject + index} 0 R`)
    .join(" ")}] /Count ${totalPages} >>`;
  pages.forEach((_, index) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${firstContentObject + index} 0 R >>`,
    );
  });
  pages.forEach((page) => {
    const stream = page.join("\n");
    objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}
