/** Source-preserving .yrf scalar patch: only approved spans may change. */

export type YrfPathSegment = string | number;

export interface ScalarSpan {
  segments: YrfPathSegment[];
  path: string;
  kind: "string" | "number";
  start: number;
  end: number;
  value: string | number;
}

export type StringSpan = ScalarSpan & { kind: "string"; value: string };

export interface YrfPatchChange {
  path: string;
  start: number;
  end: number;
  before: string | number;
  after: string | number;
}

export interface YrfChange {
  objectPath: string;
  field: "caption" | "text" | "dataField" | "left" | "top" | "width" | "height" | "x1" | "y1" | "x2" | "y2";
  expected: string | number;
  value: string | number;
}

export type YrfPatchResult =
  | { ok: true; text: string; changes: YrfPatchChange[] }
  | { ok: false; error: string };

const ALLOWED_FIELDS = new Set(["caption", "text", "dataField", "left", "top", "width", "height", "x1", "y1", "x2", "y2"]);
const MAX_DIMENSION = 1_000_000;
const MAX_CAPTION = 4000;

export function formatYrfPath(segments: YrfPathSegment[]): string {
  return segments
    .map((segment, index) =>
      typeof segment === "number" ? `[${segment}]` : index === 0 ? segment : `.${segment}`,
    )
    .join("");
}

export function parseYrfPath(path: string): YrfPathSegment[] {
  const segments: YrfPathSegment[] = [];
  for (const part of path.split(".")) {
    const match = /^([A-Za-z_$][\w$-]*)((?:\[\d+\])*)$/.exec(part);
    if (!match) throw new Error(`Invalid YRF path segment: ${part}`);
    segments.push(match[1]!);
    for (const index of match[2]!.matchAll(/\[(\d+)\]/g)) {
      segments.push(Number(index[1]));
    }
  }
  return segments;
}

function decodeEscape(text: string, index: number): { value: string; next: number } {
  const char = text[index + 1];
  const simple: Record<string, string> = {
    '"': '"',
    "\\": "\\",
    "/": "/",
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
  };
  if (char && simple[char] !== undefined) return { value: simple[char]!, next: index + 2 };
  if (char === "u") {
    return {
      value: String.fromCharCode(parseInt(text.slice(index + 2, index + 6), 16)),
      next: index + 6,
    };
  }
  return { value: char ?? "", next: index + 2 };
}

/** Collect every JSON string and number span with its structural path. */
export interface ContainerSpan { path: string; start: number; end: number; kind: "array" | "object" }
export interface BooleanSpan { path: string; start: number; end: number; value: boolean }

