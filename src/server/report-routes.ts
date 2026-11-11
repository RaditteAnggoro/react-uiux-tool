/** Copyright (c) 2026 RA. Report Studio API: bounded, local-first, no vendor runtime. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { projectRoot as canonicalProjectRoot, resolveProjectPath } from "../engine/safety.js";
import {
  DEFAULT_LIMITS,
  RDM_SCHEMA_VERSION,
  STYLE_FAMILIES,
  TEMPLATE_CATALOG,
  buildTemplate,
  exportReport,
  isExportFormat,
  listFormats,
  parseReport,
  renderReportHtml,
  serializeReport,
  validateReportDocument,
} from "../reports/index.js";
import type { StyleFamilyId } from "../reports/index.js";
import { inspectYrf, YRF_MAX_BYTES } from "../reports/formats/yrf/inspect.js";
import { applyYrfChanges, type YrfChange } from "../reports/formats/yrf/patch.js";
import { createYrfFromNative } from "../reports/formats/yrf/create.js";
import { parameterWarnings } from "../reports/core/parameters.js";
import type { ReportDocumentV1 } from "../reports/index.js";

const MAX_REPORT_BODY = DEFAULT_LIMITS.maxBytes;
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,120}\.report\.json$/i;

export interface ReportApiContext {
  currentProjectRoot: () => string | null;
  origin: () => string;
  now?: () => Date;
}

class ReportApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers["content-type"]?.startsWith("application/json")) {
    throw new ReportApiError(415, "INVALID_CONTENT_TYPE", "Expected application/json");
  }
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text, "utf8") > MAX_REPORT_BODY + 64 * 1024) {
      throw new ReportApiError(413, "BODY_TOO_LARGE", "Report payload is too large");
    }
  }
  let value: unknown;
  try {
    value = JSON.parse(text || "{}");
  } catch {
    throw new ReportApiError(400, "INVALID_JSON", "Request body is not valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ReportApiError(400, "INVALID_BODY", "Expected a JSON object");
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string, max = 512): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new ReportApiError(400, "INVALID_FIELD", `Invalid ${label}`);
  }
  return value;
}

/**
 * In-process write lock per absolute path. POSIX has no compare-and-swap for
 * files, so serialising mutations and re-checking the hash immediately before
 * rename is the strongest portable guarantee we can give here.
 */
const writeLocks = new Map<string, Promise<unknown>>();

async function withWriteLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = writeLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  writeLocks.set(key, previous.then(() => gate));
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
  }
}

async function writeTempFile(full: string, text: string): Promise<string> {
  const temp = path.join(
    path.dirname(full),
    `.${path.basename(full)}.tmp-${randomBytes(6).toString("hex")}`,
  );
  const handle = await fs.open(temp, "wx", 0o644);
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return temp;
}

async function readReportFile(full: string): Promise<string> {
  const info = await fs.stat(full);
  if (!info.isFile()) {
    throw new ReportApiError(400, "NOT_A_FILE", "Report path is not a regular file");
  }
  if (info.size > DEFAULT_LIMITS.maxBytes) {
    throw new ReportApiError(413, "FILE_TOO_LARGE", "Report file exceeds the 5 MiB limit");
  }
  const raw = await fs.readFile(full);
  if (raw.includes(0)) {
    throw new ReportApiError(415, "BINARY_FILE", "Binary report files are unsupported");
  }
  const text = raw.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(raw)) {
    throw new ReportApiError(415, "INVALID_UTF8", "Report must be valid UTF-8");
  }
  return text;
}


const SYSTEM_SYMLINKS = new Set(["/var", "/tmp", "/etc", "/private"]);

/** Build ancestor paths from the actual filesystem root, including Windows drives and UNC shares. */
export function reportAncestorPaths(file: string, platformPath: typeof path = path): string[] {
  const absolute = platformPath.resolve(file);
  const root = platformPath.parse(absolute).root;
  const parts = absolute.slice(root.length).split(platformPath.sep).filter(Boolean);
  const ancestors: string[] = [];
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = platformPath.join(current, part);
    ancestors.push(current);
  }
  return ancestors;
}

async function assertNoSymlinkAncestors(file: string): Promise<void> {
  for (const current of reportAncestorPaths(file)) {
    if (SYSTEM_SYMLINKS.has(current)) continue;
    const info = await fs.lstat(current).catch(() => null);
    if (info?.isSymbolicLink()) {
      throw new ReportApiError(
        403,
        "SYMLINK_PARENT",
        "Parent folders of a .yrf file may not be symlinks",
      );
    }
  }
}

