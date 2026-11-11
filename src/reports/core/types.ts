/** Report Document Model (RDM v1) — native, versioned report source. */
export const RDM_KIND = "react-uiux-report";
export const RDM_SCHEMA_VERSION = 1;

export type ReportUnits = "mm" | "pt";
export type PageSizeName = "A4" | "A5" | "Letter" | "Legal" | "custom";
export type PageOrientation = "portrait" | "landscape";

export type BandKind =
  | "reportTitle"
  | "pageHeader"
  | "groupHeader"
  | "detail"
  | "groupFooter"
  | "pageFooter"
  | "summary"
  | "noData";

export type ElementType =
  | "text"
  | "field"
  | "image"
  | "table"
  | "line"
  | "rect"
  | "spacer"
  | "pageNumber"
  | "chart"
  | "crosstab";

export interface ReportBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReportElement {
  id: string;
  type: ElementType;
  box: ReportBox;
  props: Record<string, unknown>;
  styleRef?: string;
  bindings?: Record<string, unknown>;
  conditions?: unknown[];
  /** Optional grouping id: elements sharing it select and move together. */
  groupId?: string;
}

export interface ReportBand {
  id: string;
  label?: string;
  kind: BandKind;
  height: number;
  repeat?: boolean;
  groupBy?: string;
  pageBreakBefore?: boolean;
  elements: ReportElement[];
}

export interface ReportMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ReportPage {
  size: PageSizeName;
  width: number;
  height: number;
  orientation: PageOrientation;
  margins: ReportMargins;
}

export interface ReportDataset {
  id: string;
  schema?: unknown;
  sampleDataRef?: string;
}

export interface ReportParameter {
  id: string;
  type: "string" | "number" | "boolean" | "date";
  required: boolean;
  defaultValue?: unknown;
}

export interface ReportProvenance {
  sourceFormat?: string;
  originalHash?: string;
  importedAt?: string;
  compatibility?: string;
  importWarnings?: string[];
}

export interface ReportDocumentV1 {
  kind: typeof RDM_KIND;
  schemaVersion: typeof RDM_SCHEMA_VERSION;
  id: string;
  title: string;
  locale: string;
  units: ReportUnits;
  page: ReportPage;
  styleTokens: Record<string, unknown>;
  datasets: ReportDataset[];
  parameters: ReportParameter[];
  bands: ReportBand[];
  exportProfiles: Record<string, unknown>;
  provenance?: ReportProvenance;
  extensions?: Record<string, unknown>;
}

export type ReportIssueSeverity = "error" | "warning";

export interface ReportIssue {
  code: string;
  path: string;
  message: string;
  severity: ReportIssueSeverity;
}

export interface ReportValidationResult {
  ok: boolean;
  errors: ReportIssue[];
  warnings: ReportIssue[];
}

export interface ReportParseResult extends ReportValidationResult {
  document: ReportDocumentV1 | null;
}

export interface ReportLimits {
  maxBytes: number;
  maxDepth: number;
  maxNodes: number;
  maxBands: number;
  maxElementsPerBand: number;
  maxDatasets: number;
  maxParameters: number;
  maxStringLength: number;
}

export const DEFAULT_LIMITS: ReportLimits = {
  maxBytes: 5 * 1024 * 1024,
  maxDepth: 32,
  maxNodes: 20000,
  maxBands: 200,
  maxElementsPerBand: 500,
  maxDatasets: 50,
  maxParameters: 50,
  maxStringLength: 20000,
};

export const BAND_KINDS: readonly BandKind[] = [
  "reportTitle",
  "pageHeader",
  "groupHeader",
  "detail",
  "groupFooter",
  "pageFooter",
  "summary",
  "noData",
];

export const ELEMENT_TYPES: readonly ElementType[] = [
  "text",
  "field",
  "image",
  "table",
  "line",
  "rect",
  "spacer",
  "pageNumber",
  "chart",
  "crosstab",
];

export const PAGE_SIZES: readonly PageSizeName[] = [
  "A4",
  "A5",
  "Letter",
  "Legal",
  "custom",
];

/** Keys that could pollute prototypes if a document were merged blindly. */
export const FORBIDDEN_KEYS: readonly string[] = [
  "__proto__",
  "constructor",
  "prototype",
];

export const DOCUMENT_KEYS: readonly string[] = [
  "kind",
  "schemaVersion",
  "id",
  "title",
  "locale",
  "units",
  "page",
  "styleTokens",
  "datasets",
  "parameters",
  "bands",
  "exportProfiles",
  "provenance",
  "extensions",
];

export const BAND_KEYS: readonly string[] = [
  "id",
  "label",
  "kind",
  "height",
  "repeat",
  "groupBy",
  "pageBreakBefore",
  "elements",
];

export const ELEMENT_KEYS: readonly string[] = [
  "id",
  "type",
  "box",
  "props",
  "styleRef",
  "bindings",
  "conditions",
  "groupId",
];

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
