import { collectScalarSpans, type ContainerSpan } from "../../../../src/reports/formats/yrf/patch";

export function revealJsonObject(editor: HTMLTextAreaElement, target: { id: string } | { path: string }): number | null {
  const text = editor.value;
  const containers: ContainerSpan[] = [];
  try {
    // The editor can contain an unfinished draft. Avoid jumping into a malformed document.
    JSON.parse(text.replace(/^\uFEFF/, ""));
    const values = collectScalarSpans(text, containers, undefined, true);
    let path: string;
    if ("id" in target) {
      const matches = values.filter(value => value.kind === "string" && value.value === target.id &&
        /^bands\[\d+\]\.elements\[\d+\]\.id$/.test(value.path));
      if (matches.length !== 1) return null;
      path = matches[0]!.path.slice(0, -3);
    } else {
      path = target.path;
    }
    const objects = containers.filter(container => container.kind === "object" && container.path === path);
    if (objects.length !== 1) return null;
    const start = objects[0]!.start;
    const line = text.slice(0, start).split("\n").length;
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(start, start);
    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight);
    if (Number.isFinite(lineHeight)) editor.scrollTop = Math.max(0, (line - 3) * lineHeight);
    return line;
  } catch {
    return null;
  }
}