export function collectScalarSpans(text: string, containers?: ContainerSpan[], booleans?: BooleanSpan[]): ScalarSpan[] {
  const spans: ScalarSpan[] = [];
  let index = 0;

  const skipWhitespace = () => {
    while (index < text.length && /\s/.test(text[index]!)) index += 1;
  };

  const readString = (): { start: number; end: number; value: string } => {
    const start = index;
    index += 1;
    let value = "";
    while (index < text.length) {
      const char = text[index];
      if (char === '"') {
        index += 1;
        return { start, end: index, value };
      }
      if (char === "\\") {
        const decoded = decodeEscape(text, index);
        value += decoded.value;
        index = decoded.next;
        continue;
      }
      value += char;
      index += 1;
    }
    throw new Error("Unterminated string");
  };

  const readScalar = () => {
    const start = index;
    while (index < text.length && !/[\s,}\]]/.test(text[index]!)) index += 1;
    return { token: text.slice(start, index), start, end: index };
  };

  const parseValue = (segments: YrfPathSegment[]): void => {
    skipWhitespace();
    const char = text[index];
    if (char === "{") {
      const containerStart = index;
      index += 1;
      for (;;) {
        skipWhitespace();
        if (text[index] === "}") {
          index += 1;
          containers?.push({ path: formatYrfPath(segments), start: containerStart, end: index, kind: "object" });
          return;
        }
        if (text[index] !== '"') throw new Error("Expected object key");
        const key = readString().value;
        skipWhitespace();
        if (text[index] !== ":") throw new Error("Expected ':'");
        index += 1;
        parseValue([...segments, key]);
        skipWhitespace();
        if (text[index] === ",") {
          index += 1;
          continue;
        }
        if (text[index] === "}") {
          index += 1;
          containers?.push({ path: formatYrfPath(segments), start: containerStart, end: index, kind: "object" });
          return;
        }
        throw new Error("Expected ',' or '}'");
      }
    }
    if (char === "[") {
      const containerStart = index;
      index += 1;
      let counter = 0;
      for (;;) {
        skipWhitespace();
        if (text[index] === "]") {
          index += 1;
          containers?.push({ path: formatYrfPath(segments), start: containerStart, end: index, kind: "array" });
          return;
        }
        parseValue([...segments, counter]);
        counter += 1;
        skipWhitespace();
        if (text[index] === ",") {
          index += 1;
          continue;
        }
        if (text[index] === "]") {
          index += 1;
          containers?.push({ path: formatYrfPath(segments), start: containerStart, end: index, kind: "array" });
          return;
        }
        throw new Error("Expected ',' or ']'");
      }
    }
    if (char === '"') {
      const span = readString();
      spans.push({ ...span, segments, path: formatYrfPath(segments), kind: "string", value: span.value });
      return;
    }
    const { token, start, end } = readScalar();
    if (token === "true" || token === "false") {
      booleans?.push({ path: formatYrfPath(segments), start, end, value: token === "true" });
      return;
    }
    if (token === "null" || token === "") return;
    const value = Number(token);
    if (!Number.isFinite(value)) return;
    spans.push({ start, end, segments, path: formatYrfPath(segments), kind: "number", value });
  };

  parseValue([]);
  return spans;
}

export function collectStringSpans(text: string): StringSpan[] {
  return collectScalarSpans(text).filter((span): span is StringSpan => span.kind === "string");
}

/** Append to one existing band without rewriting the remainder of the source. */
export function appendYrfObject(text: string, bandPath: string, object: Record<string, unknown>): { text: string; objectPath: string } {
  if (!/^layout\.(?:(?:pages\[\d+\]\.bands\[\d+\])|reportHeader|reportFooter)$/.test(bandPath)) throw new Error("Invalid report band");
  const document = JSON.parse(text.replace(/^\uFEFF/, ""));
  const band = valueAtPath(document, parseYrfPath(bandPath));
  if (!band || typeof band !== "object" || !Array.isArray((band as Record<string, unknown>).objects)) throw new Error("The band does not contain an objects array");
  const objects = (band as { objects: unknown[] }).objects;
  const spans: ContainerSpan[] = [];
  collectScalarSpans(text, spans);
  const matches = spans.filter((span) => span.path === `${bandPath}.objects` && span.kind === "array");
  if (matches.length !== 1) throw new Error("The band has ambiguous object arrays");
  const end = matches[0]!.end - 1;
  const next = text.slice(0, end) + (objects.length ? "," : "") + JSON.stringify(object) + text.slice(end);
  JSON.parse(next.replace(/^\uFEFF/, ""));
  return { text: next, objectPath: `${bandPath}.objects[${objects.length}]` };
}

