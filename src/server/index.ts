/** Copyright (c) 2026 RA. Local capability-protected controller. */
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import fs from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SourceDraft } from "../engine/draft.js";
import { pickDirectory } from "./folder-picker.js";
import { createReportApi } from "./report-routes.js";
import { runProjectBuild } from "./build.js";
import type { ViteDevServer } from "vite";
import type {
  AnalysisReport,
  Checkpoint,
  SourcePatch,
} from "../engine/types.js";
import {
  previewCreation,
  createProject,
  type TemplateInput,
} from "../templates/index.js";
import { PROJECT_ORIGIN, VERSION } from "../provenance.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const MAX_BODY = 128 * 1024;
interface Recent {
  path: string;
  name: string;
  openedAt: string;
}
export interface StudioOptions {
  port?: number;
  initialPath?: string;
  dev?: boolean;
  recentDirectory?: string;
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
async function body(req: IncomingMessage): Promise<Record<string, any>> {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new Error("Expected application/json");
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > MAX_BODY)
      throw new Error("Request body exceeds the size limit");
  }
  const value = JSON.parse(text || "{}");
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a JSON object");
  return value;
}
function approved(data: Record<string, any>) {
  if (data.approved !== true)
    throw new Error("Explicit approval is required for this action");
}
function string(value: unknown, label: string) {
  if (typeof value !== "string" || !value || value.length > 8192)
    throw new Error(`Invalid ${label}`);
  return value;
}
function mime(file: string) {
  return (
    (
      {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".md": "text/plain; charset=utf-8",
        ".json": "application/json",
      } as Record<string, string>
    )[path.extname(file)] || "application/octet-stream"
  );
}

