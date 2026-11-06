import type {
  PageOrientation,
  PageSizeName,
  ReportMargins,
  ReportPage,
  ReportUnits,
} from "./types.js";

export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;
export const PX_PER_INCH = 96;

export function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * PT_PER_INCH;
}

export function ptToMm(pt: number): number {
  return (pt / PT_PER_INCH) * MM_PER_INCH;
}

export function mmToPx(mm: number): number {
  return (mm / MM_PER_INCH) * PX_PER_INCH;
}

export function pxToMm(px: number): number {
  return (px / PX_PER_INCH) * MM_PER_INCH;
}

export function toMillimetres(value: number, units: ReportUnits): number {
  return units === "mm" ? value : ptToMm(value);
}

export function fromMillimetres(value: number, units: ReportUnits): number {
  return units === "mm" ? value : mmToPt(value);
}

/** Portrait dimensions in millimetres. */
export const PAGE_PRESETS_MM: Record<Exclude<PageSizeName, "custom">, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};

export const DEFAULT_MARGINS_MM: ReportMargins = {
  top: 18,
  right: 16,
  bottom: 18,
  left: 16,
};

export interface ResolvedPageSize {
  width: number;
  height: number;
}

/** Resolve a page preset and orientation into physical dimensions in millimetres. */
export function resolvePageSizeMm(
  size: PageSizeName,
  orientation: PageOrientation,
  custom?: ResolvedPageSize,
): ResolvedPageSize {
  const preset =
    size === "custom"
      ? custom ?? PAGE_PRESETS_MM.A4
      : PAGE_PRESETS_MM[size];
  return orientation === "landscape"
    ? { width: preset.height, height: preset.width }
    : { width: preset.width, height: preset.height };
}

export interface CreatePageOptions {
  size?: PageSizeName;
  orientation?: PageOrientation;
  units?: ReportUnits;
  margins?: Partial<ReportMargins>;
  custom?: ResolvedPageSize;
}

/** Build a validated-shape page in the requested display units. */
export function createPage(options: CreatePageOptions = {}): ReportPage {
  const units = options.units ?? "mm";
  const size = options.size ?? "A4";
  const orientation = options.orientation ?? "portrait";
  const mm = resolvePageSizeMm(size, orientation, options.custom);
  const marginsMm = { ...DEFAULT_MARGINS_MM, ...options.margins };
  return {
    size,
    width: round(fromMillimetres(mm.width, units)),
    height: round(fromMillimetres(mm.height, units)),
    orientation,
    margins: {
      top: round(fromMillimetres(marginsMm.top, units)),
      right: round(fromMillimetres(marginsMm.right, units)),
      bottom: round(fromMillimetres(marginsMm.bottom, units)),
      left: round(fromMillimetres(marginsMm.left, units)),
    },
  };
}

/** Printable area in the document's own units. */
export function printableArea(
  page: ReportPage,
): { width: number; height: number } {
  return {
    width: page.width - page.margins.left - page.margins.right,
    height: page.height - page.margins.top - page.margins.bottom,
  };
}

export function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
