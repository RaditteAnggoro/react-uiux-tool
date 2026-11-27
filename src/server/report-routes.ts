/** Copyright (c) 2026 RA. Report Studio API: bounded, local-first, no vendor runtime. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
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
import { applyYrfChanges, parseUniqueJson, type YrfChange } from "../reports/formats/yrf/patch.js";
import { createYrfFromNative } from "../reports/formats/yrf/create.js";
import { hasYrfScriptField, isYrfLocalField, yrfObjectCapability } from "../reports/formats/yrf/capabilities.js";
import { parameterWarnings } from "../reports/core/parameters.js";
import { appendReportSections, applyLinkedReportArguments, REPORT_PATH_SEGMENT } from "../reports/core/subreport.js";
import type { ReportDocumentV1 } from "../reports/index.js";

const MAX_REPORT_BODY = DEFAULT_LIMITS.maxBytes;
const FILE_NAME = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} ._-]{0,120}\.report\.json$/iu;

function protectedYrfObjects(value: unknown): Map<string, unknown> {
  const protectedObjects = new Map<string, unknown>();
  const visit = (entry: unknown, segments: (string | number)[]) => {
    if (!entry || typeof entry !== "object") return;
    if (Array.isArray(entry)) {
      if (segments.at(-1) === "objects") {
        const opaque = entry.filter(item => item && typeof item === "object" && typeof item.type === "string" &&
          yrfObjectCapability(item.type) !== "visual");
        if (opaque.length) {
          const editableBand = segments[0] === "layout" && (
            (segments.length === 3 && (segments[1] === "reportHeader" || segments[1] === "reportFooter")) ||
            (segments.length === 6 && segments[1] === "pages" && typeof segments[2] === "number" &&
              segments[3] === "bands" && typeof segments[4] === "number")
          );
          const protectedFields = editableBand ? opaque.map(item =>
            Object.fromEntries(Object.entries(item).map(([key, value]) => [key,
              isYrfLocalField(item.type, key, value, item.formatType) ? ["editable", typeof value] : ["protected", value],
            ])),
          ) : opaque;
          protectedObjects.set(JSON.stringify([...segments, "opaque"]), protectedFields);
        }
      }
      entry.forEach((item, index) => visit(item, [...segments, index]));
      return;
    }
    const properties = Object.entries(entry);
    const scripts = properties.filter(([key]) => hasYrfScriptField(key));
    if (scripts.length) {
      if (segments.at(-2) === "objects" && typeof segments.at(-1) === "number") {
        protectedObjects.set(JSON.stringify(segments), entry);
      } else {
        for (const [key, script] of scripts) protectedObjects.set(JSON.stringify([...segments, key]), script);
      }
    }
    for (const [key, item] of properties) visit(item, [...segments, key]);
  };
  visit(value, []);
  return protectedObjects;
}

function validateYrfSourceChange(original: string, source: unknown) {
  if (typeof source !== "string" || !source.trim()) throw new ReportApiError(400, "INVALID_SOURCE", "Source text is required");
  if (Buffer.byteLength(source, "utf8") > YRF_MAX_BYTES) throw new ReportApiError(413, "FILE_TOO_LARGE", "Source exceeds the 5 MiB limit");
  const inspection = inspectYrf(source);
  if (!inspection.ok) throw new ReportApiError(422, "INVALID_YRF", inspection.error ?? "Invalid YRF structure");
  let before: unknown;
  let after: unknown;
  try {
    before = parseUniqueJson(original.replace(/^\uFEFF/, ""));
    after = parseUniqueJson(source.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new ReportApiError(422, "INVALID_YRF", (error as Error).message);
  }
  if (!isDeepStrictEqual(protectedYrfObjects(before), protectedYrfObjects(after))) {
    throw new ReportApiError(422, "PATCH_REJECTED", "YRF scripts, scripted objects and protected object properties must remain unchanged.");
  }
  return { source, inspection: inspection.inspection };
}

export interface ReportApiContext {
  currentProjectRoot: () => string | null;
  origin: () => string;
  settingsDirectory: string;
  defaultDirectory: string;
  reportSettingsError: () => void;
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
 * In-process write lock per absolute path. YRF also coordinates participating
 * Studio processes through an exclusive sibling lock.
 */
const writeLocks = new Map<string, Promise<unknown>>();

async function withWriteLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = writeLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => gate);
  writeLocks.set(key, queued);
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (writeLocks.get(key) === queued) writeLocks.delete(key);
  }
}

