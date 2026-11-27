// Copyright (c) 2026 RA. MIT License.
import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { diffLines } from "diff";
import { analyzeProject, parseErrors, parseSource } from "./analyzer.js";
import { applyPatch, createMultiStylePatch, createPatch, InstalledPatchError, undoPatch, unifiedDiff } from "./patches.js";
import { hashSource, readProjectFile, resolveProjectPath, withSourceOverlay } from "./safety.js";
import type { AnalysisReport, Checkpoint, PatchRequest, SourcePatch } from "./types.js";

type StyleItem = Parameters<typeof createMultiStylePatch>[1][number];
type Step = { before: string; after: string; patch: SourcePatch };
type DraftFile = { original: string; text: string };

type Hunk = { start: number; end: number; replacement: string };

function changedLines(base: string, next: string): Hunk[] | null {
  const changes = diffLines(base, next, { timeout: 100, maxEditLength: 512 });
  if (!changes) return null;
  let offset = 0;
  let hunk: Hunk | undefined;
  const hunks: Hunk[] = [];
  for (const change of changes) {
    if (!change.added && !change.removed) {
      hunk = undefined;
      offset += change.value.length;
      continue;
    }
    if (!hunk) {
      hunk = { start: offset, end: offset, replacement: "" };
      hunks.push(hunk);
    }
    if (change.added) hunk.replacement += change.value;
    else hunk.end = offset += change.value.length;
  }
  return hunks;
}

function rebaseDraft(base: string, draft: string, disk: string): string | null {
  const staged = changedLines(base, draft);
  const external = changedLines(base, disk);
  if (!staged || !external) return null;
  const ordered = [...staged, ...external].sort((a, b) => a.start - b.start || a.end - b.end);
  let previous: Hunk | undefined;
  let merged = "";
  for (const next of ordered) {
    if (previous?.start === next.start && previous.end === next.end && previous.replacement === next.replacement) continue;
    if (previous && (next.start < previous.end || next.start === previous.start)) return null;
    merged += base.slice(previous?.end ?? 0, next.start) + next.replacement;
    previous = next;
  }
  return merged + base.slice(previous?.end ?? 0);
}

/** In-memory source edits; commits use per-file atomic writes and checked rollback. */
export class SourceDraft {
  private files = new Map<string, DraftFile>();
  private past: Step[] = [];
  private future: Step[] = [];
  constructor(private readonly root: string, private readonly writePatch: typeof applyPatch = applyPatch) {}
  get count(): number { return this.past.length; }
  get canRedo(): boolean { return this.future.length > 0; }
  get undoChange(): SourcePatch | null {
    const patch = this.past.at(-1)?.patch;
    return patch ? { ...patch, before: patch.after, after: patch.before, beforeHash: patch.afterHash, afterHash: patch.beforeHash } : null;
  }
  get redoChange(): SourcePatch | null { return this.future.at(-1)?.patch ?? null; }
  get path(): string | null { return this.past.at(-1)?.patch.file ?? null; }
  history(analysis: AnalysisReport) {
    const summarize = ({ patch }: Step) => {
      const before = patch.before.split(/\r?\n/);
      const after = patch.after.split(/\r?\n/);
      const changed = after.findIndex((line, index) => line !== before[index]);
      const line = changed < 0 ? after.length : changed + 1;
      const matched = analysis.elements.find(element => element.source.file === patch.file && element.source.line === line);
      return {
        id: patch.id, file: patch.file, action: patch.operation,
        object: patch.object ?? matched?.tag ?? "",
        anchor: { line, hash: patch.afterHash },
      };
    };
    return { applied: this.past.slice(-50).map(summarize), undone: [...this.future].reverse().map(summarize) };
  }
  get sources(): ReadonlyMap<string, string> {
    return new Map([...this.files].filter(([, state]) => state.text !== state.original).map(([file, state]) => [file, state.text]));
  }
  withoutFile(file: string): SourceDraft {
    const next = new SourceDraft(this.root, this.writePatch);
    next.files = new Map(this.files);
    next.files.delete(file);
    next.past = this.past.filter(step => step.patch.file !== file);
    next.future = this.future.filter(step => step.patch.file !== file);
    return next;
  }
  private async overlay<T>(fn: () => Promise<T>): Promise<T> {
    return withSourceOverlay(await realpath(this.root), new Map([...this.files].map(([file, state]) => [file, state.text])), fn);
  }
  async analysis(): Promise<AnalysisReport> { return this.overlay(() => analyzeProject(this.root)); }
  async source(file: string): Promise<string> { return this.overlay(() => readProjectFile(this.root, file)); }
  private async prepare(file: string): Promise<boolean> {
    if (this.past.length >= 100) throw new Error("Draft contains 100 changes; save or discard before continuing.");
    if (this.files.has(file)) return false;
    const source = await readProjectFile(this.root, file);
    this.files.set(file, { original: source, text: source });
    return true;
  }
  private async stage(file: string, create: () => Promise<SourcePatch>): Promise<{ patch: SourcePatch; analysis: AnalysisReport }> {
    const added = await this.prepare(file);
    try {
      const patch = await this.overlay(create);
      const state = this.files.get(file)!;
      const before = state.text;
      state.text = patch.after;
      let analysis: AnalysisReport;
      try { analysis = await this.analysis(); } finally { state.text = before; }
      this.past.push({ before, after: patch.after, patch });
      state.text = patch.after;
      this.future = [];
      return { patch, analysis };
    } catch (error) {
      if (added) this.files.delete(file);
      throw error;
    }
  }
  async edit(request: PatchRequest): Promise<{ patch: SourcePatch; analysis: AnalysisReport }> {
    return this.stage(request.file, () => createPatch(this.root, request));
  }
  async editGroup(items: StyleItem[]): Promise<{ patch: SourcePatch; analysis: AnalysisReport }> {
    if (!items.length) throw new Error("Choose items to edit.");
    return this.stage(items[0]!.file, () => createMultiStylePatch(this.root, items));
  }
  async undo(): Promise<AnalysisReport> {
    const step = this.past.at(-1);
    if (!step) throw new Error("Nothing to undo in this draft.");
    const state = this.files.get(step.patch.file)!;
    const current = state.text;
    state.text = step.before;
    let analysis: AnalysisReport;
    try { analysis = await this.analysis(); } catch (error) { state.text = current; throw error; }
    this.past.pop(); this.future.push(step);
    return analysis;
  }
  async redo(): Promise<AnalysisReport> {
    const step = this.future.at(-1);
    if (!step) throw new Error("Nothing to redo in this draft.");
    const state = this.files.get(step.patch.file)!;
    const current = state.text;
    state.text = step.after;
    let analysis: AnalysisReport;
    try { analysis = await this.analysis(); } catch (error) { state.text = current; throw error; }
    this.future.pop(); this.past.push(step);
    return analysis;
  }
  toSnapshot(): {
    version: 1;
    root: string;
    files: Array<{ file: string; original: string; text: string }>;
    past: Step[];
    future: Step[];
  } {
    return {
      version: 1,
      root: this.root,
      files: [...this.files].map(([file, state]) => ({ file, original: state.original, text: state.text })),
      past: this.past,
      future: this.future,
    };
  }

