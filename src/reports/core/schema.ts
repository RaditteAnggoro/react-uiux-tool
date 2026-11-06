import {
  BAND_KEYS,
  BAND_KINDS,
  DEFAULT_LIMITS,
  DOCUMENT_KEYS,
  ELEMENT_KEYS,
  ELEMENT_TYPES,
  FORBIDDEN_KEYS,
  ID_PATTERN,
  PAGE_SIZES,
  RDM_KIND,
  RDM_SCHEMA_VERSION,
} from "./types.js";
import type {
  BandKind,
  ElementType,
  ReportBand,
  ReportDocumentV1,
  ReportElement,
  ReportIssue,
  ReportLimits,
  ReportParseResult,
  ReportValidationResult,
  ReportBox,
  ReportPage,
} from "./types.js";
import { createPage, printableArea } from "./geometry.js";

const DOCUMENT_KEY_SET = new Set(DOCUMENT_KEYS);
const BAND_KEY_SET = new Set(BAND_KEYS);
const ELEMENT_KEY_SET = new Set(ELEMENT_KEYS);
const BAND_KIND_SET = new Set<string>(BAND_KINDS);
const ELEMENT_TYPE_SET = new Set<string>(ELEMENT_TYPES);
const PAGE_SIZE_SET = new Set<string>(PAGE_SIZES);
const FORBIDDEN_KEY_SET = new Set(FORBIDDEN_KEYS);

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class Collector {
  readonly errors: ReportIssue[] = [];
  readonly warnings: ReportIssue[] = [];

  error(code: string, path: string, message: string): void {
    this.errors.push({ code, path, message, severity: "error" });
  }

  warn(code: string, path: string, message: string): void {
    this.warnings.push({ code, path, message, severity: "warning" });
  }

  result(): ReportValidationResult {
    return {
      ok: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    };
  }
}

interface ScanState {
  nodes: number;
  seen: WeakSet<object>;
}

function scanJson(
  value: unknown,
  path: string,
  depth: number,
  collector: Collector,
  limits: ReportLimits,
  state: ScanState,
): void {
  if (depth > limits.maxDepth) {
    collector.error(
      "DEPTH_LIMIT",
      path,
      `Document nesting exceeds ${limits.maxDepth} levels`,
    );
    return;
  }
  state.nodes += 1;
  if (state.nodes > limits.maxNodes) {
    collector.error(
      "NODE_LIMIT",
      path,
      `Document exceeds ${limits.maxNodes} nodes`,
    );
    return;
  }
  if (value === null) return;
  const kind = typeof value;
  if (kind === "string") {
    if ((value as string).length > limits.maxStringLength) {
      collector.error(
        "STRING_LIMIT",
        path,
        `String exceeds ${limits.maxStringLength} characters`,
      );
    }
    return;
  }
  if (kind === "number") {
    if (!Number.isFinite(value as number)) {
      collector.error("INVALID_NUMBER", path, "Number must be finite");
    }
    return;
  }
  if (kind === "boolean") return;
  if (kind !== "object") {
    collector.error(
      "NON_JSON_VALUE",
      path,
      `Unsupported value type: ${kind}`,
    );
    return;
  }
  if (state.seen.has(value as object)) {
    collector.error("CYCLIC_REFERENCE", path, "Document contains a cycle");
    return;
  }
  state.seen.add(value as object);
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      scanJson(entry, `${path}[${index}]`, depth + 1, collector, limits, state),
    );
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEY_SET.has(key)) {
      collector.error(
        "FORBIDDEN_KEY",
        `${path}.${key}`,
        `Key "${key}" is not allowed in a report document`,
      );
      continue;
    }
    scanJson(entry, `${path}.${key}`, depth + 1, collector, limits, state);
  }
}

function requireString(
  value: unknown,
  path: string,
  collector: Collector,
  options: { max?: number; pattern?: RegExp; patternMessage?: string } = {},
): string | null {
  if (typeof value !== "string" || value.length === 0) {
    collector.error("INVALID_STRING", path, "Expected a non-empty string");
    return null;
  }
  if (options.max && value.length > options.max) {
    collector.error(
      "INVALID_STRING",
      path,
      `String exceeds ${options.max} characters`,
    );
    return null;
  }
  if (options.pattern && !options.pattern.test(value)) {
    collector.error(
      "INVALID_STRING",
      path,
      options.patternMessage ?? "String has an invalid format",
    );
    return null;
  }
  return value;
}

