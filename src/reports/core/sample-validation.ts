import { asRecord } from "./data.js";
import type { ReportDataset } from "./types.js";

export const SAMPLE_FIELD_TYPES = ["string", "number", "boolean", "date"] as const;
export type SampleFieldType = typeof SAMPLE_FIELD_TYPES[number];
export type SampleIssue = { dataset: string; row?: number; field?: string; expected: SampleFieldType | "record" | "required" };

export function sampleFieldRules(dataset: ReportDataset) {
  const schema = asRecord(dataset.schema);
  const required = new Set(Array.isArray(schema.requiredFields) ? schema.requiredFields.filter((name): name is string => typeof name === "string") : []);
  const declared = asRecord(schema.fieldTypes);
  const fields = new Set([
    ...Array.isArray(schema.fields) ? schema.fields.filter((name): name is string => typeof name === "string") : [],
    ...Object.keys(declared),
    ...required,
  ]);
  return [...fields].map(field => ({
    field,
    type: SAMPLE_FIELD_TYPES.find(type => type === declared[field]),
    required: required.has(field),
  }));
}

function accepts(type: SampleFieldType, value: unknown): boolean {
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" ? Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)) :
    typeof value === "string" && /^[+-]?\d+(?:\.\d+)?$/.test(value.trim());
  if (type === "boolean") return typeof value === "boolean" ||
    typeof value === "string" && /^(?:true|false)$/i.test(value.trim());
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}\.\d{3}Z)?$/.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const iso = parsed.toISOString();
  return value.length === 10 ? iso.slice(0, 10) === value : iso === value;
}

export function validateSampleData(datasets: readonly ReportDataset[], data: Record<string, unknown>, limit = 12) {
  const issues: SampleIssue[] = [];
  let count = 0;
  const add = (issue: SampleIssue) => {
    count++;
    if (issues.length < limit) issues.push(issue);
  };
  for (const dataset of datasets) {
    const fields = sampleFieldRules(dataset).filter(rule => rule.type || rule.required);
    if (!fields.length || !Object.hasOwn(data, dataset.id)) continue;
    const value = data[dataset.id];
    const rows = Array.isArray(value) ? value : [value];
    rows.forEach((row, index) => {
      const location = { dataset: dataset.id, row: Array.isArray(value) ? index + 1 : undefined };
      if (typeof row !== "object" || row === null || Array.isArray(row)) return add({ ...location, expected: "record" });
      const record = asRecord(row);
      for (const { field, type, required } of fields) {
        const cell = record[field];
        if (!Object.hasOwn(record, field) || cell === null || cell === undefined || (typeof cell === "string" && !cell.trim())) {
          if (required) add({ ...location, field, expected: "required" });
        } else if (type && !accepts(type, cell)) add({ ...location, field, expected: type });
      }
    });
  }
  return { issues, count };
}
