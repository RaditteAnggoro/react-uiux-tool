import { tableCellText, tableHeaderTextColor } from "../core/table.js";
import type { ReportBand, ReportDocumentV1, ReportElement } from "../core/types.js";
import { evaluateExpression } from "../core/expressions.js";
import { toDecimalString } from "../core/decimal.js";
import { datasetRows, resolvePath } from "../core/data.js";
import { paginateReport, type PlacedBand } from "../core/pagination.js";
import { renderChartSvg, type ChartSeries } from "./chart.js";
import { parseDecimal, add } from "../core/decimal.js";

export interface RenderOptions {
  /** Synthetic rows keyed by dataset id, used instead of live data. */
  data?: Record<string, unknown>;
  page?: number;
  totalPages?: number;
}

const SAFE_IMAGE = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value: unknown, locale: string): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function fieldValue(
  document: ReportDocumentV1,
  props: Record<string, unknown>,
  binding: string,
  options: RenderOptions,
  page: number,
  totalPages: number,
): string {
  if (typeof props.expression === "string" && props.expression.trim()) {
    const result = evaluateExpression(props.expression, {
      datasets: options.data,
      locale: document.locale,
      page,
      totalPages,
    });
    if (!result.ok) return escapeHtml(`#${result.error}`);
    const value = result.value;
    if (value === null) return escapeHtml(props.emptyText ?? "—");
    if (typeof value === "boolean" || typeof value === "string") return escapeHtml(value);
    return escapeHtml(toDecimalString(value));
  }
  if (!binding || !options.data) return escapeHtml(props.emptyText ?? "—");
  const [dataset, ...rest] = binding.split(".");
  if (!rest.length) return escapeHtml(props.emptyText ?? "—");
  const root = options.data[dataset ?? ""];
  const raw = Array.isArray(root)
    ? resolvePath(root[0], rest.join("."))
    : resolvePath(root, rest.join("."));
  if (raw === undefined || raw === null || raw === "") return escapeHtml(props.emptyText ?? "—");
  const format = String(props.format ?? "");
  if (format === "currency" || format === "decimal") {
    return escapeHtml(tableCellText(raw, { format, decimals: props.decimals }, document.locale));
  }
  if (format === "date") return escapeHtml(formatDate(raw, document.locale));
  return escapeHtml(raw);
}

function styleFor(document: ReportDocumentV1, props: Record<string, unknown>): string {
  const tokens = document.styleTokens as {
    colors?: Record<string, string>;
    fonts?: Record<string, string>;
  };
  const declarations: string[] = [];
  const fontSize = Number(props.fontSize ?? 9);
  declarations.push(`font-size:${Number.isFinite(fontSize) ? fontSize : 9}pt`);
  const rawFont = typeof props.font === "string" ? props.font : tokens.fonts?.body;
  const font = sanitizeFont(rawFont);
  if (font) declarations.push(`font-family:${font}`);
  if (props.fontWeight) declarations.push(`font-weight:${Number(props.fontWeight) || 400}`);
  const color =
    typeof props.color === "string" && /^#[0-9A-Fa-f]{3,8}$/.test(props.color)
      ? props.color
      : tokens.colors?.text;
  if (color) declarations.push(`color:${color}`);
  if (props.align === "right" || props.align === "center" || props.align === "left" || props.align === "justify") {
    declarations.push(`text-align:${props.align}`);
  }
  if (props.italic === true) declarations.push("font-style:italic");
  const decorations: string[] = [];
  if (props.underline === true) decorations.push("underline");
  if (props.strike === true) decorations.push("line-through");
  if (decorations.length) declarations.push(`text-decoration:${decorations.join(" ")}`);
  if (typeof props.letterSpacing === "number") {
    declarations.push(`letter-spacing:${props.letterSpacing}pt`);
  }
  if (typeof props.lineHeight === "number") declarations.push(`line-height:${props.lineHeight}`);
  if (typeof props.background === "string" && /^#[0-9A-Fa-f]{3,8}$/.test(props.background)) {
    declarations.push(`background:${props.background}`);
  }
  return declarations.join(";");
}