  static async fromSnapshot(
    root: string,
    snapshot: unknown,
  ): Promise<SourceDraft> {
    const record = snapshot as {
      version?: unknown;
      root?: unknown;
      files?: unknown;
      past?: unknown;
      future?: unknown;
    } | null;
    if (!record || record.version !== 1 || record.root !== root)
      throw new Error("Draft snapshot belongs to another project.");
    if (!Array.isArray(record.files) || !Array.isArray(record.past) || !Array.isArray(record.future))
      throw new Error("Draft snapshot is invalid.");
    const draft = new SourceDraft(root);
    for (const item of record.files) {
      const file = item as { file?: unknown; original?: unknown; text?: unknown };
      if (typeof file.file !== "string" || typeof file.original !== "string" || typeof file.text !== "string")
        throw new Error("Draft snapshot file entry is invalid.");
      await resolveProjectPath(root, file.file);
      draft.files.set(file.file, { original: file.original, text: file.text });
    }
    draft.past = record.past as Step[];
    draft.future = record.future as Step[];
    let recovered = draft;
    for (const [file, entry] of draft.files) {
      const disk = await readProjectFile(root, file).catch(() => undefined);
      if (disk !== undefined && disk === entry.text && disk !== entry.original) recovered = recovered.withoutFile(file);
    }
    return recovered;
  }

  async commit(approved: boolean, onlyFile?: string): Promise<Checkpoint[]> {
    if (approved !== true) throw new Error("Explicit review approval is required before writing source.");
    const patches: SourcePatch[] = [];
    let changedFiles = 0;
    for (const [file, state] of this.files) {
      if (onlyFile !== undefined && onlyFile !== file) continue;
      if (state.original === state.text) continue;
      changedFiles++;
      const latest = [...this.past].reverse().find((step) => step.patch.file === file)?.patch;
      if (!latest) throw new Error(`Missing draft history for ${file}.`);
      const full = await resolveProjectPath(this.root, file);
      const before = await readProjectFile(this.root, file);
      if (before === state.text) continue;
      const after = before === state.original ? state.text : rebaseDraft(state.original, state.text, before);
      if (after === null || Buffer.byteLength(after) > 1024 * 1024 || parseErrors(parseSource(file, after)).length) {
        throw new Error(`Source conflict in ${file}; no draft files were changed.`);
      }
      if (after === before) continue;
      if (!((await stat(full)).mode & 0o222)) throw new Error(`File has no write permission: ${file}`);
      patches.push({ ...latest, id: randomUUID(), file, before, after,
        beforeHash: hashSource(before), afterHash: hashSource(after), diff: unifiedDiff(before, after, file) });
    }
    if (!changedFiles) throw new Error("There are no draft changes to save.");
    // Each write still compares the exact on-disk version used to prepare its merge.
    const saved: Checkpoint[] = [];
    let attempted: SourcePatch | undefined;
    try {
      for (const patch of patches) {
        attempted = patch;
        saved.push(await this.writePatch(this.root, patch, true));
        attempted = undefined;
      }
      return saved;
    } catch (error) {
      const failed: string[] = [];
      if (attempted && error instanceof InstalledPatchError) {
        try {
          const current = hashSource(await readProjectFile(this.root, attempted.file));
          if (current === attempted.afterHash) saved.push({ id: attempted.id, file: attempted.file, before: attempted.before, beforeHash: attempted.beforeHash, afterHash: attempted.afterHash, appliedAt: new Date().toISOString() });
          else if (current !== attempted.beforeHash) failed.push(attempted.file);
        } catch { failed.push(attempted.file); }
      }
      for (const checkpoint of saved.reverse()) {
        try { await undoPatch(this.root, checkpoint); } catch { failed.push(checkpoint.file); }
      }
      if (failed.length) throw new Error(`Save failed and automatic recovery could not restore: ${failed.join(", ")}. Review these files; external changes were not overwritten. Cause: ${String(error)}`);
      throw error;
    }
  }
}
