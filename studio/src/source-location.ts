export function vscodeSourceUrl(root: string, file: string, line?: number | null): string | undefined {
  const normalized = root.replaceAll("\\", "/");
  const drive = /^([a-z]:)\//i.exec(normalized)?.[1];
  if (!drive && (!normalized.startsWith("/") || normalized.startsWith("//"))) return undefined;
  const relative = file.replaceAll("\\", "/").split("/");
  if (relative.some(part => !part || part === "." || part === ".." || part.includes(":"))) return undefined;
  const rootParts = (drive ? normalized.slice(2) : normalized).split("/").filter(Boolean);
  try {
    const encoded = [...rootParts, ...relative].map(encodeURIComponent).join("/");
    const location = Number.isSafeInteger(line) && line! > 0 ? `:${line}:1` : "";
    return `vscode://file/${drive ? drive + "/" : ""}${encoded}${location}`;
  } catch {
    return undefined;
  }
}
