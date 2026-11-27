import { renameExpressionParameters } from "./expressions.js";
import { reportParameterValueValid } from "./parameters.js";
import type { LinkedReportArguments, ReportDocumentV1 } from "./types.js";

export const MAX_LINKED_REPORTS = 8;
export const REPORT_PATH_SEGMENT = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} ._-]*$/u;

export function validSubreportPath(value: string): boolean {
  return value.length <= 240 && value.toLowerCase().endsWith(".report.json") &&
    value.split("/").every(part => REPORT_PATH_SEGMENT.test(part) && !/[ .]$/.test(part));
}

function comparable(value: unknown): string {
  return JSON.stringify(value, (_, entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]]))
      : entry);
}

export function validLinkedReportArguments(value: unknown): value is LinkedReportArguments {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.entries(value).length <= 40 && Object.entries(value).every(([name, entry]) =>
      /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(name) && !["constructor", "prototype"].includes(name) &&
      (typeof entry === "string" && entry.length <= 2000 ||
       typeof entry === "number" && Number.isFinite(entry) || typeof entry === "boolean"));
}

/** Namespace only overridden parameters so legacy links still share parent data. */
export function applyLinkedReportArguments(
  parent: ReportDocumentV1, child: ReportDocumentV1, prefix: string, overrides: LinkedReportArguments,
  occupiedSampleIds: readonly string[] = [],
): ReportDocumentV1 {
  const occupied = new Set([parent, child].flatMap(report => [
    report.id, ...report.parameters.map(item => item.id), ...report.datasets.map(item => item.id),
    ...report.bands.flatMap(band => [band.id, ...band.elements.map(element => element.id)]),
  ]));
  for (const id of occupiedSampleIds) occupied.add(id);
  const names = new Map<string, string>();
  const parameterIds = new Set(child.parameters.map(item => item.id));
  for (const name of Object.keys(overrides)) {
    if (!parameterIds.has(name)) throw new Error(`Unknown linked parameter: ${name}`);
  }
  const parameters = child.parameters.map(parameter => {
    if (!Object.hasOwn(overrides, parameter.id)) return parameter;
    const value = overrides[parameter.id];
    if (!reportParameterValueValid(parameter.type, value)) {
      throw new Error(`Linked parameter ${parameter.id} must be ${parameter.type}`);
    }
    let index = names.size + 1;
    let alias = `${prefix.replaceAll("-", "_")}_argument_${index}`;
    while (occupied.has(alias)) alias = `${prefix.replaceAll("-", "_")}_argument_${++index}`;
    occupied.add(alias);
    names.set(parameter.id, alias);
    return { ...parameter, id: alias, defaultValue: value };
  });
  const rename = (reference: string) => {
    const [root, name, ...tail] = reference.split(".");
    const alias = root === "parameters" && name ? names.get(name) : undefined;
    return alias ? ["parameters", alias, ...tail].join(".") : reference;
  };
  const condition = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const rule = value as Record<string, unknown>;
    return typeof rule.when === "string" ? { ...rule, when: renameExpressionParameters(rule.when, rename) } : value;
  };
  return { ...child, parameters, bands: child.bands.map(band => ({
    ...band,
    ...(band.groupBy ? { groupBy: rename(band.groupBy) } : {}),
    elements: band.elements.map(element => {
      const props = { ...element.props };
      if (typeof props.expression === "string") props.expression = renameExpressionParameters(props.expression, rename);
      if (props.rowCondition) props.rowCondition = condition(props.rowCondition);
      if (Array.isArray(props.rowRules)) props.rowRules = props.rowRules.map(condition);
      const path = element.bindings?.path;
      return { ...element, props,
        ...(typeof path === "string" ? { bindings: { ...element.bindings, path: rename(path) } } : {}),
        ...(element.conditions ? { conditions: element.conditions.map(item => condition(item) as Record<string, unknown>) } : {}),
      };
    }),
  })) };
}

export function appendReportSections(parent: ReportDocumentV1, source: ReportDocumentV1, prefix = "sub-" + crypto.randomUUID()): ReportDocumentV1 {
  if (parent.units !== source.units) throw new Error("Choose a subreport with the same units.");
  const merge = <T extends { id: string }>(local: T[], imported: T[], kind: string): T[] => {
    const existing = new Map(local.map(entry => [entry.id, entry]));
    for (const entry of imported) {
      const current = existing.get(entry.id);
      if (current && comparable(current) !== comparable(entry)) throw new Error(`Conflicting ${kind}: ${entry.id}`);
      existing.set(entry.id, current ?? entry);
    }
    return [...existing.values()];
  };
  for (const [key, value] of Object.entries(source.styleTokens)) {
    if (Object.hasOwn(parent.styleTokens, key) && comparable(parent.styleTokens[key]) !== comparable(value)) {
      throw new Error(`Conflicting style token: ${key}`);
    }
  }
  const groups = new Map<string, string>();
  return { ...parent, datasets: merge(parent.datasets, source.datasets, "dataset"),
    parameters: merge(parent.parameters, source.parameters, "parameter"),
    styleTokens: { ...source.styleTokens, ...parent.styleTokens },
    bands: [...parent.bands, ...source.bands.map((band, index) => ({
      ...band, id: `${prefix}-${index}`,
      kind: band.kind === "pageHeader" || band.kind === "pageFooter" ? "detail" as const : band.kind,
      elements: band.elements.map((element, offset) => {
        const next = { ...element, id: `${prefix}-${index}-${offset}` };
        if (element.groupId) {
          const group = groups.get(element.groupId) ?? `${prefix}-g${groups.size}`;
          groups.set(element.groupId, group);
          next.groupId = group;
        }
        return next;
      }),
    }))] };
}
