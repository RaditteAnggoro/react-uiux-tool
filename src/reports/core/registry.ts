export type FeatureState =
  | "editable"
  | "experimental"
  | "readonly"
  | "export-only"
  | "unsupported"
  | "unknown";

export type Fidelity = "verified" | "partial" | "approximate" | "not-supported";

export type ReportOperation = "create" | "open" | "edit" | "export";

export type ReportPhase = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "deferred";

export interface FormatDescriptor {
  id: string;
  label: string;
  extensions: readonly string[];
  phase: ReportPhase;
  fidelity: Fidelity;
  operations: Record<ReportOperation, FeatureState>;
  notes: string;
}

const FORMATS: readonly FormatDescriptor[] = [
  {
    id: "native-json",
    label: "Report project (.report.json)",
    extensions: [".report.json"],
    phase: "P1",
    fidelity: "verified",
    operations: {
      create: "editable",
      open: "editable",
      edit: "editable",
      export: "unsupported",
    },
    notes:
      "Canonical, versioned, lossless editable source. Export is not applicable: the file is the source.",
  },
  {
    id: "yrf",
    label: "WaiReport form (.yrf)",
    extensions: [".yrf"],
    phase: "P2",
    fidelity: "approximate",
    operations: {
      create: "experimental",
      open: "experimental",
      edit: "experimental",
      export: "unsupported",
    },
    notes:
      "Create, inspect and edit supported objects in draft, then explicitly save to the opened file with a hash check. Vendor layout and runtime fidelity remain unverified.",
  },
  {
    id: "csv",
    label: "CSV data (.csv, .tsv)",
    extensions: [".csv", ".tsv"],
    phase: "P4",
    fidelity: "not-supported",
    operations: {
      create: "unsupported",
      open: "readonly",
      edit: "unsupported",
      export: "export-only",
    },
    notes:
      "Import as sample data or export table data. CSV and TSV carry rows and columns.",
  },
  {
    id: "xlsx",
    label: "Excel workbook (.xlsx)",
    extensions: [".xlsx"],
    phase: "P4",
    fidelity: "not-supported",
    operations: {
      create: "unsupported",
      open: "readonly",
      edit: "unsupported",
      export: "export-only",
    },
    notes:
      "Import one worksheet as sample data or export one worksheet per table.",
  },
  {
    id: "pdf",
    label: "PDF document (.pdf)",
    extensions: [".pdf"],
    phase: "P3",
    fidelity: "not-supported",
    operations: {
      create: "unsupported",
      open: "readonly",
      edit: "unsupported",
      export: "export-only",
    },
    notes:
      "Import up to six pages as images or export native report pages.",
  },
  {
    id: "html",
    label: "Print-ready HTML (.html)",
    extensions: [".html", ".htm"],
    phase: "P3",
    fidelity: "not-supported",
    operations: {
      create: "unsupported",
      open: "unsupported",
      edit: "unsupported",
      export: "export-only",
    },
    notes: "HTML export available (P3). Rendered output, not a source format.",
  },
  {
    id: "jrxml",
    label: "JasperReports template (.jrxml)",
    extensions: [".jrxml"],
    phase: "deferred",
    fidelity: "not-supported",
    operations: {
      create: "unsupported",
      open: "unsupported",
      edit: "unsupported",
      export: "unsupported",
    },
    notes:
      "Different report grammar with no verified mapping. Explicitly unsupported; inspecting it as JSON would be misleading, so it is not offered.",
  },
  {
    id: "rdl",
    label: "Report Definition Language (.rdl)",
    extensions: [".rdl"],
    phase: "deferred",
    fidelity: "not-supported",
    operations: {
      create: "unsupported",
      open: "unsupported",
      edit: "unsupported",
      export: "unsupported",
    },
    notes: "No adapter or preservation tests. Explicitly unsupported; never converted silently.",
  },
  {
    id: "rpt",
    label: "Proprietary report (.rpt, .repx, .frx)",
    extensions: [".rpt", ".repx", ".frx"],
    phase: "deferred",
    fidelity: "not-supported",
    operations: {
      create: "unsupported",
      open: "unsupported",
      edit: "unsupported",
      export: "unsupported",
    },
    notes: "Proprietary engine formats with no lawful mapping evidence. Unsupported.",
  },
  {
    id: "docx",
    label: "Word document (.docx)",
    extensions: [".docx"],
    phase: "P4",
    fidelity: "not-supported",
    operations: {
      create: "unsupported",
      open: "unsupported",
      edit: "unsupported",
      export: "export-only",
    },
    notes:
      "DOCX export available (P4 partial). Word layout may differ from PDF; no universal DOCX round trip.",
  },
];

const BY_ID = new Map(FORMATS.map((format) => [format.id, format]));

export function listFormats(): readonly FormatDescriptor[] {
  return FORMATS;
}

export function getFormat(id: string): FormatDescriptor | null {
  return BY_ID.get(id) ?? null;
}

export function capabilityOf(
  id: string,
  operation: ReportOperation,
): FeatureState | null {
  return BY_ID.get(id)?.operations[operation] ?? null;
}

export function isEditableFormat(id: string): boolean {
  return BY_ID.get(id)?.operations.edit === "editable";
}

/** Find the descriptor whose extension matches a filename, longest extension first. */
export function formatForFilename(filename: string): FormatDescriptor | null {
  const lower = filename.toLowerCase();
  const candidates = FORMATS.filter((format) =>
    format.extensions.some((extension) => lower.endsWith(extension)),
  ).sort((a, b) => {
    const longest = (format: FormatDescriptor) =>
      Math.max(...format.extensions.map((extension) => extension.length));
    return longest(b) - longest(a);
  });
  return candidates[0] ?? null;
}