const SECRET_PATH =
  /(^|\/)(\.env(?:\..*)?|\.git|node_modules|\.ssh|\.aws|.*\.(?:pem|key|p12|pfx))($|\/)/i;

async function loadYrfFile(target: unknown): Promise<{ file: string; text: string; hash: string }> {
  const file = requireString(target, "yrf path", 4096);
  if (!/\.yrf$/i.test(file)) {
    throw new ReportApiError(400, "INVALID_EXTENSION", "Only .yrf files can be inspected");
  }
  if (!path.isAbsolute(file)) {
    throw new ReportApiError(400, "ABSOLUTE_PATH_REQUIRED", "Choose an absolute .yrf path");
  }
  if (SECRET_PATH.test(file.replace(/\\/g, "/"))) {
    throw new ReportApiError(403, "FORBIDDEN_PATH", "That path is not accessible");
  }
  await assertNoSymlinkAncestors(file);
  const info = await fs.lstat(file).catch(() => null);
  if (!info) throw new ReportApiError(404, "NOT_FOUND", "YRF file was not found");
  if (info.isSymbolicLink()) {
    throw new ReportApiError(403, "SYMLINK", "Symlinked YRF files are not inspected");
  }
  if (!info.isFile()) throw new ReportApiError(400, "NOT_A_FILE", "YRF path is not a regular file");
  if (info.size > YRF_MAX_BYTES) {
    throw new ReportApiError(413, "FILE_TOO_LARGE", "YRF file exceeds the 5 MiB limit");
  }
  // macOS resolves /var → /private/var for temporary folders; canonicalise instead
  // of rejecting, while the symlink check above already covers the file itself.
  const real = await fs.realpath(file);
  if (!/\.yrf$/i.test(real)) {
    throw new ReportApiError(403, "PATH_RESOLUTION_CHANGED", "Resolved path is not a .yrf file");
  }
  const text = await readReportFile(real);
  if (!text.replace(/^\uFEFF/, "").trimStart().startsWith("{")) {
    throw new ReportApiError(415, "UNSUPPORTED_ENCODING", "YRF must be a JSON document");
  }
  return { file: real, text, hash: sha256(text) };
}

async function writeYrfCopy(file: string, text: string): Promise<string> {
  const directory = path.dirname(file);
  const base = path.basename(file, path.extname(file));
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = path.join(
      directory,
      attempt === 1 ? `${base}.edited.yrf` : `${base}.edited-${attempt}.yrf`,
    );
    if (await fs.lstat(candidate).catch(() => null)) continue;
    const temp = await writeTempFile(candidate, text);
    try {
      await fs.link(temp, candidate);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    } finally {
      await fs.rm(temp, { force: true });
    }
  }
  throw new ReportApiError(409, "COPY_EXISTS", "Could not allocate a save-copy name");
}


function readYrfChanges(data: Record<string, unknown>): YrfChange[] {
  if (Array.isArray(data.changes)) {
    if (data.changes.length > 40) throw new ReportApiError(400, "TOO_MANY_CHANGES", "At most 40 changes are allowed");
    return data.changes.map((entry, index) => {
      const record = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
      return {
        objectPath: requireString(record.objectPath, `changes[${index}].objectPath`, 400),
        field: requireString(record.field, `changes[${index}].field`, 20) as YrfChange["field"],
        expected: typeof record.expected === "number" ? record.expected : yrfText(record.expected, `changes[${index}].expected`),
        value: typeof record.value === "number" ? record.value : yrfText(record.value, `changes[${index}].value`),
      };
    });
  }
  return [
    {
      objectPath: requireString(data.objectPath, "object path", 400).replace(/\.caption$/, ""),
      field: "caption",
      expected: requireString(data.expectedCaption, "expected caption", 4000),
      value: requireString(data.caption, "caption", 4000),
    },
  ];
}

function yrfText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 4000) throw new ReportApiError(400, "INVALID_FIELD", `Invalid ${label}`);
  return value;
}

function requireYrfTarget(value: unknown): string {
  const file = requireString(value, "yrf target path", 4096);
  if (!/\.yrf$/i.test(file)) {
    throw new ReportApiError(400, "INVALID_EXTENSION", "Target must end with .yrf");
  }
  if (!path.isAbsolute(file)) {
    throw new ReportApiError(400, "ABSOLUTE_PATH_REQUIRED", "Choose an absolute .yrf path");
  }
  if (path.isAbsolute(file) && file.replace(/\\/g, "/").split("/").some((part) => part === "..")) {
    throw new ReportApiError(400, "UNSAFE_PATH", "Path must not contain '..'");
  }
  return file;
}


