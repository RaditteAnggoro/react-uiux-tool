import postcss from "postcss";

export function cssTokenDeclarations(text: string) {
  const bom = text.startsWith("\uFEFF") ? 1 : 0;
  const root = postcss.parse(text.slice(bom));
  const declarations: Array<{
    name: string; value: string; line: number; column: number; start: number; end: number;
    selector: string | undefined; editable: boolean; valueStart: number; valueEnd: number;
  }> = [];
  root.walkDecls(/^--[\w-]+$/, declaration => {
    const source = declaration.source;
    if (!source?.start || !source.end) return;
    const rule = declaration.parent?.type === "rule" ? declaration.parent : undefined;
    const rawValue = declaration.raws.value?.raw ?? declaration.value;
    const start = source.start.offset + bom;
    const valueStart = start + declaration.prop.length + declaration.raws.between!.length;
    const valueEnd = valueStart + rawValue.trimEnd().length;
    declarations.push({ name: declaration.prop, value: declaration.value.trim(),
      line: source.start.line, column: source.start.column + (source.start.line === 1 ? bom : 0),
      start, end: source.end.offset + bom, selector: rule?.selector, valueStart, valueEnd,
      editable: rule?.selector === ":root" && rule.parent === root && !!rawValue.trim() && !rawValue.includes("/*") &&
        !declaration.important && text.slice(valueStart, valueStart + rawValue.length) === rawValue });
  });
  return declarations;
}

export function allowedCssTokenValue(value: string): boolean {
  if (value.length < 1 || value.length > 160 || !/^[-a-zA-Z0-9%#,.()+*/ ]+$/.test(value) || value.includes("/*")) return false;
  const functions = [...value.matchAll(/([a-zA-Z-]+)\s*\(/g)];
  if (functions.some((name) => !/^(?:var|calc|min|max|clamp|rgb|rgba|hsl|hsla|oklch|oklab)$/.test(name[1]!))) return false;
  try {
    postcss.parse(`:root{--candidate:${value};}`);
    return true;
  } catch {
    return false;
  }
}