async function writeTempFile(full: string, text: string, mode = 0o644): Promise<string> {
  const temp = path.join(
    path.dirname(full),
    `.${path.basename(full)}.tmp-${randomBytes(6).toString("hex")}`,
  );
  const handle = await fs.open(temp, "wx", mode);
  try {
    try {
      await handle.writeFile(text, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => undefined);
    throw error;
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

async function withYrfWriteLock<T>(file: string, task: () => Promise<T>): Promise<T> {
  return withWriteLock(file, async () => {
    await assertNoSymlinkAncestors(file);
    const basename = path.basename(file);
    const key = sha256(process.platform === "win32" ? basename.toLowerCase() : basename);
    const lock = path.join(path.dirname(file), `.uiux-yrf-${key}.lock`);
    const handle = await fs.open(lock, "wx", 0o600).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") {
        throw new ReportApiError(409, "YRF_WRITE_LOCKED", "Another Studio may be saving this YRF. Retry when its save finishes.");
      }
      throw error;
    });
    try {
      return await task();
    } finally {
      // Closing first also allows unlinking the lock on Windows.
      await handle.close();
      await fs.unlink(lock);
    }
  });
}

async function saveYrfCopy(file: string, expectedHash: string, text: string): Promise<string> {
  return withYrfWriteLock(file, async () => {
    const latest = await loadYrfFile(file);
    if (latest.file !== file || latest.hash !== expectedHash) {
      throw new ReportApiError(409, "CONFLICT", "YRF changed on disk; reopen it");
    }
    return writeYrfCopy(file, text);
  });
}