const BROWSE_EXCLUDED = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "vendor",
  ".next",
  "test-results",
  "secrets",
]);

const REPORT_FILE = /\.(report\.json|yrf)$/i;

interface BrowseEntry {
  name: string;
  path: string;
  absolute: string;
  kind: "native" | "yrf";
  size: number;
}

async function browseReports(
  root: string,
  format: "all" | "native" | "yrf",
): Promise<{ entries: BrowseEntry[]; truncated: boolean; suggestions: Array<{ path: string }> }> {
  const entries: BrowseEntry[] = [];
  let truncated = false;

  const scan = async (directory: string, depth: number): Promise<void> => {
    if (truncated || depth > 2) return;
    const items = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const item of items) {
      if (entries.length >= 200) {
        truncated = true;
        return;
      }
      if (item.name.startsWith(".") || BROWSE_EXCLUDED.has(item.name)) continue;
      const full = path.join(directory, item.name);
      if (item.isSymbolicLink()) continue;
      if (item.isDirectory()) {
        await scan(full, depth + 1);
        continue;
      }
      if (!REPORT_FILE.test(item.name)) continue;
      const kind: "native" | "yrf" = /\.yrf$/i.test(item.name) ? "yrf" : "native";
      if (format !== "all" && format !== kind) continue;
      const info = await fs.stat(full).catch(() => null);
      if (!info || !info.isFile() || info.size > YRF_MAX_BYTES) continue;
      entries.push({
        name: item.name,
        path: path.relative(root, full).split(path.sep).join("/"),
        absolute: full,
        kind,
        size: info.size,
      });
    }
  };

  await scan(root, 0);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  const suggestions: Array<{ path: string }> = [];
  const publicRpt = path.join(root, "public", "rpt");
  const info = await fs.stat(publicRpt).catch(() => null);
  if (info?.isDirectory()) suggestions.push({ path: "public/rpt" });
  return { entries, truncated, suggestions };
}

export interface ReportApi {
  handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void>;
}

