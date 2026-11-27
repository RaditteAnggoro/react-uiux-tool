/**
 * Read-only WaiReport (.yrf) inspection. No vendor code, no script execution,
 * no conversion into the native report model.
 */
import { yrfRichText, type YrfRichTextRun } from "./rich-text.js";
import { hasYrfLocalLayout, hasYrfScriptField, isYrfLocalField, yrfBarcodeKind, yrfObjectCapability } from "./capabilities.js";

export const YRF_MAX_BYTES = 5 * 1024 * 1024;
const MAX_OBJECTS = 5000;

export interface YrfObjectRef {
  path: string;
  kind: string;
  name: string;
  box: { x: number; y: number; width: number; height: number };
  caption: string | null;
  style: string | null;
  textField: "caption" | "text" | null;
  dataField: string | null;
  imageData: string | null;
  localPreviewText: string | null;
  localRichText: YrfRichTextRun[] | null;
  barcodeKind: ReturnType<typeof yrfBarcodeKind>;
  localFields: Record<string, string>;
  editableCaption: boolean;
  editableGeometry: boolean;
  lineEndpoints: { x1: number; y1: number; x2: number; y2: number } | null;
  hasScript: boolean;
  supported: boolean;
  capability: ReturnType<typeof yrfObjectCapability>;
}

export interface YrfBandRef {
  path: string;
  type: string;
  height: number;
  objects: YrfObjectRef[];
}

export interface YrfPageRef {
  path: string;
  index: number;
  bands: YrfBandRef[];
}

export interface YrfInspection {
  version: string | null;
  paper: { type: string | null; width: number; height: number };
  orientation: number;
  margins: { top: number; right: number; bottom: number; left: number };
  pages: YrfPageRef[];
  sideBands: YrfBandRef[];
  objectCount: number;
  warnings: string[];
  unknownKeys: string[];
  scriptFields: string[];
  sha256: string;
}

export function yrfPageLayout(inspection: YrfInspection, pageIndex: number) {
  const bands = [
    ...(pageIndex === 0 ? inspection.sideBands.filter(band => band.path === "layout.reportHeader") : []),
    ...(inspection.pages[pageIndex]?.bands ?? []),
    ...(pageIndex === Math.max(0, inspection.pages.length - 1) ? inspection.sideBands.filter(band => band.path === "layout.reportFooter") : []),
  ];
  let height = 0;
  const placements = bands.map(band => {
    const top = height;
    height += Math.max(0, band.height);
    return { band, top };
  });
  return { placements, overflow: inspection.paper.height > 0 && height > inspection.paper.height };
}

