import { evaluateExpression } from "./expressions.js";
import type { ReportElement } from "./types.js";

/** Evaluate conditional display without running project scripts. Last matching color wins. */
export function reportCondition(element: Pick<ReportElement, "conditions">, data: Record<string, unknown> | undefined, row?: Record<string, unknown>): { hidden: boolean; color?: string; background?: string; bold?: boolean; italic?: boolean } {
  const output: { hidden: boolean; color?: string; background?: string; bold?: boolean; italic?: boolean } = { hidden: false };
  for (const rule of Array.isArray(element.conditions) ? element.conditions : []) {
    if (!rule || typeof rule !== "object") continue;
    const record = rule as Record<string, unknown>;
    if (typeof record.when !== "string") continue;
    const result = evaluateExpression(record.when, { datasets: row ? { ...data, row } : data, row });
    if (!result.ok || !result.value || (typeof result.value === "object" && result.value.units === 0n)) continue;
    if (record.hide === true) output.hidden = true;
    if (typeof record.color === "string" && /^#[0-9A-Fa-f]{3,8}$/.test(record.color)) output.color = record.color;
    if (typeof record.background === "string" && /^#[0-9A-Fa-f]{3,8}$/.test(record.background)) output.background = record.background;
    if (record.bold === true) output.bold = true;
    if (record.italic === true) output.italic = true;
  }
  return output;
}
