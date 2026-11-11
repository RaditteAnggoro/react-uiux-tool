import type { ReportDocumentV1, ReportIssue } from "./types.js";

/** Values supplied under `parameters` take precedence over report defaults. */
export function withParameterDefaults(document: ReportDocumentV1, data: Record<string, unknown> = {}): Record<string, unknown> {
  if (!document.parameters.length) return data;
  const supplied = data.parameters;
  if (supplied !== undefined && (!supplied || typeof supplied !== "object" || Array.isArray(supplied))) return data;
  const defaults = Object.fromEntries(document.parameters.filter((parameter) => parameter.defaultValue !== undefined).map((parameter) => [parameter.id, parameter.defaultValue]));
  return { ...data, parameters: { ...defaults, ...(supplied as Record<string, unknown> | undefined) } };
}

/** Report missing and incorrectly typed parameters without exposing their values. */
export function parameterWarnings(document: ReportDocumentV1, data: Record<string, unknown> = {}): ReportIssue[] {
  if (!document.parameters.length) return [];
  const resolved = withParameterDefaults(document, data).parameters;
  if (resolved !== undefined && (!resolved || typeof resolved !== "object" || Array.isArray(resolved))) {
    return [{ code: "INVALID_PARAMETERS", path: "$.parameters", message: "Sample data parameters must be an object", severity: "warning" }];
  }
  const values = resolved as Record<string, unknown> | undefined;
  return document.parameters.flatMap((parameter): ReportIssue[] => {
    const value = values?.[parameter.id];
    const missing = value === undefined || value === null || value === "";
    const path = `$.parameters.${parameter.id}`;
    if (missing) return parameter.required ? [{ code: "REQUIRED_PARAMETER", path, message: `Required parameter ${parameter.id} has no value`, severity: "warning" }] : [];
    const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
    const valid = parameter.type === "string" ? typeof value === "string" : parameter.type === "boolean" ? typeof value === "boolean" : parameter.type === "number" ? (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) : !!date && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    return valid ? [] : [{ code: "INVALID_PARAMETER_TYPE", path, message: `Parameter ${parameter.id} must be ${parameter.type}`, severity: "warning" }];
  });
}