export function createReportApi(context: ReportApiContext): ReportApi {
  let manualRoot: string | null = null;

  const effectiveRoot = () => manualRoot ?? context.currentProjectRoot();

  const requireRoot = async (): Promise<string> => {
    const root = effectiveRoot();
    if (!root) {
      throw new ReportApiError(
        409,
        "NO_REPORT_ROOT",
        "Open a project or choose a report folder first",
      );
    }
    return canonicalProjectRoot(root);
  };

  const listFiles = async (root: string): Promise<string[]> => {
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    return entries
      .filter((entry) => entry.isFile() && /\.report\.json$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  };

  const state = async () => {
    const contextRoot = context.currentProjectRoot();
    const root = manualRoot;
    return {
      schemaVersion: RDM_SCHEMA_VERSION,
      root,
      context: contextRoot,
      source: manualRoot ? "manual" : null,
      files: root ? await listFiles(root).catch(() => []) : [],
      templates: TEMPLATE_CATALOG.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        styleFamily: template.styleFamily,
      })),
      formats: listFormats(),
      limits: { maxBytes: DEFAULT_LIMITS.maxBytes, maxBands: DEFAULT_LIMITS.maxBands },
    };
  };

  const requireFileName = (file: string): string => {
    const relative = requireString(file, "report file name", 180);
    if (!FILE_NAME.test(relative)) {
      throw new ReportApiError(
        400,
        "INVALID_FILE_NAME",
        "Report files must end with .report.json and use plain characters",
      );
    }
    return relative;
  };

  const prepareExisting = async (
    root: string,
    file: string,
  ): Promise<{ full: string; relative: string }> => {
    const relative = requireString(file, "report file name", 240);
    const segments = relative.split("/");
    if (
      !relative.toLowerCase().endsWith(".report.json") ||
      relative.startsWith("/") ||
      relative.includes("\\") ||
      segments.some((segment) => !segment || segment === "." || segment === "..") ||
      !/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(segments[segments.length - 1] ?? "")
    ) {
      throw new ReportApiError(
        400,
        "INVALID_FILE_NAME",
        "Report files must end with .report.json and use plain characters",
      );
    }
    try {
      return { full: await resolveProjectPath(root, relative), relative };
    } catch {
      throw new ReportApiError(404, "NOT_FOUND", "Report file was not found");
    }
  };

  const prepareNew = async (
    root: string,
    file: string,
  ): Promise<{ full: string; relative: string }> => {
    const relative = requireFileName(file);
    const full = path.join(root, relative);
    if (!full.startsWith(root + path.sep)) {
      throw new ReportApiError(400, "UNSAFE_PATH", "Report path escapes its folder");
    }
    if (await fs.lstat(full).catch(() => null)) {
      throw new ReportApiError(409, "FILE_EXISTS", "Report file already exists");
    }
    return { full, relative };
  };

  const handle = async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const route = url.pathname.replace("/api/reports/", "");
    if (req.method === "POST" && req.headers.origin !== context.origin()) {
      throw new ReportApiError(403, "FORBIDDEN", "A same-origin POST is required");
    }

    if (req.method === "GET" && route === "state") {
      json(res, 200, await state());
      return;
    }

    if (req.method === "GET" && route === "files") {
      const root = await requireRoot();
      json(res, 200, { files: await listFiles(root) });
      return;
    }

    if (req.method === "GET" && route === "browse") {
      const scope = url.searchParams.get("scope");
      const base =
        manualRoot ??
        (scope === "context" ? context.currentProjectRoot() : null);
      if (!base) {
        throw new ReportApiError(
          409,
          "NO_REPORT_ROOT",
          "Choose a report folder before browsing reports",
        );
      }
      const root = await canonicalProjectRoot(base);
      const format = url.searchParams.get("format") === "yrf"
        ? "yrf"
        : url.searchParams.get("format") === "native"
          ? "native"
          : "all";
      json(res, 200, { root, ...(await browseReports(root, format)) });
      return;
    }

    if (req.method !== "POST") {
      throw new ReportApiError(405, "METHOD_NOT_ALLOWED", "Unsupported method");
    }

    const data = await readBody(req);

    switch (route) {
      case "root": {
        if (data.clear === true) {
          manualRoot = null;
          json(res, 200, await state());
          return;
        }
        const target = requireString(data.path, "report folder", 4096);
        manualRoot = await canonicalProjectRoot(target);
        json(res, 200, await state());
        return;
      }
      case "create": {
        const root = await requireRoot();
        const { full, relative } = await prepareNew(root, String(data.file ?? ""));
        const templateId = requireString(data.templateId, "template id", 64);
        const styleFamily =
          typeof data.styleFamily === "string" &&
          Object.prototype.hasOwnProperty.call(STYLE_FAMILIES, data.styleFamily)
            ? (data.styleFamily as StyleFamilyId)
            : undefined;
        const locale = typeof data.locale === "string" ? data.locale : undefined;
        let document: ReportDocumentV1;
        try {
          document = buildTemplate(templateId, styleFamily, locale);
        } catch (error) {
          throw new ReportApiError(
            400,
            "UNKNOWN_TEMPLATE",
            error instanceof Error ? error.message : "Unknown template",
          );
        }
        const validation = validateReportDocument(document);
        if (!validation.ok) {
          json(res, 422, { code: "INVALID_DOCUMENT", errors: validation.errors });
          return;
        }
        const text = serializeReport(document);
        await withWriteLock(full, async () => {
          if (await fs.lstat(full).catch(() => null)) {
            throw new ReportApiError(409, "FILE_EXISTS", "Report file already exists");
          }
          const temp = await writeTempFile(full, text);
          try {
            await fs.link(temp, full);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "EEXIST") {
              throw new ReportApiError(409, "FILE_EXISTS", "Report file already exists");
            }
            throw error;
          } finally {
            await fs.rm(temp, { force: true });
          }
        });
        json(res, 200, {
          schemaVersion: RDM_SCHEMA_VERSION,
          file: relative,
          hash: sha256(text),
          document,
          warnings: validation.warnings,
          html: renderReportHtml(document),
        });
        return;
      }
      case "open": {
        const root = await requireRoot();
        const { full, relative } = await prepareExisting(root, String(data.file ?? ""));
        const text = await readReportFile(full);
        const parsed = parseReport(text);
        if (!parsed.ok) {
          json(res, 422, { code: "INVALID_DOCUMENT", errors: parsed.errors });
          return;
        }
        json(res, 200, {
          schemaVersion: RDM_SCHEMA_VERSION,
          file: relative,
          hash: sha256(text),
          document: parsed.document,
          warnings: parsed.warnings,
          html: renderReportHtml(parsed.document!),
        });
        return;
      }
      case "save": {
        const root = await requireRoot();
        const { full, relative } = await prepareExisting(root, String(data.file ?? ""));
        const expectedHash = requireString(data.expectedHash, "document hash", 64);
        const document = data.document;
        const validation = validateReportDocument(document);
        if (!validation.ok) {
          json(res, 422, { code: "INVALID_DOCUMENT", errors: validation.errors });
          return;
        }
        const text = serializeReport(document as ReportDocumentV1);
        await withWriteLock(full, async () => {
          const current = await readReportFile(full).catch(() => null);
          if (current === null) {
            throw new ReportApiError(404, "NOT_FOUND", "Report file was not found");
          }
          if (sha256(current) !== expectedHash) {
            throw new ReportApiError(
              409,
              "CONFLICT",
              "The report changed on disk; reopen it before saving",
            );
          }
          const temp = await writeTempFile(full, text);
          const latest = await readReportFile(full).catch(() => null);
          if (latest === null || sha256(latest) !== expectedHash) {
            await fs.rm(temp, { force: true });
            throw new ReportApiError(
              409,
              "CONFLICT",
              "The report changed on disk; reopen it before saving",
            );
          }
          await fs.rename(temp, full);
        });
        json(res, 200, {
          schemaVersion: RDM_SCHEMA_VERSION,
          file: relative,
          hash: sha256(text),
          warnings: validation.warnings,
          savedAt: (context.now?.() ?? new Date()).toISOString(),
        });
        return;
      }
      case "preview": {
        const validation = validateReportDocument(data.document);
        if (!validation.ok) {
          json(res, 422, { code: "INVALID_DOCUMENT", errors: validation.errors });
          return;
        }
        const sampleData = data.data && typeof data.data === "object" && !Array.isArray(data.data) ? data.data as Record<string, unknown> : {};
        const html = renderReportHtml(data.document as ReportDocumentV1, { data: sampleData });
        json(res, 200, { html, warnings: [...validation.warnings, ...parameterWarnings(data.document as ReportDocumentV1, sampleData)] });
        return;
      }
      case "export": {
        if (!isExportFormat(data.format)) {
          throw new ReportApiError(
            400,
            "UNSUPPORTED_FORMAT",
            "Supported export formats: html, csv, pdf, xlsx, docx",
          );
        }
        let result: ReturnType<typeof exportReport>;
        try {
          result = exportReport(
            data.document,
            data.format,
            data.data && typeof data.data === "object" && !Array.isArray(data.data)
              ? (data.data as Record<string, unknown>)
              : {},
          );
        } catch (error) {
          throw new ReportApiError(
            422,
            "EXPORT_FAILED",
            error instanceof Error ? error.message : "Export failed",
          );
        }
        json(res, 200, {
          schemaVersion: RDM_SCHEMA_VERSION,
          file: result.filename,
          mime: result.mime,
          base64: Buffer.from(result.bytes).toString("base64"),
          warnings: result.warnings,
        });
        return;
      }
      case "yrf/open": {
        const loaded = await loadYrfFile(data.path);
        const result = inspectYrf(loaded.text, loaded.hash);
        if (!result.ok) {
          json(res, 422, { code: "INVALID_YRF", error: result.error });
          return;
        }
        json(res, 200, {
          file: loaded.file,
          hash: loaded.hash,
          inspection: result.inspection,
          source: loaded.text,
        });
        return;
      }
      case "yrf/patch":
      case "yrf/save-copy": {
        const loaded = await loadYrfFile(data.path);
        const expectedHash = requireString(data.expectedHash, "yrf hash", 64);
        if (loaded.hash !== expectedHash) {
          throw new ReportApiError(409, "CONFLICT", "YRF changed on disk; reopen it");
        }
        const changes = readYrfChanges(data);
        const patched = applyYrfChanges(loaded.text, changes);
        if (!patched.ok) {
          throw new ReportApiError(422, "PATCH_REJECTED", patched.error);
        }
        if (route === "yrf/patch") {
          json(res, 200, {
            ok: true,
            changes: patched.changes,
            hash: sha256(patched.text),
            text: patched.text,
          });
          return;
        }
        await withWriteLock(loaded.file, async () => {
          const current = await readReportFile(loaded.file).catch(() => null);
          if (current === null || sha256(current) !== expectedHash) {
            throw new ReportApiError(409, "CONFLICT", "YRF changed on disk; reopen it");
          }
        });
        const copy = await writeYrfCopy(loaded.file, patched.text);
        json(res, 200, {
          ok: true,
          file: copy,
          hash: sha256(patched.text),
          source: patched.text,
          inspection: inspectYrf(patched.text).inspection,
          changes: patched.changes,
        });
        return;
      }
      case "yrf/source": {
        const loaded = await loadYrfFile(data.path);
        const expectedHash = requireString(data.expectedHash, "yrf hash", 64);
        if (loaded.hash !== expectedHash) {
          throw new ReportApiError(409, "CONFLICT", "YRF changed on disk; reopen it");
        }
        const text = data.text;
        if (typeof text !== "string" || text.length === 0) {
          throw new ReportApiError(400, "INVALID_SOURCE", "Source text is required");
        }
        if (new TextEncoder().encode(text).length > YRF_MAX_BYTES) {
          throw new ReportApiError(413, "FILE_TOO_LARGE", "Source exceeds the 5 MiB limit");
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
        } catch (error) {
          throw new ReportApiError(
            422,
            "INVALID_JSON",
            error instanceof Error ? error.message : "Source is not valid JSON",
          );
        }
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new ReportApiError(422, "INVALID_YRF", "Root must be a JSON object");
        }
        const inspection = inspectYrf(text);
        if (!inspection.ok) {
          throw new ReportApiError(422, "INVALID_YRF", inspection.error ?? "Invalid YRF structure");
        }
        await withWriteLock(loaded.file, async () => {
          const current = await readReportFile(loaded.file).catch(() => null);
          if (current === null || sha256(current) !== expectedHash) {
            throw new ReportApiError(409, "CONFLICT", "YRF changed on disk; reopen it");
          }
        });
        const copy = await writeYrfCopy(loaded.file, text);
        json(res, 200, {
          ok: true,
          file: copy,
          hash: sha256(text),
          source: text,
          inspection: inspection.inspection,
          warnings: inspection.inspection?.warnings ?? [],
        });
        return;
      }
      case "yrf/create": {
        if (data.acknowledge !== true) {
          throw new ReportApiError(
            403,
            "YRF_ACK_REQUIRED",
            "Creation is experimental; set acknowledge=true after reviewing the warnings",
          );
        }
        const target = requireYrfTarget(data.file);
        const templateId = requireString(data.templateId, "template id", 64);
        let document: ReportDocumentV1;
        try {
          document = buildTemplate(templateId);
        } catch (error) {
          throw new ReportApiError(
            400,
            "UNKNOWN_TEMPLATE",
            error instanceof Error ? error.message : "Unknown template",
          );
        }
        const created = createYrfFromNative(document);
        if (!created.ok || !created.text) {
          throw new ReportApiError(422, "YRF_CREATE_FAILED", created.error ?? "Creation failed");
        }
        const selfCheck = inspectYrf(created.text);
        if (!selfCheck.ok) {
          throw new ReportApiError(422, "YRF_SELF_CHECK_FAILED", selfCheck.error ?? "Self-check failed");
        }
        const text = created.text;
        await withWriteLock(target, async () => {
          if (await fs.lstat(target).catch(() => null)) {
            throw new ReportApiError(409, "FILE_EXISTS", "Target .yrf already exists");
          }
          const temp = await writeTempFile(target, text);
          try {
            await fs.link(temp, target);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "EEXIST") {
              throw new ReportApiError(409, "FILE_EXISTS", "Target .yrf already exists");
            }
            throw error;
          } finally {
            await fs.rm(temp, { force: true });
          }
        });
        json(res, 200, {
          ok: true,
          file: target,
          hash: sha256(text),
          source: text,
          warnings: [...created.warnings, ...(selfCheck.inspection?.warnings ?? [])],
          inspection: selfCheck.inspection,
        });
        return;
      }
      case "validate": {
        const validation = validateReportDocument(data.document);
        json(res, 200, {
          schemaVersion: RDM_SCHEMA_VERSION,
          ...validation,
        });
        return;
      }
      default:
        throw new ReportApiError(404, "UNKNOWN_ENDPOINT", "Unknown report endpoint");
    }
  };

  return {
    async handle(req, res, url) {
      try {
        await handle(req, res, url);
      } catch (error) {
        if (error instanceof ReportApiError) {
          json(res, error.status, { error: error.message, code: error.code });
          return;
        }
        json(res, 400, {
          error: error instanceof Error ? error.message : "Report request failed",
          code: "REPORT_ERROR",
        });
      }
    },
  };
}