function requireNumber(
  value: unknown,
  path: string,
  collector: Collector,
  options: { min?: number; max?: number } = {},
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    collector.error("INVALID_NUMBER", path, "Expected a finite number");
    return null;
  }
  if (options.min !== undefined && value < options.min) {
    collector.error("INVALID_RANGE", path, `Value must be >= ${options.min}`);
    return null;
  }
  if (options.max !== undefined && value > options.max) {
    collector.error("INVALID_RANGE", path, `Value must be <= ${options.max}`);
    return null;
  }
  return value;
}

function requireObject(
  value: unknown,
  path: string,
  collector: Collector,
): Record<string, unknown> | null {
  if (!isPlainObject(value)) {
    collector.error("INVALID_OBJECT", path, "Expected an object");
    return null;
  }
  return value;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  collector: Collector,
  code = "UNKNOWN_KEY",
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      collector.error(
        code,
        `${path}.${key}`,
        `Unknown key "${key}" is not part of schema version ${RDM_SCHEMA_VERSION}`,
      );
    }
  }
}

function validateBox(
  value: unknown,
  path: string,
  collector: Collector,
  page: ReportPage,
): ReportBox | null {
  const box = requireObject(value, path, collector);
  if (!box) return null;
  const keys = new Set(["x", "y", "width", "height"]);
  rejectUnknownKeys(box, keys, path, collector);
  const x = requireNumber(box.x, `${path}.x`, collector, { min: 0 });
  const y = requireNumber(box.y, `${path}.y`, collector, { min: 0 });
  const width = requireNumber(box.width, `${path}.width`, collector, {
    min: 0.001,
  });
  const height = requireNumber(box.height, `${path}.height`, collector, {
    min: 0.001,
  });
  if (x === null || y === null || width === null || height === null) return null;
  if (x + width > page.width + 0.001) {
    collector.warn(
      "PAGE_OVERFLOW",
      path,
      `Element extends beyond page width (${x + width} > ${page.width})`,
    );
  }
  return { x, y, width, height };
}

function validateElement(
  value: unknown,
  path: string,
  collector: Collector,
  page: ReportPage,
  limits: ReportLimits,
): ReportElement | null {
  const element = requireObject(value, path, collector);
  if (!element) return null;
  rejectUnknownKeys(element, ELEMENT_KEY_SET, path, collector);
  const id = requireString(element.id, `${path}.id`, collector, {
    max: 64,
    pattern: ID_PATTERN,
    patternMessage:
      "Element id must match [A-Za-z0-9][A-Za-z0-9_-]{0,63}",
  });
  const type = requireString(element.type, `${path}.type`, collector);
  if (type !== null && !ELEMENT_TYPE_SET.has(type)) {
    collector.error(
      "UNKNOWN_ELEMENT_TYPE",
      `${path}.type`,
      `Unsupported element type "${type}"`,
    );
  }
  const box = validateBox(element.box, `${path}.box`, collector, page);
  const props = requireObject(element.props, `${path}.props`, collector) ?? {};
  for (const key of Object.keys(props)) {
    const entry = props[key];
    if (entry === undefined) {
      collector.error(
        "NON_JSON_VALUE",
        `${path}.props.${key}`,
        "Undefined is not a valid property value",
      );
    }
  }
  if (typeof props.fontSize === "number" && props.fontSize < 6) {
    collector.warn(
      "SMALL_TEXT",
      `${path}.props.fontSize`,
      `Font size ${props.fontSize} is below a legible print minimum`,
    );
  }
  if (element.styleRef !== undefined) {
    requireString(element.styleRef, `${path}.styleRef`, collector, {
      max: 64,
    });
  }
  if (element.bindings !== undefined) {
    requireObject(element.bindings, `${path}.bindings`, collector);
  }
  if (element.groupId !== undefined) {
    requireString(element.groupId, `${path}.groupId`, collector, { max: 64, pattern: ID_PATTERN });
  }
  if (element.conditions !== undefined && !Array.isArray(element.conditions)) {
    collector.error(
      "INVALID_ARRAY",
      `${path}.conditions`,
      "Expected an array of conditions",
    );
  }
  if (id === null || box === null) return null;
  const validated: ReportElement = {
    id,
    type: (type as ElementType) ?? "text",
    box,
    props,
  };
  if (typeof (element as Record<string, unknown>).groupId === "string") {
    validated.groupId = (element as Record<string, unknown>).groupId as string;
  }
  return validated;
}

