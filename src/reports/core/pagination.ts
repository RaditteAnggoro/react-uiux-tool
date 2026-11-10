import type { ReportBand, ReportDocumentV1 } from "./types.js";
import { datasetRows } from "./data.js";

export interface PlacedBand {
  band: ReportBand;
  y: number;
  /** Rows rendered by a table band in this placement. */
  rows?: unknown[];
  /** Rows visible to expressions such as SUM(group.amount). */
  scopeRows?: unknown[];
}

export interface ReportPageLayout {
  bands: PlacedBand[];
}

export interface PaginationOptions {
  data?: Record<string, unknown>;
}

export function contentHeight(document: ReportDocumentV1): number {
  return document.page.height - document.page.margins.top - document.page.margins.bottom;
}

function isRepeatedHeader(band: ReportBand): boolean {
  return band.kind === "pageHeader" && band.repeat !== false;
}

function isRepeatedFooter(band: ReportBand): boolean {
  return band.kind === "pageFooter" && band.repeat !== false;
}

function tableOf(band: ReportBand) {
  return band.elements.find((element) => element.type === "table");
}

function rowHeight(band: ReportBand): number {
  const value = Number(tableOf(band)?.props.rowHeight ?? 7);
  return Number.isFinite(value) && value > 1 ? value : 7;
}

function tableHeaderHeight(band: ReportBand): number {
  const table = tableOf(band);
  if (!table || table.props.headerRepeat === false) return 0;
  const value = Number(table.props.headerHeight ?? 6);
  return Number.isFinite(value) && value >= 0 ? value : 6;
}

function tableRows(
  _document: ReportDocumentV1,
  band: ReportBand,
  data: Record<string, unknown> | undefined,
): unknown[] {
  const path =
    typeof tableOf(band)?.bindings?.path === "string"
      ? (tableOf(band)!.bindings!.path as string)
      : "";
  if (!path && Array.isArray(tableOf(band)?.props.staticRows)) return tableOf(band)!.props.staticRows as unknown[];
  return datasetRows(data, path);
}

interface Segment {
  band: ReportBand;
  rows?: unknown[];
  scopeRows?: unknown[];
}

function groupKeyOf(band: ReportBand): string | null {
  if (band.kind !== "groupHeader" || typeof band.groupBy !== "string") return null;
  return band.groupBy.split(".").pop() ?? null;
}

function groupRows(rows: unknown[], key: string): Map<string, unknown[]> {
  const groups = new Map<string, unknown[]>();
  for (const row of rows) {
    const value = row && typeof row === "object" ? (row as Record<string, unknown>)[key] : "";
    const name = String(value ?? "");
    const bucket = groups.get(name);
    if (bucket) bucket.push(row);
    else groups.set(name, [row]);
  }
  return groups;
}

function buildSegments(
  document: ReportDocumentV1,
  flow: ReportBand[],
  data: Record<string, unknown> | undefined,
): Segment[] {
  const groupHeader = flow.find((band) => groupKeyOf(band));
  const groupFooter = flow.find(
    (band) => band.kind === "groupFooter" && typeof band.groupBy === "string",
  );
  const detail = flow.find((band) => tableOf(band) && band.kind === "detail");

  if (groupHeader && groupFooter && detail) {
    const key = groupKeyOf(groupHeader)!;
    const rows = tableRows(document, detail, data);
    const segments: Segment[] = [];
    for (const band of flow) {
      if (band === groupHeader) {
        for (const entries of groupRows(rows, key).values()) {
          segments.push({ band: groupHeader, scopeRows: entries });
          segments.push({ band: detail, rows: entries });
          segments.push({ band: groupFooter, scopeRows: entries });
        }
        continue;
      }
      if (band === detail || band === groupFooter) continue;
      segments.push({ band });
    }
    return segments;
  }

  return flow.map((band) => ({ band, rows: tableOf(band) ? tableRows(document, band, data) : undefined }));
}

/**
 * Deterministic pagination: repeated page headers/footers, grouped sections,
 * table rows split by row height, and page breaks only when content does not fit.
 */
export function paginateReport(
  document: ReportDocumentV1,
  options: PaginationOptions = {},
): ReportPageLayout[] {
  const capacity = contentHeight(document);
  const headers = document.bands.filter(isRepeatedHeader);
  const footers = document.bands.filter(isRepeatedFooter);
  const flow = document.bands.filter(
    (band) => !isRepeatedHeader(band) && !isRepeatedFooter(band),
  );
  const reserved =
    headers.reduce((sum, band) => sum + band.height, 0) +
    footers.reduce((sum, band) => sum + band.height, 0);
  const bodyCapacity = Math.max(1, capacity - reserved);
  const headerHeight = headers.reduce((sum, band) => sum + band.height, 0);
  const footerHeight = footers.reduce((sum, band) => sum + band.height, 0);

  const pages: ReportPageLayout[] = [];
  let current: PlacedBand[] = [];
  let y = 0;

  const flush = () => {
    let headerY = 0;
    let footerY = capacity - footerHeight;
    pages.push({
      bands: [
        ...headers.map((band) => { const placed = { band, y: headerY }; headerY += band.height; return placed; }),
        ...current.map((placed) => ({ ...placed, y: placed.y + headerHeight })),
        ...footers.map((band) => { const placed = { band, y: footerY }; footerY += band.height; return placed; }),
      ],
    });
    current = [];
    y = 0;
  };

  const placeFixed = (segment: Segment) => {
    if (y + segment.band.height > bodyCapacity && y > 0) flush();
    current.push({ band: segment.band, y, scopeRows: segment.scopeRows });
    y += segment.band.height;
  };

  for (const segment of buildSegments(document, flow, options.data)) {
    if (!segment.rows) {
      placeFixed(segment);
      continue;
    }
    const heightPerRow = rowHeight(segment.band);
    const headerHeight = tableHeaderHeight(segment.band);
    const rows = segment.rows;
    if (rows.length === 0) {
      placeFixed(segment);
      continue;
    }
    let offset = 0;
    while (offset < rows.length) {
      const available = bodyCapacity - y - headerHeight;
      const fit = Math.max(1, Math.floor(available / heightPerRow));
      const count = Math.min(fit, rows.length - offset);
      const height = headerHeight + count * heightPerRow;
      if (y + height > bodyCapacity && y > 0) {
        flush();
        continue;
      }
      current.push({
        band: segment.band,
        y,
        rows: rows.slice(offset, offset + count),
        scopeRows: segment.scopeRows,
      });
      y += height;
      offset += count;
      if (offset < rows.length) flush();
    }
  }

  if (current.length > 0 || pages.length === 0) flush();
  return pages;
}
