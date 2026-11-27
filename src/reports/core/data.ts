/** Bounded dataset lookup shared by the renderer, exports, and pagination. */
export function resolvePath(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const segment of path.split(".").filter(Boolean)) {
    if (Array.isArray(current)) {
      return current.map((entry) => resolvePath(entry, segment));
    }
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function datasetRows(
  data: Record<string, unknown> | undefined,
  path: string | undefined,
): unknown[] {
  if (!data || !path) return [];
  const [dataset, ...rest] = path.split(".");
  const root = data[dataset ?? ""];
  if (!rest.length) return Array.isArray(root) ? root : [];
  const nested = resolvePath(root, rest.join("."));
  return Array.isArray(nested) ? nested : [];
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** RFC-4180-ish CSV parser: quoted fields, escaped quotes, CRLF, BOM. No network. */
export function parseCsv(text: string, maxRows = 5000, delimiter: "," | "\t" = ","): ParsedCsv {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  let closedQuote = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (closedQuote && char !== delimiter && char !== "\n" && char !== "\r") {
      throw new Error(`Unexpected character after a quoted field in CSV record ${rows.length + 1}`);
    }
    if (char === '"') {
      if (field.length > 0) throw new Error("Unexpected quote inside an unquoted CSV field");
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = "";
      closedQuote = false;
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      closedQuote = false;
      if (rows.length > maxRows + 1) throw new Error("CSV exceeds the row limit");
      continue;
    }
    field += char;
  }
  if (quoted) throw new Error("Unterminated quoted CSV field");
  row.push(field);
  if (rows.length === 0 || !/[\r\n]$/.test(source)) rows.push(row);
  const headers = (rows.shift() ?? []).map((header) => header.trim());
  if (headers.length === 0 || headers.every((header) => header === "")) {
    throw new Error("CSV has no header row");
  }
  if (headers.some((header) => !header)) throw new Error("CSV header names must not be empty");
  if (new Set(headers).size !== headers.length) throw new Error("CSV contains duplicate header names");
  if (rows.length > maxRows) throw new Error("CSV exceeds the row limit");
  rows.forEach((dataRow, index) => {
    if (dataRow.length !== headers.length) {
      throw new Error(`CSV record ${index + 2} has ${dataRow.length} columns; expected ${headers.length}`);
    }
  });
  return { headers, rows };
}

export function csvToRecords(text: string, maxRows = 5000, delimiter: "," | "\t" = ","): Record<string, string>[] {
  const { headers, rows } = parseCsv(text, maxRows, delimiter);
  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index]])),
  );
}