/** Remove one object while retaining the surrounding source and every other object. */
export function removeYrfObject(text: string, objectPath: string): string {
  const match = /^(layout\.(?:(?:pages\[\d+\]\.bands\[\d+\])|reportHeader|reportFooter)\.objects)\[(\d+)\]$/.exec(objectPath);
  if (!match) throw new Error("Invalid report object path");
  const document = JSON.parse(text.replace(/^\uFEFF/, ""));
  const objects = valueAtPath(document, parseYrfPath(match[1]!));
  if (!Array.isArray(objects) || Number(match[2]) >= objects.length) throw new Error("Object not found");
  const object = objects[Number(match[2])];
  if (!object || typeof object !== "object" || Array.isArray(object) || !["label", "textbox", "line", "shape", "image"].includes(String((object as Record<string, unknown>).type)) || Object.keys(object).some((key) => /scripts?$|^(?:onformat|onbeforeprint|onafterprint|beforeprint|afterprint)$/i.test(key))) throw new Error("Unsupported or scripted objects cannot be removed visually");
  const spans: ContainerSpan[] = [];
  collectScalarSpans(text, spans);
  const arraySpans = spans.filter((span) => span.path === match[1] && span.kind === "array");
  const entries = objects.map((_, index) => spans.filter((span) => span.path === `${match[1]}[${index}]` && span.kind === "object"));
  if (arraySpans.length !== 1 || entries.some((entry) => entry.length !== 1)) throw new Error("Object array is ambiguous or contains unsupported values");
  const index = Number(match[2]);
  const target = entries[index]![0]!;
  const start = index > 0 ? entries[index - 1]![0]!.end : target.start;
  const end = index === 0 && entries.length > 1 ? entries[1]![0]!.start : target.end;
  const next = text.slice(0, start) + text.slice(end);
  JSON.parse(next.replace(/^\uFEFF/, ""));
  return next;
}

/** Reorder supported objects in their band (paint order), preserving object contents. */
export function moveYrfObject(
  text: string,
  objectPath: string,
  position: "front" | "back" | "up" | "down",
): { text: string; objectPath: string } {
  const match = /^(layout\.(?:(?:pages\[\d+\]\.bands\[\d+\])|reportHeader|reportFooter)\.objects)\[(\d+)\]$/.exec(objectPath);
  if (!match) throw new Error("Invalid report object path");
  const document = JSON.parse(text.replace(/^\uFEFF/, ""));
  const objects = valueAtPath(document, parseYrfPath(match[1]!));
  if (!Array.isArray(objects) || Number(match[2]) >= objects.length) throw new Error("Object not found");
  for (const object of objects) {
    if (!object || typeof object !== "object" || Array.isArray(object) || typeof (object as Record<string, unknown>).type !== "string" || Object.keys(object).some((key) => /scripts?$|^(?:onformat|onbeforeprint|onafterprint|beforeprint|afterprint)$/i.test(key))) throw new Error("Scripted objects cannot be reordered visually");
  }
  const index = Number(match[2]);
  const target = position === "front" ? objects.length - 1 : position === "back" ? 0 : position === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= objects.length || target === index) return { text, objectPath };
  const spans: ContainerSpan[] = [];
  collectScalarSpans(text, spans);
  const entries = objects.map((_, entryIndex) => spans.filter((span) => span.path === `${match[1]}[${entryIndex}]` && span.kind === "object"));
  if (entries.some((entry) => entry.length !== 1)) throw new Error("Object array is ambiguous");
  const entrySpans = entries.map((entry) => entry[0]!);
  const texts = entrySpans.map((span) => text.slice(span.start, span.end));
  const order = [...texts];
  const [moved] = order.splice(index, 1);
  if (moved === undefined) throw new Error("Object not found");
  order.splice(target, 0, moved);
  const start = entrySpans[0]!.start;
  const end = entrySpans[entrySpans.length - 1]!.end;
  const next = text.slice(0, start) + order.join(",") + text.slice(end);
  JSON.parse(next.replace(/^\uFEFF/, ""));
  return { text: next, objectPath: `${match[1]}[${target}]` };
}