function validateBand(
  value: unknown,
  path: string,
  collector: Collector,
  page: ReportPage,
  limits: ReportLimits,
): ReportBand | null {
  const band = requireObject(value, path, collector);
  if (!band) return null;
  rejectUnknownKeys(band, BAND_KEY_SET, path, collector);
  const id = requireString(band.id, `${path}.id`, collector, {
    max: 64,
    pattern: ID_PATTERN,
    patternMessage: "Band id must match [A-Za-z0-9][A-Za-z0-9_-]{0,63}",
  });
  const kind = requireString(band.kind, `${path}.kind`, collector);
  if (kind !== null && !BAND_KIND_SET.has(kind)) {
    collector.error(
      "UNKNOWN_BAND_KIND",
      `${path}.kind`,
      `Unsupported band kind "${kind}"`,
    );
  }
  const height = requireNumber(band.height, `${path}.height`, collector, {
    min: 0.001,
    max: page.height,
  });
  if (band.repeat !== undefined && typeof band.repeat !== "boolean") {
    collector.error("INVALID_BOOLEAN", `${path}.repeat`, "Expected a boolean");
  }
  if (band.groupBy !== undefined) {
    requireString(band.groupBy, `${path}.groupBy`, collector, { max: 200 });
  }
  if (!Array.isArray(band.elements)) {
    collector.error(
      "INVALID_ARRAY",
      `${path}.elements`,
      "Expected an array of elements",
    );
    return null;
  }
  if (band.elements.length > limits.maxElementsPerBand) {
    collector.error(
      "ELEMENT_LIMIT",
      `${path}.elements`,
      `Band exceeds ${limits.maxElementsPerBand} elements`,
    );
  }
  const elements: ReportElement[] = [];
  band.elements.forEach((entry, index) => {
    const element = validateElement(
      entry,
      `${path}.elements[${index}]`,
      collector,
      page,
      limits,
    );
    if (element) elements.push(element);
  });
  if (id === null || height === null) return null;
  const result: ReportBand = {
    id,
    kind: kind as BandKind,
    height,
    elements,
  };
  if (band.repeat === true) result.repeat = true;
  if (typeof band.groupBy === "string") result.groupBy = band.groupBy;
  return result;
}

function validatePage(
  value: unknown,
  path: string,
  collector: Collector,
): ReportPage | null {
  const page = requireObject(value, path, collector);
  if (!page) return null;
  rejectUnknownKeys(
    page,
    new Set(["size", "width", "height", "orientation", "margins"]),
    path,
    collector,
  );
  const size = requireString(page.size, `${path}.size`, collector);
  if (size !== null && !PAGE_SIZE_SET.has(size)) {
    collector.error(
      "UNKNOWN_PAGE_SIZE",
      `${path}.size`,
      `Unsupported page size "${size}"`,
    );
  }
  const width = requireNumber(page.width, `${path}.width`, collector, {
    min: 10,
    max: 5000,
  });
  const height = requireNumber(page.height, `${path}.height`, collector, {
    min: 10,
    max: 5000,
  });
  const orientation = requireString(
    page.orientation,
    `${path}.orientation`,
    collector,
  );
  if (orientation !== null && orientation !== "portrait" && orientation !== "landscape") {
    collector.error(
      "INVALID_ORIENTATION",
      `${path}.orientation`,
      'Orientation must be "portrait" or "landscape"',
    );
  }
  const margins = requireObject(page.margins, `${path}.margins`, collector) ?? {};
  const marginValues = {
    top: requireNumber(margins.top, `${path}.margins.top`, collector, {
      min: 0,
      max: 500,
    }),
    right: requireNumber(margins.right, `${path}.margins.right`, collector, {
      min: 0,
      max: 500,
    }),
    bottom: requireNumber(margins.bottom, `${path}.margins.bottom`, collector, {
      min: 0,
      max: 500,
    }),
    left: requireNumber(margins.left, `${path}.margins.left`, collector, {
      min: 0,
      max: 500,
    }),
  };
  if (width === null || height === null) return null;
  const resolved = {
    top: marginValues.top ?? 0,
    right: marginValues.right ?? 0,
    bottom: marginValues.bottom ?? 0,
    left: marginValues.left ?? 0,
  };
  if (resolved.left + resolved.right >= width) {
    collector.error(
      "INVALID_MARGINS",
      `${path}.margins`,
      "Horizontal margins leave no printable width",
    );
  }
  if (resolved.top + resolved.bottom >= height) {
    collector.error(
      "INVALID_MARGINS",
      `${path}.margins`,
      "Vertical margins leave no printable height",
    );
  }
  return {
    size: size as ReportPage["size"],
    width,
    height,
    orientation: (orientation as ReportPage["orientation"]) ?? "portrait",
    margins: resolved,
  };
}