/** Fonts may only contain a conservative family-name alphabet. */
export function sanitizeFont(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[^A-Za-z0-9 \-,._]/g, "").trim().slice(0, 160);
}

function boxStyle(element: ReportElement, extra = ""): string {
  const { x, y, width, height } = element.box;
  const extras: string[] = ["box-sizing:border-box"];
  const borderWidth = Number(element.props.borderWidth ?? 0);
  if (borderWidth > 0) {
    const color =
      typeof element.props.borderColor === "string" && /^#[0-9A-Fa-f]{3,8}$/.test(element.props.borderColor)
        ? element.props.borderColor
        : "#CBD5E1";
    extras.push(`border:${borderWidth}mm solid ${color}`);
  }
  if (typeof element.props.rotation === "number" && element.props.rotation !== 0) {
    extras.push(`transform:rotate(${element.props.rotation}deg)`);
  }
  if (element.props.wrap === false) extras.push("white-space:nowrap");
  return `position:absolute;left:${x}mm;top:${y}mm;width:${width}mm;height:${height}mm;overflow:hidden;${extras.join(";")}${extra ? `;${extra}` : ""}`;
}

interface ConditionResult {
  hidden: boolean;
  css: string;
}

function evaluateConditions(element: ReportElement, options: RenderOptions): ConditionResult {
  const rules = Array.isArray(element.conditions) ? element.conditions : [];
  const css: string[] = [];
  let hidden = false;
  for (const rule of rules) {
    if (!rule || typeof rule !== "object") continue;
    const record = rule as Record<string, unknown>;
    if (typeof record.when !== "string") continue;
    const result = evaluateExpression(record.when, { datasets: options.data });
    if (!result.ok || !result.value) continue;
    if (typeof result.value === "object" && result.value.units === 0n) continue;
    if (record.hide === true) hidden = true;
    if (typeof record.color === "string" && /^#[0-9A-Fa-f]{3,8}$/.test(record.color)) {
      css.push(`color:${record.color}`);
    }
    if (typeof record.background === "string" && /^#[0-9A-Fa-f]{3,8}$/.test(record.background)) {
      css.push(`background:${record.background}`);
    }
  }
  return { hidden, css: css.join(";") };
}


interface CrosstabCell {
  row: string;
  column: string;
  value: string;
}