/** Change an existing immediate scalar on one report object, preserving other bytes. */
export function setYrfObjectScalar(text: string, objectPath: string, field: string, value: string | number | boolean): string {
  if (!/^layout\.(?:(?:pages\[\d+\]\.bands\[\d+\])|reportHeader|reportFooter)\.objects\[\d+\]$/.test(objectPath) || !/^[A-Za-z_$][\w$-]*$/.test(field) || field === "type") throw new Error("Invalid object property");
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Invalid property value");
  const document = JSON.parse(text.replace(/^\uFEFF/, ""));
  const object = valueAtPath(document, parseYrfPath(objectPath));
  if (!object || typeof object !== "object" || Array.isArray(object)) throw new Error("Object not found");
  if (!["label", "textbox", "line", "shape", "image"].includes(String((object as Record<string, unknown>).type)) || /scripts?$|^(?:onformat|onbeforeprint|onafterprint|beforeprint|afterprint)$/i.test(field)) throw new Error("Unsupported object or script property cannot be edited visually");
  const imageData = field === "data" && (object as Record<string, unknown>).type === "image" && typeof value === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) && value.length <= 2_796_230;
  if (typeof value === "string" && value.length > 4000 && !imageData) throw new Error("Invalid property value");
  const booleanSpans: BooleanSpan[] = [];
  const containers: ContainerSpan[] = [];
  const scalarSpans = collectScalarSpans(text, containers, booleanSpans);
  const matches = [...scalarSpans, ...booleanSpans].filter((span) => span.path === `${objectPath}.${field}`);
  const newStyle = field === "style" && typeof value === "string" && ["label", "textbox", "line", "shape", "image"].includes(String((object as Record<string, unknown>).type));
  if (matches.length === 0 && (imageData || newStyle) && !(field in object)) {
    const objectSpans = containers.filter((span) => span.path === objectPath && span.kind === "object");
    if (objectSpans.length !== 1) throw new Error("Ambiguous object");
    const end = objectSpans[0]!.end - 1;
    const next = text.slice(0, end) + (Object.keys(object).length ? "," : "") + JSON.stringify(field) + ":" + JSON.stringify(value) + text.slice(end);
    JSON.parse(next.replace(/^\uFEFF/, ""));
    return next;
  }
  if (matches.length !== 1 || typeof matches[0]!.value !== typeof value) throw new Error("Property is missing, duplicated, or has the wrong type");
  const span = matches[0]!;
  const next = text.slice(0, span.start) + JSON.stringify(value) + text.slice(span.end);
  JSON.parse(next.replace(/^\uFEFF/, ""));
  return next;
}

