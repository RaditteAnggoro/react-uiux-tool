import type { ComponentInfo } from "./types.js";

export const MAX_BOARD_PROVIDERS = 4;

export function isBoardProvider(component: ComponentInfo, target: string | null): boolean {
  return component.exported && component.id !== target && component.name.endsWith("Provider") &&
    !component.props.some(prop => prop.name !== "children" && prop.requiredProven);
}
