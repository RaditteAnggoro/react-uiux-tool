export type RouteParameter = { name: string; kind: "single" | "catch-all" | "optional" };

function parameter(segment: string): RouteParameter | null {
  const optional = /^\[\[\.\.\.([^\[\]]+)\]\]$/.exec(segment);
  if (optional) return { name: optional[1]!, kind: "optional" };
  const catchAll = /^\[\.\.\.([^\[\]]+)\]$/.exec(segment);
  if (catchAll) return { name: catchAll[1]!, kind: "catch-all" };
  const single = /^\[([^\[\]]+)\]$/.exec(segment);
  return single ? { name: single[1]!, kind: "single" } : null;
}

export function routeParameters(pattern: string): RouteParameter[] {
  return pattern.split("/").map(parameter).filter((part): part is RouteParameter => !!part);
}

export function fillRoute(pattern: string, values: ReadonlyMap<string, string>): string | null {
  const path: string[] = [];
  for (const segment of pattern.split("/").filter(Boolean)) {
    const param = parameter(segment);
    if (!param) {
      path.push(segment);
      continue;
    }
    const value = values.get(param.name)?.trim() ?? "";
    if (!value && param.kind === "optional") continue;
    const parts = param.kind === "single" ? [value] : value.split("/");
    if (parts.some(part => !part || part === "." || part === ".." || /[\/\\\u0000-\u001f]/.test(part))) return null;
    try { path.push(...parts.map(encodeURIComponent)); } catch { return null; }
  }
  return "/" + path.join("/");
}