export function valueAtPath(value: unknown, segments: YrfPathSegment[]): unknown {
  let current: unknown = value;
  for (const segment of segments) {
    if (typeof segment === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
    } else {
      if (typeof current !== "object" || current === null) return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return current;
}

function serialise(value: string | number): string {
  return typeof value === "number" ? String(value) : JSON.stringify(value);
}

function validateChange(change: YrfChange): string | null {
  if (!ALLOWED_FIELDS.has(change.field)) {
    return `Field "${change.field}" is not allowed`;
  }
  if (change.field === "caption" || change.field === "text" || change.field === "dataField") {
    if (typeof change.value !== "string") return "Caption must be a string";
    if (change.value.length > MAX_CAPTION) return "Caption is too long";
    return null;
  }
  if (typeof change.value !== "number" || !Number.isFinite(change.value)) {
    return "Geometry values must be finite numbers";
  }
  if (Math.abs(change.value) > MAX_DIMENSION) return "Geometry value is out of range";
  if ((change.field === "width" || change.field === "height") && change.value < 0) return "Width and height must not be negative";
  return null;
}

/** Apply an ordered set of allowlisted scalar patches, preserving every other byte. */
export function applyYrfChanges(text: string, changes: YrfChange[]): YrfPatchResult {
  if (changes.length === 0) return { ok: false, error: "No changes requested" };
  if (changes.length > 40) return { ok: false, error: "Too many changes in one save" };
  let current = text;
  const applied: YrfPatchChange[] = [];
  const touched = new Set<string>();
  let document: unknown;
  try { document = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { return { ok: false, error: "Invalid YRF JSON" }; }

  for (const change of changes) {
    const invalid = validateChange(change);
    if (invalid) return { ok: false, error: invalid };
    if (!/^layout\.(?:(?:pages\[\d+\]\.bands\[\d+\])|reportHeader|reportFooter)\.objects\[\d+\]$/.test(change.objectPath))
      return { ok: false, error: "Only inspected report objects can be edited" };
    const object = valueAtPath(document, parseYrfPath(change.objectPath));
    if (!object || typeof object !== "object" || Array.isArray(object)) return { ok: false, error: "Report object not found" };
    const kind = (object as Record<string, unknown>).type;
    if (typeof kind !== "string" || !["label", "textbox", "line", "shape", "image"].includes(kind)) return { ok: false, error: "Unsupported report object type" };
    if (change.field === "caption" && kind !== "label" && kind !== "textbox") return { ok: false, error: "Caption is only editable for label or textbox objects" };
    if ((change.field === "text" || change.field === "dataField") && kind !== "textbox") return { ok: false, error: "Text and data fields are only editable for textbox objects" };
    if (["x1", "y1", "x2", "y2"].includes(change.field) && kind !== "line") return { ok: false, error: "Endpoints are only editable for line objects" };
    const segments = parseYrfPath(`${change.objectPath}.${change.field}`);
    const targetPath = formatYrfPath(segments);
    if (touched.has(targetPath)) return { ok: false, error: `Duplicate change for ${targetPath}` };

    let spans: ScalarSpan[];
    try {
      spans = collectScalarSpans(current);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Unable to parse .yrf" };
    }
    const matches = spans.filter((entry) => entry.path === targetPath);
    if (matches.length > 1) return { ok: false, error: `Duplicate property ${targetPath} is unsupported` };
    const span = matches[0];
    if (!span) return { ok: false, error: `Property ${targetPath} was not found` };
    if (span.kind !== (typeof change.value === "number" ? "number" : "string")) {
      return { ok: false, error: `Property ${targetPath} has an unexpected type` };
    }
    const expectedMatches =
      typeof span.value === "number"
        ? typeof change.expected === "number" && span.value === change.expected
        : span.value === change.expected;
    if (!expectedMatches) {
      return { ok: false, error: `${targetPath} changed on disk; reopen the file` };
    }

    const replacement = serialise(change.value);
    const next = current.slice(0, span.start) + replacement + current.slice(span.end);

    // Every span that is not part of this patch batch must keep its value.
    const after = collectScalarSpans(next);
    if (after.length !== spans.length) {
      return { ok: false, error: "Patch would change the document structure" };
    }
    for (let position = 0; position < spans.length; position += 1) {
      const before = spans[position]!;
      const changed = after[position]!;
      if (before.path !== changed.path) return { ok: false, error: "Patch shifted unrelated fields" };
      if (before.path === targetPath) continue;
      if (touched.has(before.path) || before.path === targetPath) continue;
      if (before.kind !== changed.kind || before.value !== changed.value) {
        return { ok: false, error: "Patch would change unrelated values" };
      }
    }

    applied.push({
      path: targetPath,
      start: span.start,
      end: span.end,
      before: span.value,
      after: change.value,
    });
    touched.add(targetPath);
    current = next;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(current.replace(/^\uFEFF/, ""));
  } catch {
    return { ok: false, error: "Patched document is not valid JSON" };
  }
  for (const change of changes) {
    const segments = parseYrfPath(`${change.objectPath}.${change.field}`);
    if (valueAtPath(parsed, segments) !== change.value) {
      return { ok: false, error: "Patched value does not round-trip" };
    }
  }
  return { ok: true, text: current, changes: applied };
}

/** Backwards-compatible single caption patch helper. */
export function previewYrfPatch(input: {
  text: string;
  objectPath: string;
  expectedCaption: string;
  caption: string;
}): { ok: true; text: string; change: YrfPatchChange } | { ok: false; error: string } {
  const result = applyYrfChanges(input.text, [
    {
      objectPath: input.objectPath.replace(/\.caption$/, ""),
      field: "caption",
      expected: input.expectedCaption,
      value: input.caption,
    },
  ]);
  if (!result.ok) return result;
  return { ok: true, text: result.text, change: result.changes[0]! };
}