function validateDatasets(
  value: unknown,
  path: string,
  collector: Collector,
  limits: ReportLimits,
): ReportDocumentV1["datasets"] {
  const datasets: ReportDocumentV1["datasets"] = [];
  if (!Array.isArray(value)) {
    collector.error("INVALID_ARRAY", path, "Expected an array of datasets");
    return datasets;
  }
  if (value.length > limits.maxDatasets) {
    collector.error(
      "DATASET_LIMIT",
      path,
      `Exceeds ${limits.maxDatasets} datasets`,
    );
  }
  value.forEach((entry, index) => {
    const item = requireObject(entry, `${path}[${index}]`, collector);
    if (!item) return;
    rejectUnknownKeys(
      item,
      new Set(["id", "schema", "sampleDataRef"]),
      `${path}[${index}]`,
      collector,
    );
    const id = requireString(item.id, `${path}[${index}].id`, collector, {
      max: 64,
      pattern: ID_PATTERN,
      patternMessage: "Dataset id must match [A-Za-z0-9][A-Za-z0-9_-]{0,63}",
    });
    if (item.sampleDataRef !== undefined) {
      const ref = requireString(
        item.sampleDataRef,
        `${path}[${index}].sampleDataRef`,
        collector,
        { max: 512 },
      );
      if (ref && isUnsafeRelativePath(ref)) {
        collector.error(
          "UNSAFE_PATH",
          `${path}[${index}].sampleDataRef`,
          "Sample data reference must stay inside the report folder",
        );
      }
    }
    if (id) {
      const dataset: ReportDocumentV1["datasets"][number] = { id };
      if (item.schema !== undefined) dataset.schema = item.schema;
      if (typeof item.sampleDataRef === "string") {
        dataset.sampleDataRef = item.sampleDataRef;
      }
      datasets.push(dataset);
    }
  });
  return datasets;
}

export function isUnsafeRelativePath(value: string): boolean {
  if (value.length === 0) return true;
  if (value.startsWith("/") || value.startsWith("\\")) return true;
  if (/^[A-Za-z]:[\\/]/.test(value)) return true;
  if (value.includes("\\")) return true;
  if (value.split("/").some((segment) => segment === "..")) return true;
  return false;
}