function renderCrosstab(
  document: ReportDocumentV1,
  element: ReportElement,
  data: Record<string, unknown> | undefined,
  style: string,
): string {
  const binding = typeof element.bindings?.path === "string" ? element.bindings.path : "";
  const rows = datasetRows(data, binding) as Array<Record<string, unknown>>;
  const rowKey = String(element.props.rowKey ?? "row");
  const columnKey = String(element.props.columnKey ?? "column");
  const valueKey = String(element.props.valueKey ?? "value");
  const aggregate = element.props.aggregate === "count" ? "count" : "sum";
  const rowNames: string[] = [];
  const columnNames: string[] = [];
  const cells = new Map<string, CrosstabCell>();
  for (const row of rows) {
    const rowName = String(row?.[rowKey] ?? "");
    const columnName = String(row?.[columnKey] ?? "");
    if (!rowNames.includes(rowName)) rowNames.push(rowName);
    if (!columnNames.includes(columnName)) columnNames.push(columnName);
    const key = `${rowName}\u0000${columnName}`;
    const cell = cells.get(key) ?? { row: rowName, column: columnName, value: "0" };
    const raw = Number(row?.[valueKey] ?? 0) || 0;
    cell.value =
      aggregate === "count"
        ? String(Number(cell.value) + 100)
        : add(parseDecimal(cell.value, 2), parseDecimal(String(raw), 2)).units.toString();
    cells.set(key, cell);
  }
  const asNumber = (value: string) => Number(value) / 100;
  const columnTotals = new Map<string, number>();
  const rowTotals = new Map<string, number>();
  let grand = 0;
  const format = (value: number) =>
    new Intl.NumberFormat(document.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const header = `<tr><th>${escapeHtml(element.props.rowLabel ?? rowKey)}</th>${columnNames
    .map((name) => `<th style="text-align:right">${escapeHtml(name)}</th>`)
    .join("")}<th style="text-align:right">Total</th></tr>`;
  const body = rowNames
    .map((rowName) => {
      let rowTotal = 0;
      const cellsHtml = columnNames
        .map((columnName) => {
          const cell = cells.get(`${rowName}\u0000${columnName}`);
          const value = cell ? asNumber(cell.value) : 0;
          rowTotal += value;
          columnTotals.set(columnName, (columnTotals.get(columnName) ?? 0) + value);
          return `<td style="text-align:right">${escapeHtml(format(value))}</td>`;
        })
        .join("");
      rowTotals.set(rowName, rowTotal);
      grand += rowTotal;
      return `<tr><th style="text-align:left">${escapeHtml(rowName)}</th>${cellsHtml}<td style="text-align:right"><strong>${escapeHtml(format(rowTotal))}</strong></td></tr>`;
    })
    .join("");
  const footer = `<tr><th style="text-align:left">Total</th>${columnNames
    .map((name) => `<th style="text-align:right">${escapeHtml(format(columnTotals.get(name) ?? 0))}</th>`)
    .join("")}<th style="text-align:right">${escapeHtml(format(grand))}</th></tr>`;
  return `<div class="el el-crosstab" data-id="${escapeHtml(element.id)}" style="${boxStyle(element, style)}"><table><thead>${header}</thead><tbody>${body}</tbody><tfoot>${footer}</tfoot></table></div>`;
}

function renderElement(
  document: ReportDocumentV1,
  element: ReportElement,
  options: RenderOptions,
  rowScope: Record<string, unknown> | undefined,
  page: number,
  totalPages: number,
): string {
  const condition = evaluateConditions(element, options);
  if (condition.hidden) return "";
  const props = element.props;
  const binding = typeof element.bindings?.path === "string" ? element.bindings.path : "";
  const conditionCss = condition.css ? `;${condition.css}` : "";
  const style = `${styleFor(document, props)}${conditionCss}`;
  const scopedOptions: RenderOptions = rowScope
    ? { ...options, data: { ...(options.data ?? {}), row: rowScope } }
    : options;

  switch (element.type) {
    case "text": {
      const rawText = String(props.text ?? "");
      const list = props.list === "bullet" || props.list === "number" ? props.list : null;
      const content = list
        ? rawText
            .split("\n")
            .map((line, index) => `${list === "bullet" ? "•" : `${index + 1}.`} ${line}`)
            .join("\n")
        : rawText;
      return `<div class="el el-text" data-id="${escapeHtml(element.id)}" style="${boxStyle(element, style)};white-space:${props.wrap === false ? "pre" : "pre-wrap"}">${escapeHtml(content)}</div>`;
    }
    case "field": {
      const label = typeof props.label === "string" && props.label
        ? `<span class="el-label">${escapeHtml(props.label)}</span>`
        : "";
      const value = fieldValue(document, props, binding, scopedOptions, page, totalPages);
      return `<div class="el el-field" data-id="${escapeHtml(element.id)}" style="${boxStyle(element, style)}"><span class="el-value">${value}</span>${label}</div>`;
    }
    case "image": {
      const src = typeof props.src === "string" ? props.src : "";
      const alt = escapeHtml(props.alt ?? "");
      const fit = props.fit === "cover" ? "cover" : "contain";
      if (src && SAFE_IMAGE.test(src)) {
        return `<div class="el el-image" data-id="${escapeHtml(element.id)}" style="${boxStyle(element, style)}"><img alt="${alt}" src="${src}" style="width:100%;height:100%;object-fit:${fit}" /></div>`;
      }
      return `<div class="el el-image el-image-empty" data-id="${escapeHtml(element.id)}" style="${boxStyle(element)}" role="img" aria-label="${alt}"></div>`;
    }
    case "table":
      return "";
    case "chart": {
      const chartType = props.chartType === "line" ? "line" : props.chartType === "pie" ? "pie" : "bar";
      const rows = binding ? datasetRows(options.data, binding) : [];
      const categoryKey = String(props.categoryKey ?? "label");
      const valueKey = String(props.valueKey ?? "value");
      const labels = rows.length
        ? rows.map((row) => String((row as Record<string, unknown>)?.[categoryKey] ?? ""))
        : Array.isArray(props.labels)
          ? (props.labels as unknown[]).map(String)
          : [];
      const series: ChartSeries[] = Array.isArray(props.series)
        ? (props.series as ChartSeries[])
        : [
            {
              label: String(props.seriesLabel ?? "Value"),
              values: rows.length
                ? rows.map((row) => Number((row as Record<string, unknown>)?.[valueKey]) || 0)
                : Array.isArray(props.values)
                  ? (props.values as unknown[]).map((value) => Number(value) || 0)
                  : [],
            },
          ];
      const svg = renderChartSvg({
        type: chartType,
        labels,
        series,
        width: Math.max(20, element.box.width),
        height: Math.max(15, element.box.height),
        title: typeof props.title === "string" ? props.title : undefined,
      });
      return `<div class="el el-chart" data-id="${escapeHtml(element.id)}" style="${boxStyle(element)}">${svg}</div>`;
    }
    case "crosstab": {
      return renderCrosstab(document, element, options.data, style);
    }
    case "line":
    case "rect": {
      const color = typeof props.color === "string" && /^#[0-9A-Fa-f]{3,8}$/.test(props.color) ? props.color : "#CBD5E1";
      const fill = element.type === "line"
        ? `background:${color}`
        : `border:${Number(props.strokeWidth) || 0.4}mm solid ${color};background:${typeof props.background === "string" ? props.background : "transparent"}`;
      return `<div class="el el-${element.type}" data-id="${escapeHtml(element.id)}" style="${boxStyle(element, fill)}"></div>`;
    }
    case "pageNumber": {
      const template = String(props.format ?? "Page {page} of {total}");
      const text = template
        .replace("{page}", String(page))
        .replace("{total}", String(totalPages));
      return `<div class="el el-page-number" data-id="${escapeHtml(element.id)}" style="${boxStyle(element, style)}">${escapeHtml(text)}</div>`;
    }
    case "spacer":
    default:
      return `<div class="el el-spacer" data-id="${escapeHtml(element.id)}" style="${boxStyle(element)}"></div>`;
  }
}

function renderTable(
  document: ReportDocumentV1,
  element: ReportElement,
  columns: Array<Record<string, unknown>>,
  rows: unknown[],
  style: string,
  _page: number,
  _totalPages: number,
): string {
  const props = element.props;
  const safeColor = (value: unknown, fallback: string) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  const headerColor = safeColor(props.tableHeaderColor, "#f1f4f8");
  const borderColor = safeColor(props.tableBorderColor, "#bfc9d6");
  const borderWidth = Math.max(0, Math.min(3, Number.isFinite(Number(props.tableBorderWidth)) ? Number(props.tableBorderWidth) : 0.2));
  const header = columns
    .map((column) => {
      const align = column.align === "right" ? "right" : column.align === "center" ? "center" : "left";
      return `<th style="width:${Number(column.width) || 0}mm;text-align:${align};background:${headerColor};color:${tableHeaderTextColor(headerColor)};border:${borderWidth}mm solid ${borderColor}">${escapeHtml(column.label ?? column.key ?? "")}</th>`;
    })
    .join("");
  const body = rows.length
    ? rows
        .map((row) => {
          const cells = columns
            .map((column) => {
              const key = String(column.key ?? "");
              const align = column.align === "right" ? "right" : column.align === "center" ? "center" : "left";
              const raw = row && typeof row === "object" ? (row as Record<string, unknown>)[key] : undefined;
              const cell = escapeHtml(raw === undefined || raw === null || raw === "" ? (props.emptyText ?? "—") : tableCellText(raw, column, document.locale));
              return `<td style="text-align:${align};border:${borderWidth}mm solid ${borderColor}">${cell}</td>`;
            })
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("")
    : `<tr><td class="el-empty" colspan="${Math.max(columns.length, 1)}">${escapeHtml(props.emptyText ?? "")}</td></tr>`;
  return `<div class="el el-table" data-id="${escapeHtml(element.id)}" style="${boxStyle(element, style)}"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderBand(
  document: ReportDocumentV1,
  placed: PlacedBand,
  options: RenderOptions,
  page: number,
  totalPages: number,
): string {
  const { band } = placed;
  const bandOptions: RenderOptions = placed.scopeRows
    ? { ...options, data: { ...(options.data ?? {}), group: placed.scopeRows } }
    : options;
  const elements = band.elements
    .map((element) => {
      if (element.type === "table") {
        const columns = Array.isArray(element.props.columns)
          ? (element.props.columns as Array<Record<string, unknown>>)
          : [];
        const rows = placed.rows ?? [];
        return renderTable(document, element, columns, rows, styleFor(document, element.props), page, totalPages);
      }
      return renderElement(document, element, bandOptions, undefined, page, totalPages);
    })
    .join("");
  return `<section class="band band-${escapeHtml(band.kind)}" data-band="${escapeHtml(band.id)}" style="position:relative;height:${band.height}mm;margin-top:${placed.y === 0 ? 0 : 0}mm">${elements}</section>`;
}

/** Multi-page, deterministic print HTML. One authoritative layout for preview/print. */
export function renderReportHtml(
  document: ReportDocumentV1,
  options: RenderOptions = {},
): string {
  const pages = paginateReport(document, { data: options.data });
  const totalPages = pages.length;
  const tokens = document.styleTokens as { colors?: Record<string, string> };
  const background = tokens.colors?.page ?? "#FFFFFF";
  const { page } = document;

  const pageHtml = pages
    .map((layout, index) => {
      const number = index + 1;
      const bands = layout.bands
        .map((placed) => renderBand(document, placed, options, number, totalPages))
        .join("\n");
      return `<page class="report-page" data-page="${number}" data-report="${escapeHtml(document.id)}">
${bands}
</page>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="${escapeHtml(document.locale)}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(document.title)}</title>
<style>
@page { size: ${page.width}mm ${page.height}mm; margin: 0; }
html, body { margin: 0; padding: 0; background: #EDEFF2; }
.report-page { position: relative; box-sizing: border-box; width: ${page.width}mm; min-height: ${page.height}mm; background: ${background}; padding: ${page.margins.top}mm ${page.margins.right}mm ${page.margins.bottom}mm ${page.margins.left}mm; margin: 0 auto; page-break-after: always; }
.report-page:last-child { page-break-after: auto; }
.band { box-sizing: border-box; }
.el-table table { width: 100%; border-collapse: collapse; font-size: 8pt; }
.el-table th, .el-table td { padding: 1.2mm 1.5mm; border-bottom: 0.2mm solid #D6DCE5; }
.el-table th { background: #F1F4F8; font-weight: 600; }
.el-empty { color: #6B7280; text-align: center; }
.el-field { display: flex; flex-direction: column; justify-content: flex-start; }
.el-field .el-label { font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.02em; color: #6B7280; }
.el-image-empty { border: 0.3mm dashed #C3CBD6; }
@media print { html, body { background: #FFFFFF; } .report-page { margin: 0; } }
</style>
</head>
<body>
${pageHtml}
</body>
</html>
`;
}