export interface YrfInspectResult {
  ok: boolean;
  inspection: YrfInspection | null;
  error?: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function inspectObject(
  value: unknown,
  path: string,
  unknownKinds: Set<string>,
): YrfObjectRef | null {
  const object = record(value);
  if (!object) return null;
  const kind = stringValue(object.type) ?? "unknown";
  const capability = yrfObjectCapability(kind);
  const hasScript = Object.keys(object).some(hasYrfScriptField);
  if (capability !== "visual") unknownKinds.add(kind);
  const textField = (kind === "label" || kind === "textbox") && typeof object.caption === "string"
    ? "caption" : kind === "textbox" && typeof object.text === "string" ? "text" : null;
  const caption = textField ? stringValue(object[textField]) : null;
  const hasEndpoints = kind === "line" && ["x1", "y1", "x2", "y2"].every((key) => typeof object[key] === "number" && Number.isFinite(object[key]));
  const lineEndpoints = hasEndpoints ? { x1: num(object.x1), y1: num(object.y1), x2: num(object.x2), y2: num(object.y2) } : null;
  return {
    path,
    kind,
    name: stringValue(object.name) ?? "",
    box: {
      x: lineEndpoints ? Math.min(lineEndpoints.x1, lineEndpoints.x2) : num(object.left),
      y: lineEndpoints ? Math.min(lineEndpoints.y1, lineEndpoints.y2) : num(object.top),
      width: lineEndpoints ? Math.abs(lineEndpoints.x2 - lineEndpoints.x1) : num(object.width),
      height: lineEndpoints ? Math.abs(lineEndpoints.y2 - lineEndpoints.y1) : num(object.height),
    },
    caption,
    style: stringValue(object.style),
    textField,
    dataField: kind === "textbox" ? stringValue(object.dataField) : null,
    imageData: kind === "image" && typeof object.data === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(object.data) ? object.data : null,
    localPreviewText: kind === "rtf" && isYrfLocalField(kind, "data", object.data) ? stringValue(object.data)
      : kind === "subReport" ? stringValue(object.reportName) : null,
    localRichText: kind === "rtf" && typeof object.data === "string" ? yrfRichText(object.data) : null,
    barcodeKind: yrfBarcodeKind(kind, object.formatType),
    localFields: Object.fromEntries(Object.entries(object).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string" && isYrfLocalField(kind, entry[0], entry[1], object.formatType))),
    editableCaption: textField !== null,
    editableGeometry: !hasScript && (capability === "visual"
      ? !!lineEndpoints || ["left", "top", "width", "height"].every((key) => typeof object[key] === "number" && Number.isFinite(object[key]))
      : hasYrfLocalLayout(kind) && ["left", "top", "width", "height"].every((key) => isYrfLocalField(kind, key, object[key]))),
    lineEndpoints,
    hasScript,
    supported: capability === "visual" && !hasScript,
    capability,
  };
}

function inspectBand(
  value: unknown,
  path: string,
  warnings: Set<string>,
  unknownKinds: Set<string>,
  counter: { count: number },
): YrfBandRef | null {
  const band = record(value);
  if (!band) return null;
  const objects: YrfObjectRef[] = [];
  const list = Array.isArray(band.objects) ? band.objects : [];
  list.forEach((entry, index) => {
    counter.count += 1;
    if (counter.count > MAX_OBJECTS) return;
    const object = inspectObject(entry, `${path}.objects[${index}]`, unknownKinds);
    if (object) objects.push(object);
  });
  if (counter.count > MAX_OBJECTS) warnings.add(`Object limit (${MAX_OBJECTS}) reached; tree truncated.`);
  return {
    path,
    type: stringValue(band.type) ?? "unknown",
    height: num(band.height),
    objects,
  };
}

function collectScriptFields(root: Record<string, unknown>): string[] {
  const found: string[] = [];
  const walk = (value: unknown, path: string, depth: number) => {
    if (depth > 12 || found.length > 40) return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`, depth + 1));
      return;
    }
    const object = record(value);
    if (!object) return;
    for (const [key, entry] of Object.entries(object)) {
      if (hasYrfScriptField(key)) {
        if (typeof entry === "string" && entry.trim() !== "") found.push(`${path}.${key}`);
        else if (record(entry)) {
          const nonEmpty = Object.values(entry as Record<string, unknown>).some(
            (nested) => typeof nested === "string" && nested.trim() !== "",
          );
          if (nonEmpty) found.push(`${path}.${key}`);
        }
      }
      walk(entry, `${path}.${key}`, depth + 1);
    }
  };
  walk(root, "$", 0);
  return found;
}

export function parseYrfDocument(text: string): { ok: boolean; value?: unknown; error?: string } {
  if (new TextEncoder().encode(text).length > YRF_MAX_BYTES) {
    return { ok: false, error: `File exceeds the ${YRF_MAX_BYTES} byte limit` };
  }
  if (text.includes("\u0000")) return { ok: false, error: "Binary content is not a .yrf JSON document" };
  try {
    return { ok: true, value: JSON.parse(text.replace(/^\uFEFF/, "")) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

export function inspectYrf(text: string, sha256 = ""): YrfInspectResult {
  const parsed = parseYrfDocument(text);
  if (!parsed.ok) return { ok: false, inspection: null, error: parsed.error };
  const root = record(parsed.value);
  const warnings = new Set<string>();
  if (!root) return { ok: false, inspection: null, error: "Root must be a JSON object" };
  if (!record(root.layout)) {
    return { ok: false, inspection: null, error: "Missing layout object; not a WaiReport form" };
  }

  const pageSetting = record(root.pageSetting) ?? {};
  const paper = record(pageSetting.paper) ?? {};
  const margin = record(pageSetting.margin) ?? {};
  const layout = record(root.layout) ?? {};
  const unknownKinds = new Set<string>();
  const counter = { count: 0 };

  const pages: YrfPageRef[] = [];
  const pageList = Array.isArray(layout.pages) ? layout.pages : [];
  pageList.forEach((page, index) => {
    const pageRecord = record(page) ?? {};
    const bands: YrfBandRef[] = [];
    const bandList = Array.isArray(pageRecord.bands) ? pageRecord.bands : [];
    bandList.forEach((band, bandIndex) => {
      const inspected = inspectBand(
        band,
        `layout.pages[${index}].bands[${bandIndex}]`,
        warnings,
        unknownKinds,
        counter,
      );
      if (inspected) bands.push(inspected);
    });
    pages.push({ path: `layout.pages[${index}]`, index, bands });
  });

  const sideBands: YrfBandRef[] = [];
  for (const side of ["reportHeader", "reportFooter"] as const) {
    const inspected = inspectBand(
      layout[side],
      `layout.${side}`,
      warnings,
      unknownKinds,
      counter,
    );
    if (inspected) sideBands.push(inspected);
  }

  const form = record(root.waiReportForm) ?? {};
  const scriptFields = collectScriptFields(root);
  if (scriptFields.length > 0) {
    warnings.add(
      `${scriptFields.length} script field(s) are present and are never executed by this tool.`,
    );
  }
  warnings.add(
    "Geometry units are unverified: identical A4 paper types use different numeric extents.",
  );
  warnings.add("Save updates the opened file after a hash check. Save copy keeps the original.");
  if (unknownKinds.size > 0) {
    warnings.add(`Format-specific objects use the local preview subset: ${[...unknownKinds].join(", ")}.`);
  }
  if ((stringValue(form.license) ?? "") === "") warnings.add("The vendor license field is empty.");

  return {
    ok: true,
    inspection: {
      version: stringValue(form.version),
      paper: {
        type: stringValue(paper.type),
        width: num(paper.width),
        height: num(paper.height),
      },
      orientation: num(pageSetting.orientation),
      margins: {
        top: num(margin.top),
        right: num(margin.right),
        bottom: num(margin.bottom),
        left: num(margin.left),
      },
      pages,
      sideBands,
      objectCount: counter.count,
      warnings: [...warnings],
      unknownKeys: [...unknownKinds],
      scriptFields,
      sha256,
    },
  };
}