function validateParameters(
  value: unknown,
  path: string,
  collector: Collector,
  limits: ReportLimits,
): ReportDocumentV1["parameters"] {
  const parameters: ReportDocumentV1["parameters"] = [];
  if (!Array.isArray(value)) {
    collector.error("INVALID_ARRAY", path, "Expected an array of parameters");
    return parameters;
  }
  if (value.length > limits.maxParameters) {
    collector.error(
      "PARAMETER_LIMIT",
      path,
      `Exceeds ${limits.maxParameters} parameters`,
    );
  }
  const types = new Set(["string", "number", "boolean", "date"]);
  value.forEach((entry, index) => {
    const item = requireObject(entry, `${path}[${index}]`, collector);
    if (!item) return;
    rejectUnknownKeys(
      item,
      new Set(["id", "type", "required", "defaultValue"]),
      `${path}[${index}]`,
      collector,
    );
    const id = requireString(item.id, `${path}[${index}].id`, collector, {
      max: 64,
      pattern: ID_PATTERN,
    });
    const type = requireString(item.type, `${path}[${index}].type`, collector);
    if (type !== null && !types.has(type)) {
      collector.error(
        "UNKNOWN_PARAMETER_TYPE",
        `${path}[${index}].type`,
        `Unsupported parameter type "${type}"`,
      );
    }
    if (typeof item.required !== "boolean") {
      collector.error(
        "INVALID_BOOLEAN",
        `${path}[${index}].required`,
        "Expected a boolean",
      );
    }
    if (id) {
      const parameter: ReportDocumentV1["parameters"][number] = {
        id,
        type: (type as ReportDocumentV1["parameters"][number]["type"]) ?? "string",
        required: item.required === true,
      };
      if (item.defaultValue !== undefined) {
        parameter.defaultValue = item.defaultValue;
      }
      parameters.push(parameter);
    }
  });
  return parameters;
}

export function validateReportDocument(
  input: unknown,
  limits: ReportLimits = DEFAULT_LIMITS,
): ReportValidationResult {
  const collector = new Collector();
  if (!isPlainObject(input)) {
    collector.error("INVALID_DOCUMENT", "$", "Report document must be an object");
    return collector.result();
  }
  scanJson(input, "$", 0, collector, limits, {
    nodes: 0,
    seen: new WeakSet(),
  });
  rejectUnknownKeys(input, DOCUMENT_KEY_SET, "$", collector);
  if (input.kind !== RDM_KIND) {
    collector.error(
      "INVALID_KIND",
      "$.kind",
      `Expected "${RDM_KIND}"`,
    );
  }
  if (input.schemaVersion !== RDM_SCHEMA_VERSION) {
    collector.error(
      "UNSUPPORTED_VERSION",
      "$.schemaVersion",
      `Only schemaVersion ${RDM_SCHEMA_VERSION} is supported`,
    );
  }
  const id = requireString(input.id, "$.id", collector, {
    max: 64,
    pattern: ID_PATTERN,
  });
  requireString(input.title, "$.title", collector, { max: 200 });
  const locale = requireString(input.locale, "$.locale", collector, {
    max: 35,
  });
  if (locale && !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale)) {
    collector.warn(
      "UNUSUAL_LOCALE",
      "$.locale",
      `Locale "${locale}" is not a typical BCP-47 tag`,
    );
  }
  if (input.units !== "mm" && input.units !== "pt") {
    collector.error("INVALID_UNITS", "$.units", 'Units must be "mm" or "pt"');
  }
  const page = validatePage(input.page, "$.page", collector);
  requireObject(input.styleTokens, "$.styleTokens", collector);
  requireObject(input.exportProfiles, "$.exportProfiles", collector);
  const datasets = validateDatasets(input.datasets, "$.datasets", collector, limits);
  const parameters = validateParameters(
    input.parameters,
    "$.parameters",
    collector,
    limits,
  );

  const bands: ReportBand[] = [];
  if (!Array.isArray(input.bands)) {
    collector.error("INVALID_ARRAY", "$.bands", "Expected an array of bands");
  } else {
    if (input.bands.length === 0) {
      collector.error("EMPTY_BANDS", "$.bands", "A report needs at least one band");
    }
    if (input.bands.length > limits.maxBands) {
      collector.error("BAND_LIMIT", "$.bands", `Exceeds ${limits.maxBands} bands`);
    }
    if (page) {
      input.bands.forEach((entry, index) => {
        const band = validateBand(
          entry,
          `$.bands[${index}]`,
          collector,
          page,
          limits,
        );
        if (band) bands.push(band);
      });
    }
  }

  const ids = new Map<string, string>();
  const registerId = (value: string, path: string) => {
    const existing = ids.get(value);
    if (existing) {
      collector.error(
        "DUPLICATE_ID",
        path,
        `Id "${value}" is already used at ${existing}`,
      );
      return;
    }
    ids.set(value, path);
  };
  if (id) registerId(id, "$.id");
  datasets.forEach((dataset, index) => registerId(dataset.id, `$.datasets[${index}].id`));
  parameters.forEach((parameter, index) =>
    registerId(parameter.id, `$.parameters[${index}].id`),
  );
  bands.forEach((band, bandIndex) => {
    registerId(band.id, `$.bands[${bandIndex}].id`);
    band.elements.forEach((element, elementIndex) =>
      registerId(element.id, `$.bands[${bandIndex}].elements[${elementIndex}].id`),
    );
  });

  if (page) {
    const area = printableArea(page);
    const totalHeight = bands.reduce((sum, band) => sum + band.height, 0);
    if (totalHeight > area.height + 0.001) {
      collector.warn(
        "CONTENT_OVERFLOW",
        "$.bands",
        `Band heights (${totalHeight}) exceed printable height (${area.height})`,
      );
    }
    const styleRefs =
      input.styleTokens && isPlainObject(input.styleTokens)
        ? new Set(Object.keys(input.styleTokens))
        : new Set<string>();
    bands.forEach((band, bandIndex) => {
      band.elements.forEach((element, elementIndex) => {
        if (element.styleRef && !styleRefs.has(element.styleRef)) {
          collector.warn(
            "STYLE_REF_MISSING",
            `$.bands[${bandIndex}].elements[${elementIndex}].styleRef`,
            `styleRef "${element.styleRef}" is not defined in styleTokens`,
          );
        }
      });
    });
  }

  return collector.result();
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = canonical(value[key]);
    }
    return result;
  }
  return value;
}