export async function startStudio(options: StudioOptions = {}) {
  const token = randomBytes(32).toString("hex");
  const recentDirectory =
    options.recentDirectory || path.join(os.homedir(), ".react-uiux-tool");
  let recent: Recent[] = [];
  try {
    const saved = JSON.parse(
      await fs.readFile(path.join(recentDirectory, "recent.json"), "utf8"),
    );
    if (Array.isArray(saved))
      recent = saved
        .filter((r) => typeof r.path === "string" && typeof r.name === "string")
        .slice(0, 10);
  } catch {
    /* First launch or invalid local metadata. */
  }
  let report: AnalysisReport | null = null;
  let staged: SourcePatch | null = null;
  let draft: SourceDraft | null = null;
  let buildRunning = false;

  const draftSnapshotPath = () =>
    path.join(
      os.tmpdir(),
      `uiux-draft-${createHash("sha256").update(current().projectRoot).digest("hex").slice(0, 24)}.json`,
    );
  const persistDraft = async () => {
    if (!draft) return;
    try {
      await fs.writeFile(draftSnapshotPath(), JSON.stringify(draft.toSnapshot()), { mode: 0o600 });
    } catch {
      // Snapshot persistence is best-effort; the in-memory draft remains authoritative.
    }
  };
  const clearDraftSnapshot = async () => {
    try {
      await fs.unlink(draftSnapshotPath());
    } catch {
      // No snapshot to clear.
    }
  };
  const restoreDraft = async () => {
    if (draft) return;
    try {
      const raw = await fs.readFile(draftSnapshotPath(), "utf8");
      draft = await SourceDraft.fromSnapshot(current().projectRoot, JSON.parse(raw));
    } catch {
      // Missing or invalid snapshot: start without a draft.
    }
  };
  let checkpoint: Checkpoint | null = null;
  let watchers: FSWatcher[] = [];
  let watchGeneration = 0;
  let sourceChanged = false;
  let watchingIncomplete = false;
  let analysisController: AbortController | null = null;
  let progress = { files: 0, file: "", running: false };
  let mutationBusy = false;
  let previewImpl: import("./preview.js").ProjectPreview | null = null;
  const preview = {
    get url() {
      return previewImpl?.url ?? null;
    },
    async start(value: AnalysisReport, studioOrigin: string) {
      previewImpl ??= new (await import("./preview.js")).ProjectPreview();
      return previewImpl.start(value, studioOrigin);
    },
    async overlay(patch: SourcePatch | null) {
      await previewImpl?.overlay(patch);
    },
    async draftOverlay(sources: ReadonlyMap<string, string>) {
      await previewImpl?.draftOverlay(sources);
    },
    async design(target: { file: string; componentName: string } | null) {
      if (!previewImpl) throw new Error("Start the approved preview first");
      return previewImpl.design(
        target
          ? {
              ...target,
              defaultExported: false,
            }
          : null,
      );
    },
    async stop() {
      const running = previewImpl;
      previewImpl = null;
      await running?.stop();
    },
  };
  const tempDirectories: string[] = [];
  const logs: string[] = [];
  let vite: ViteDevServer | null = null;
  let origin = "";
  const current = () => {
    if (!report) throw new Error("Open a project first");
    return report;
  };
  async function analyze(root: string) {
    analysisController?.abort();
    analysisController = new AbortController();
    progress = { files: 0, file: "", running: true };
    try {
      const { analyzeProject } = await import("../engine/index.js");
      const next = await analyzeProject(root, {
        signal: analysisController.signal,
        onProgress: (files, file) => {
          progress = { files, file, running: true };
        },
      });
      report = next;
      sourceChanged = false;
      watchingIncomplete = false;
      ++watchGeneration;
      for (const active of watchers) active.close();
      watchers = [];
      const generation = watchGeneration;
      const directories = new Set([
        next.projectRoot,
        ...next.files.map((file) =>
          path.dirname(path.join(next.projectRoot, file.file)),
        ),
      ]);
      for (const directory of directories) {
        try {
          const active = watch(directory, (_event, filename) => {
            const changed = filename ? String(filename) : "";
            const ignored =
              changed.startsWith(".") ||
              /^(?:node_modules|dist|build|coverage)$/.test(changed);
            const relevant =
              !ignored &&
              (!changed ||
                !path.extname(changed) ||
                /\.(?:[cm]?[jt]sx?|css|scss|sass|less|json)$/.test(changed) ||
                /^(?:pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|package-lock\.json)$/.test(
                  changed,
                ));
            if (generation === watchGeneration && relevant)
              sourceChanged = true;
          });
          active.on("error", (error) => {
            if (generation !== watchGeneration) return;
            watchingIncomplete = true;
            logs.push(
              `Source watching stopped for ${path.relative(next.projectRoot, directory) || "."}: ${error.message}`,
            );
            active.close();
            watchers = watchers.filter((candidate) => candidate !== active);
          });
          watchers.push(active);
        } catch (error) {
          watchingIncomplete = true;
          logs.push(
            `Source watching unavailable for ${path.relative(next.projectRoot, directory) || "."}: ${error instanceof Error ? error.message : "unknown error"}`,
          );
        }
      }
      return next;
    } finally {
      progress.running = false;
    }
  }
  async function remember(next: AnalysisReport) {
    recent = [
      {
        path: next.projectRoot,
        name: next.name,
        openedAt: new Date().toISOString(),
      },
      ...recent.filter((r) => r.path !== next.projectRoot),
    ].slice(0, 10);
    try {
      await fs.mkdir(recentDirectory, { recursive: true, mode: 0o700 });
      await fs.writeFile(
        path.join(recentDirectory, "recent.json"),
        JSON.stringify(recent, null, 2),
        { mode: 0o600 },
      );
    } catch {
      logs.push("Recent projects could not be persisted.");
    }
  }
  async function refreshAfterWrite() {
    let warning = false;
    try { await preview.overlay(null); } catch { warning = true; }
    let analysis = current();
    try { analysis = await analyze(analysis.projectRoot); } catch { warning = true; }
    if (warning) {
      sourceChanged = true;
      logs.push("Source was changed, but the preview or analysis could not be refreshed. Re-analyze the project.");
    }
    return { analysis, refreshFailed: warning };
  }
  const reports = createReportApi({
    currentProjectRoot: () => report?.projectRoot ?? null,
    origin: () => origin,
  });
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    let locked = false;
    try {
      if (
        req.headers.host !== new URL(origin).host ||
        (req.headers.origin && req.headers.origin !== origin) ||
        ["cross-site", "same-site"].includes(
          String(req.headers["sec-fetch-site"]),
        )
      ) {
        json(res, 403, {
          error: "Origin or Host is not allowed",
          code: "FORBIDDEN",
        });
        return;
      }
      const url = new URL(req.url || "/", origin);
      const api = url.pathname.startsWith("/api/");
      if (api) {
        if (url.pathname !== "/api/session") {
          const candidate = req.headers["x-uiux-token"];
          if (
            typeof candidate !== "string" ||
            candidate.length !== token.length ||
            !timingSafeEqual(Buffer.from(candidate), Buffer.from(token))
          ) {
            json(res, 401, {
              error: "Missing or invalid session capability",
              code: "UNAUTHORIZED",
            });
            return;
          }
        }
        if (url.pathname.startsWith("/api/reports/")) {
          await reports.handle(req, res, url);
          return;
        }
        if (req.method === "GET") {
          if (url.pathname === "/api/session") {
            json(res, 200, {
              token,
              version: VERSION,
              cwd: process.cwd(),
              home: os.homedir(),
              recent,
              initialPath: options.initialPath,
              origin: PROJECT_ORIGIN,
            });
            return;
          }
          if (url.pathname === "/api/status") {
            json(res, 200, {
              preview: preview.url,
              logs: logs.slice(-50),
              sourceChanged,
              watchingIncomplete,
              projectRoot: report?.projectRoot ?? null,
              progress,
            });
            return;
          }
          if (url.pathname === "/api/tree") {
            const directory = url.searchParams.get("path") || "";
            const { listProjectDirectory } = await import("../engine/index.js");
            json(
              res,
              200,
              await listProjectDirectory(current().projectRoot, directory),
            );
            return;
          }
          if (url.pathname === "/api/source") {
            const file = string(url.searchParams.get("file"), "source path");
            const { readProjectFile, hashSource } = await import("../engine/index.js");
            const source = draft ? await draft.source(file) : await readProjectFile(current().projectRoot, file);
            json(res, 200, {
              source,
              hash: hashSource(source),
              draft: !!draft,
            });
            return;
          }
          json(res, 404, { error: "Unknown API endpoint" });
          return;
        }
        if (req.method !== "POST" || req.headers.origin !== origin) {
          json(res, 403, {
            error: "A same-origin POST is required",
            code: "FORBIDDEN",
          });
          return;
        }
        const data = await body(req);
        if (url.pathname === "/api/analyze/cancel") {
          analysisController?.abort();
          json(res, 200, { ok: true });
          return;
        }
        if (mutationBusy) {
          const action = ({
            "/api/open": "open the project",
            "/api/analyze": "analyze the project",
            "/api/preview/design": "switch the design view",
            "/api/edit": "save the edit",
            "/api/edit-group": "save the group edit",
            "/api/undo": "undo the last edit",
          } as Record<string, string>)[url.pathname] ?? "repeat the selected action";
          json(res, 409, {
            error: `Another operation is still running. This action was not performed; wait, then ${action}.`,
            code: "BUSY",
          });
          return;
        }
        mutationBusy = true;
        locked = true;
        if (["/api/analyze", "/api/patch", "/api/edit", "/api/edit-group", "/api/apply", "/api/undo", "/api/discard", "/api/draft/edit", "/api/draft/edit-group", "/api/draft/undo", "/api/draft/redo", "/api/draft/commit", "/api/draft/discard", "/api/draft/preview", "/api/draft/state"].includes(url.pathname) && data.expectedProject !== current().projectRoot)
          throw new Error("Project changed in another tab; reopen your project before editing.");
        if (draft && ["/api/open", "/api/demo", "/api/create", "/api/analyze", "/api/edit", "/api/edit-group", "/api/patch", "/api/apply", "/api/undo"].includes(url.pathname)) {
          let reopeningSameProject = false;
          if (url.pathname === "/api/open" && typeof data.path === "string") {
            try {
              reopeningSameProject = (await fs.realpath(data.path)) === (await fs.realpath(current().projectRoot));
            } catch {
              reopeningSameProject = false;
            }
          }
          if (!reopeningSameProject)
            throw new Error("Save or discard the current draft before switching projects or editing committed source.");
        }
        switch (url.pathname) {
          case "/api/open": {
            const root = string(data.path, "project path");
            const next = await analyze(root);
            await preview.stop();
            staged = null;
            checkpoint = null;
            await remember(next);
            json(res, 200, next);
            return;
          }
          case "/api/demo": {
            await preview.stop();
            const root = await fs.mkdtemp(
              path.join(os.tmpdir(), "react-uiux-demo-"),
            );
            tempDirectories.push(root);
            await fs.cp(path.join(packageRoot, "fixtures/demo"), root, {
              recursive: true,
              filter: (source) =>
                !source.split(path.sep).includes("node_modules"),
            });
            staged = null;
            checkpoint = null;
            json(res, 200, await analyze(root));
            return;
          }
          case "/api/analyze": {
            json(res, 200, await analyze(current().projectRoot));
            return;
          }
          case "/api/create/plan": {
            json(res, 200, await previewCreation(data as TemplateInput));
            return;
          }
          case "/api/create": {
            approved(data);
            const plan = await createProject(data as TemplateInput);
            let analysis: AnalysisReport;
            try {
              await preview.stop();
              staged = null;
              checkpoint = null;
              analysis = await analyze(plan.targetDirectory);
            }
            catch { throw new Error(`Project files were created at ${plan.targetDirectory}, but analysis failed. Open that folder to retry; do not create it again.`); }
            await remember(analysis);
            json(res, 200, { plan, analysis });
            return;
          }
          case "/api/preview/start": {
            approved(data);
            const result = await preview.start(current(), origin);
            if (staged) await preview.overlay(staged);
            logs.push(
              "Started approved instrumented Vite preview on loopback.",
            );
            json(res, 200, result);
            return;
          }
          case "/api/preview/stop": {
            await preview.stop();
            json(res, 200, { ok: true });
            return;
          }
          case "/api/preview/design": {
            approved(data);
            if (data.clear === true) {
              json(res, 200, await preview.design(null));
              return;
            }
            const file = string(data.file, "design source file");
            const componentName = string(
              data.componentName,
              "design component name",
            );
            json(res, 200, await preview.design({ file, componentName }));
            return;
          }
          case "/api/patch": {
            if (staged)
              throw new Error(
                "Review/apply or discard the pending patch before staging another change",
              );
            const { createPatch } = await import("../engine/index.js");
            const patch = await createPatch(current().projectRoot, data as any);
            staged = patch;
            await preview.overlay(patch);
            json(res, 200, patch);
            return;
          }
          case "/api/build": {
            if (!current().projectRoot) throw new Error("Open a project before building.");
            if (buildRunning) {
              json(res, 409, { error: "A build is already running.", code: "BUILD_RUNNING" });
              return;
            }
            buildRunning = true;
            try {
              const result = await runProjectBuild(current().projectRoot);
              json(res, 200, result);
            } finally {
              buildRunning = false;
            }
            return;
          }
          case "/api/draft/state": {
            await restoreDraft();
            if (!draft) {
              json(res, 200, { open: false });
              return;
            }
            const analysis = await draft.analysis();
            json(res, 200, {
              open: true,
              count: draft.count,
              canRedo: draft.canRedo,
              files: [...draft.sources.keys()],
              analysis,
            });
            return;
          }
          case "/api/draft/edit":
          case "/api/draft/edit-group": {
            if (staged) throw new Error("Discard the pending reviewed patch before starting a draft.");
            const { SourceDraft } = await import("../engine/index.js");
            const next = draft ?? new SourceDraft(current().projectRoot);
            const result = url.pathname === "/api/draft/edit"
              ? await next.edit(data as any)
              : await next.editGroup(Array.isArray(data.items) ? data.items as any : []);
            draft = next;
            await persistDraft();
            json(res, 200, { ...result, count: next.count, canRedo: next.canRedo });
            return;
          }
          case "/api/draft/undo":
          case "/api/draft/redo": {
            if (!draft) throw new Error("No draft is open.");
            const patch = url.pathname.endsWith("undo") ? draft.undoChange : draft.redoChange;
            const analysis = url.pathname.endsWith("undo") ? await draft.undo() : await draft.redo();
            await persistDraft();
            json(res, 200, { analysis, patch, count: draft.count, canRedo: draft.canRedo });
            return;
          }
          case "/api/draft/commit": {
            approved(data);
            if (!draft) throw new Error("No draft is open.");
            const checkpoints = await draft.commit(true);
            await clearDraftSnapshot();
            checkpoint = checkpoints.length === 1 ? checkpoints[0]! : null;
            draft = null;
            const refreshed = await refreshAfterWrite();
            json(res, 200, { ...refreshed, checkpoints: checkpoints.map(({ id, file, appliedAt }) => ({ id, file, appliedAt })) });
            return;
          }
          case "/api/draft/preview": {
            if (!draft) throw new Error("No draft is open.");
            await preview.draftOverlay(draft.sources);
            json(res, 200, { ok: true });
            return;
          }
          case "/api/draft/discard": {
            if (!draft) throw new Error("No draft is open.");
            draft = null;
            json(res, 200, await refreshAfterWrite());
            return;
          }
          case "/api/edit": {
            if (staged)
              throw new Error(
                "Discard the pending reviewed patch before using direct source editing",
              );
            const { createPatch, applyPatch } = await import(
              "../engine/index.js"
            );
            const patch = await createPatch(current().projectRoot, data as any);
            checkpoint = await applyPatch(current().projectRoot, patch, true);
            logs.push(`Saved ${patch.operation} directly to ${patch.file}.`);
            const refreshed = await refreshAfterWrite();
            json(res, 200, {
              patch,
              ...refreshed,
              checkpoint: {
                id: checkpoint.id,
                file: checkpoint.file,
                appliedAt: checkpoint.appliedAt,
              },
            });
            return;
          }
          case "/api/edit-group": {
            if (staged)
              throw new Error(
                "Discard the pending reviewed patch before grouped positioning",
              );
            if (!Array.isArray(data.items))
              throw new Error("Grouped positioning requires selected items");
            const { createMultiStylePatch, applyPatch } = await import(
              "../engine/index.js"
            );
            const patch = await createMultiStylePatch(
              current().projectRoot,
              data.items,
            );
            checkpoint = await applyPatch(current().projectRoot, patch, true);
            logs.push(
              `Saved grouped positioning for ${data.items.length} items to ${patch.file}.`,
            );
            const refreshed = await refreshAfterWrite();
            json(res, 200, {
              patch,
              ...refreshed,
              checkpoint: {
                id: checkpoint.id,
                file: checkpoint.file,
                appliedAt: checkpoint.appliedAt,
              },
            });
            return;
          }
          case "/api/apply": {
            approved(data);
            if (!staged || data.patchId !== staged.id)
              throw new Error("The reviewed patch is no longer available");
            const { applyPatch } = await import("../engine/index.js");
            checkpoint = await applyPatch(current().projectRoot, staged, true);
            staged = null;
            const refreshed = await refreshAfterWrite();
            json(res, 200, {
              ...refreshed,
              checkpoint: {
                id: checkpoint.id,
                file: checkpoint.file,
                appliedAt: checkpoint.appliedAt,
              },
            });
            return;
          }
          case "/api/undo": {
            approved(data);
            if (staged)
              throw new Error(
                "Discard the pending draft before restoring an applied change",
              );
            if (!checkpoint)
              throw new Error(
                "No applied checkpoint is available in this session",
              );
            if (data.expectedCheckpoint !== checkpoint.id)
              throw new Error("Undo checkpoint changed in another tab; no file was changed.");
            const { undoPatch } = await import("../engine/index.js");
            await undoPatch(current().projectRoot, checkpoint);
            checkpoint = null;
            json(res, 200, await refreshAfterWrite());
            return;
          }
          case "/api/discard": {
            staged = null;
            await preview.overlay(null);
            json(res, 200, { ok: true });
            return;
          }
          case "/api/pick-directory": {
            json(res, 200, await pickDirectory());
            return;
          }
          default:
            json(res, 404, { error: "Unknown API endpoint" });
            return;
        }
      }
      if (!["GET", "HEAD"].includes(req.method || "")) {
        json(res, 405, { error: "Method not allowed" });
        return;
      }
      if (url.pathname.startsWith("/docs/")) {
        const relative = decodeURIComponent(url.pathname.slice(6));
        if (
          !/^[\w./-]+$/.test(relative) ||
          relative.split("/").includes("..") ||
          !/\.(md|png)$/.test(relative)
        )
          throw new Error("Invalid documentation path");
        const file = path.join(packageRoot, "docs", relative);
        const content = await fs.readFile(file);
        res.writeHead(200, { "Content-Type": mime(file) });
        res.end(content);
        return;
      }
      const rootDocument = decodeURIComponent(url.pathname).slice(1);
      if (
        new Set([
          "README.md",
          "README.id.md",
          "SECURITY.md",
          "BENCHMARKS.md",
          "COMPATIBILITY_MATRIX.md",
          "KNOWN_LIMITATIONS.md",
          "IMPLEMENTATION_STATUS.md",
          "LICENSE",
          "NOTICE.md",
          "INSPIRATION.md",
          "THIRD_PARTY_NOTICES.md",
        ]).has(rootDocument)
      ) {
        const file = path.join(packageRoot, rootDocument);
        const content = await fs.readFile(file);
        res.writeHead(200, {
          "Content-Type": mime(file),
          "Cache-Control": "no-cache",
        });
        res.end(req.method === "HEAD" ? undefined : content);
        return;
      }
      if (vite) {
        vite.middlewares(req, res, () =>
          json(res, 404, { error: "Not found" }),
        );
        return;
      }
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src http://127.0.0.1:*; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      );
      const relative = decodeURIComponent(url.pathname).replace(/^\//, "");
      if (relative.split("/").includes("..") || relative.includes("\\"))
        throw new Error("Invalid asset path");
      const file = path.join(
        packageRoot,
        "dist/studio",
        relative || "index.html",
      );
      let content: Buffer;
      try {
        content = await fs.readFile(file);
      } catch {
        if (path.extname(relative)) {
          json(res, 404, { error: "Not found" });
          return;
        }
        content = await fs.readFile(
          path.join(packageRoot, "dist/studio/index.html"),
        );
      }
      res.writeHead(200, {
        "Content-Type": mime(file),
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Operation failed";
      const code = /stale|conflict|changed|hash/i.test(message)
        ? "CONFLICT"
        : /approval/i.test(message)
          ? "APPROVAL_REQUIRED"
          : "OPERATION_FAILED";
      if (!res.headersSent)
        json(res, code === "CONFLICT" ? 409 : 400, { error: message, code });
      else res.end();
    } finally {
      if (locked) mutationBusy = false;
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Cannot determine local port");
  origin = `http://127.0.0.1:${address.port}`;
  if (options.dev) {
    const { createServer } = await import("vite");
    vite = await createServer({
      configFile: false,
      root: path.join(packageRoot, "studio"),
      server: {
        middlewareMode: true,
        hmr: { server },
        fs: {
          strict: true,
          allow: [
            path.join(packageRoot, "studio"),
            path.join(packageRoot, "node_modules"),
          ],
        },
      },
      appType: "spa",
      clearScreen: false,
      logLevel: "error",
    });
  }
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    analysisController?.abort();
    ++watchGeneration;
    for (const active of watchers) active.close();
    watchers = [];
    await preview.stop();
    if (vite) await vite.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const directory of tempDirectories) {
      try {
        await fs.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      } catch {
        // Windows may still hold a preview file briefly; leaving a temp folder is harmless.
      }
    }
  }
  return { url: origin, server, close };
}