/** A participating Studio holds the sibling lock. External editors can still ignore it. */
async function saveYrfInPlace(file: string, expectedHash: string, text: string): Promise<void> {
  return withYrfWriteLock(file, async () => {
    const loaded = await loadYrfFile(file);
    if (loaded.file !== file || loaded.hash !== expectedHash) throw new ReportApiError(409, "CONFLICT", "YRF changed on disk; the draft was not saved");
    const mode = (await fs.stat(file)).mode & 0o777;
    const temp = await writeTempFile(file, text);
    try {
      await fs.chmod(temp, mode);
      const latest = await loadYrfFile(file);
      if (latest.file !== file || latest.hash !== expectedHash) throw new ReportApiError(409, "CONFLICT", "YRF changed on disk; the draft was not saved");
      await fs.rename(temp, file);
      const saved = await loadYrfFile(file);
      if (saved.hash !== sha256(text)) throw new ReportApiError(500, "SAVE_VERIFY_FAILED", "Saved file could not be verified; inspect the file before continuing");
    } finally { await fs.rm(temp, { force: true }); }
  });
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

export async function createReportApi(context: ReportApiContext): Promise<ReportApi> {
  const preferenceFile = path.join(context.settingsDirectory, "report-folder.json");
  const validateSelectedRoot = async (root: string) => {
    const canonical = await canonicalProjectRoot(root).catch(() => null);
    return canonical === root ? root : null;
  };
  let reportRoot: string | null = null;
  try {
    const saved: unknown = JSON.parse(await fs.readFile(preferenceFile, "utf8"));
    if (typeof saved === "string" && path.isAbsolute(saved)) {
      reportRoot = await validateSelectedRoot(saved);
    }
  } catch {
    // Missing, invalid, or no longer accessible. The launcher can use its default folder.
  }
  let rootSource: "manual" | "default" = "manual";
  const openedYrfFiles = new Set<string>();

  const availableRoot = () => reportRoot ? validateSelectedRoot(reportRoot) : Promise.resolve(null);

  const rememberRoot = async (root: string | null) => {
    let temp: string | undefined;
    try {
      await fs.mkdir(context.settingsDirectory, { recursive: true, mode: 0o700 });
      temp = await writeTempFile(preferenceFile, JSON.stringify(root), 0o600);
      await fs.rename(temp, preferenceFile);
    } catch {
      context.reportSettingsError();
    } finally {
      if (temp) await fs.rm(temp, { force: true }).catch(() => undefined);
    }
  };

  const requireRoot = async (): Promise<string> => {
    const root = reportRoot ? await availableRoot() : context.currentProjectRoot();
    if (!root) {
      throw new ReportApiError(
        409,
        "NO_REPORT_ROOT",
        "Open a project or choose a report folder first",
      );
    }
    return reportRoot ? root : canonicalProjectRoot(root);
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
    const source = rootSource;
    const root = await availableRoot();
    return {
      schemaVersion: RDM_SCHEMA_VERSION,
      root,
      context: contextRoot,
      source: root ? source : null,
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
      !REPORT_PATH_SEGMENT.test(segments[segments.length - 1] ?? "")
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

  const resolveLinkedReports = async (document: ReportDocumentV1, expectedRoot: unknown, currentFile: unknown, sample: Record<string, unknown>) => {
    if (!document.linkedReports?.length) return document;
    const root = await requireRoot();
    if (expectedRoot !== root) {
      throw new ReportApiError(409, "REPORT_FOLDER_CHANGED", "Select the original report folder to resolve linked reports.");
    }
    const supplied = sample.parameters;
    const sampleIds = supplied && typeof supplied === "object" ? Object.keys(supplied) : [];
    const ancestors = new Set<string>();
    if (typeof currentFile === "string" && currentFile) ancestors.add((await prepareExisting(root, currentFile)).full);
    let count = 0;
    let bytes = 0;
    const visit = async (input: ReportDocumentV1, depth: number): Promise<ReportDocumentV1> => {
      const { linkedReports, linkedReportArguments, ...report } = input;
      let expanded = report;
      for (const link of linkedReports ?? []) {
        if (depth >= 4 || ++count > 16) {
          throw new ReportApiError(422, "LINKED_REPORT_LIMIT", "Linked reports exceed the nesting or file limit.");
        }
        const { full } = await prepareExisting(root, link);
        if (ancestors.has(full)) throw new ReportApiError(422, "LINKED_REPORT_CYCLE", `Linked report cycle at ${link}`);
        const text = await readReportFile(full);
        bytes += Buffer.byteLength(text, "utf8");
        if (bytes > DEFAULT_LIMITS.maxBytes) {
          throw new ReportApiError(413, "LINKED_REPORT_LIMIT", "Linked reports exceed the combined 5 MiB limit.");
        }
        const parsed = parseReport(text);
        if (!parsed.ok || !parsed.document) throw new ReportApiError(422, "INVALID_LINKED_REPORT", `Linked report is invalid: ${link}`);
        const prefix = `link-${count}`;
        ancestors.add(full);
        const child = await visit(parsed.document, depth + 1);
        ancestors.delete(full);
        try {
          const args = linkedReportArguments?.[link];
          const scoped = args && Object.keys(args).length ? applyLinkedReportArguments(expanded, child, prefix, args, sampleIds) : child;
          expanded = appendReportSections(expanded, scoped, prefix);
        } catch (error) {
          throw new ReportApiError(422, "INVALID_LINKED_REPORT", `${link}: ${(error as Error).message}`);
        }
      }
      return expanded;
    };
    const expanded = await visit(document, 0);
    const validation = validateReportDocument(expanded);
    if (!validation.ok) {
      const issue = validation.errors[0];
      throw new ReportApiError(422, "INVALID_LINKED_REPORT", `${issue?.path ?? "$"}: ${issue?.message ?? "Invalid combined report"}`);
    }
    return expanded;
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
        await availableRoot() ??
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
        const next = await withWriteLock(preferenceFile, async () => {
          if (data.clear === true) {
            await rememberRoot(null);
            reportRoot = null;
          } else if (data.useDefault === true) {
            if (!await availableRoot()) {
              const parent = path.dirname(context.defaultDirectory);
              await fs.mkdir(parent, { recursive: true, mode: 0o700 });
              const target = path.join(await canonicalProjectRoot(parent), path.basename(context.defaultDirectory));
              await fs.mkdir(target, { recursive: true, mode: 0o700 });
              if ((await fs.lstat(target)).isSymbolicLink()) {
                throw new ReportApiError(400, "UNSAFE_PATH", "The default report folder cannot be a symbolic link.");
              }
              reportRoot = await canonicalProjectRoot(target);
              rootSource = "default";
            }
          } else {
            const target = requireString(data.path, "report folder", 4096);
            const selected = await canonicalProjectRoot(target);
            await rememberRoot(selected);
            reportRoot = selected;
            rootSource = "manual";
          }
          return state();
        });
        json(res, 200, next);
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
          root,
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
          root,
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
        if (data.expectedRoot !== undefined && data.expectedRoot !== root) {
          throw new ReportApiError(409, "REPORT_FOLDER_CHANGED", "The report folder changed. Select the original folder before saving.");
        }
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
          try {
            await fs.rename(temp, full);
          } finally {
            await fs.rm(temp, { force: true });
          }
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
        const document = await resolveLinkedReports(data.document as ReportDocumentV1, data.expectedRoot, data.file, sampleData);
        const html = renderReportHtml(document, { data: sampleData });
        json(res, 200, { html, warnings: [...validation.warnings, ...parameterWarnings(document, sampleData)] });
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
        const validation = validateReportDocument(data.document);
        if (!validation.ok) {
          json(res, 422, { code: "INVALID_DOCUMENT", errors: validation.errors });
          return;
        }
        const sampleData = data.data && typeof data.data === "object" && !Array.isArray(data.data) ? data.data as Record<string, unknown> : {};
        const document = await resolveLinkedReports(data.document as ReportDocumentV1, data.expectedRoot, data.file, sampleData);
        let result: ReturnType<typeof exportReport>;
        try {
          result = exportReport(
            document,
            data.format,
            sampleData,
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
        let target = data.path;
        if (data.sibling !== undefined) {
          const current = requireString(data.path, "opened yrf path", 4096);
          const sibling = requireString(data.sibling, "linked yrf name", 165);
          if (!openedYrfFiles.has(current)) throw new ReportApiError(403, "YRF_NOT_OPEN", "Open the parent report first");
          if (!/\.yrf$/i.test(sibling) || !isYrfLocalField("subReport", "reportName", sibling)) {
            throw new ReportApiError(400, "INVALID_YRF_LINK", "Linked report must be a same-folder .yrf file name");
          }
          target = path.join(path.dirname(current), sibling);
        }
        const loaded = await loadYrfFile(target);
        const result = inspectYrf(loaded.text, loaded.hash);
        if (!result.ok) {
          json(res, 422, { code: "INVALID_YRF", error: result.error });
          return;
        }
        openedYrfFiles.add(loaded.file);
        json(res, 200, {
          file: loaded.file,
          hash: loaded.hash,
          inspection: result.inspection,
          source: loaded.text,
        });
        return;
      }
      case "yrf/save-source":
      case "yrf/source": {
        const inPlace = route === "yrf/save-source";
        if (inPlace && data.approved !== true) throw new ReportApiError(403, "APPROVAL_REQUIRED", "Explicit overwrite approval is required");
        const loaded = await loadYrfFile(data.path);
        if (inPlace && !openedYrfFiles.has(loaded.file)) throw new ReportApiError(403, "YRF_NOT_OPEN", "Open this report before saving it");
        const expectedHash = requireString(data.expectedHash, "yrf hash", 64);
        if (loaded.hash !== expectedHash) throw new ReportApiError(409, "CONFLICT", "YRF changed on disk; reopen it");
        const { source, inspection } = validateYrfSourceChange(loaded.text, inPlace ? data.source : data.text);
        let file = loaded.file;
        if (inPlace) {
          await saveYrfInPlace(file, expectedHash, source);
        } else {
          file = await saveYrfCopy(file, expectedHash, source);
          openedYrfFiles.add(file);
        }
        json(res, 200, {
          ok: true,
          file,
          hash: sha256(source),
          source,
          inspection,
          warnings: inspection?.warnings ?? [],
        });
        return;
      }
      case "yrf/patch":
      case "yrf/save":
      case "yrf/save-copy": {
        if (route === "yrf/save" && data.approved !== true) throw new ReportApiError(403, "APPROVAL_REQUIRED", "Explicit Save action is required");
        const loaded = await loadYrfFile(data.path);
        if (route === "yrf/save" && !openedYrfFiles.has(loaded.file)) throw new ReportApiError(403, "YRF_NOT_OPEN", "Open this report before saving it");
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
        if (route === "yrf/save") {
          const inspected = inspectYrf(patched.text);
          if (!inspected.ok) throw new ReportApiError(422, "INVALID_YRF", inspected.error ?? "Invalid YRF structure");
          await saveYrfInPlace(loaded.file, expectedHash, patched.text);
          json(res, 200, { ok: true, file: loaded.file, hash: sha256(patched.text), source: patched.text, inspection: inspected.inspection, changes: patched.changes });
          return;
        }
        const copy = await saveYrfCopy(loaded.file, expectedHash, patched.text);
        openedYrfFiles.add(copy);
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
          document = buildTemplate(templateId, undefined, typeof data.locale === "string" ? data.locale : undefined);
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
        openedYrfFiles.add(await fs.realpath(target));
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