/** Deterministic serialization: fixed key order, sorted nested keys, 2-space indent. */
export function serializeReport(document: ReportDocumentV1): string {
  const ordered: Record<string, unknown> = {};
  for (const key of DOCUMENT_KEYS) {
    const value = (document as unknown as Record<string, unknown>)[key];
    if (value === undefined) continue;
    ordered[key] = canonical(value);
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

const encoder = new TextEncoder();

export function parseReport(
  text: string,
  limits: ReportLimits = DEFAULT_LIMITS,
): ReportParseResult {
  if (typeof text !== "string") {
    return {
      ok: false,
      document: null,
      errors: [
        {
          code: "INVALID_INPUT",
          path: "$",
          message: "Report text must be a string",
          severity: "error",
        },
      ],
      warnings: [],
    };
  }
  const bytes = encoder.encode(text).length;
  if (bytes > limits.maxBytes) {
    return {
      ok: false,
      document: null,
      errors: [
        {
          code: "FILE_TOO_LARGE",
          path: "$",
          message: `Report exceeds ${limits.maxBytes} bytes`,
          severity: "error",
        },
      ],
      warnings: [],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      document: null,
      errors: [
        {
          code: "PARSE_ERROR",
          path: "$",
          message: error instanceof Error ? error.message : "Invalid JSON",
          severity: "error",
        },
      ],
      warnings: [],
    };
  }
  const validation = validateReportDocument(parsed, limits);
  return {
    ...validation,
    document: validation.ok ? (parsed as ReportDocumentV1) : null,
  };
}

export interface DefaultDocumentOptions {
  id?: string;
  title?: string;
  locale?: string;
  units?: "mm" | "pt";
  bands?: ReportBand[];
  styleTokens?: Record<string, unknown>;
}

/** Create a minimal valid document; templates build on top of this. */
export function createDefaultDocument(
  options: DefaultDocumentOptions = {},
): ReportDocumentV1 {
  const document: ReportDocumentV1 = {
    kind: RDM_KIND,
    schemaVersion: RDM_SCHEMA_VERSION,
    id: options.id ?? "report-draft",
    title: options.title ?? "Untitled report",
    locale: options.locale ?? "id-ID",
    units: options.units ?? "mm",
    page: createPage({ size: "A4", orientation: "portrait", units: options.units }),
    styleTokens: options.styleTokens ?? {},
    datasets: [],
    parameters: [],
    bands: options.bands ?? [
      {
        id: "band-body",
        kind: "detail",
        height: 40,
        elements: [],
      },
    ],
    exportProfiles: {},
  };
  return document;
}
