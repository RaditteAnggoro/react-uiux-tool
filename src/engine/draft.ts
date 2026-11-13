// Copyright (c) 2026 RA. MIT License.
import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { analyzeProject } from "./analyzer.js";
import { applyPatch, createMultiStylePatch, createPatch, undoPatch, unifiedDiff } from "./patches.js";
import { hashSource, readProjectFile, resolveProjectPath, withSourceOverlay } from "./safety.js";
import type { AnalysisReport, Checkpoint, PatchRequest, SourcePatch } from "./types.js";

type StyleItem = Parameters<typeof createMultiStylePatch>[1][number];
type Step = { before: string; after: string; patch: SourcePatch };
type DraftFile = { original: string; text: string };

/** In-memory source edits; commits use per-file atomic writes and checked rollback. */
export class SourceDraft {
  private files = new Map<string, DraftFile>();
  private past: Step[] = [];
  private future: Step[] = [];
  constructor(private readonly root: string) {}
  get count(): number { return this.past.length; }
  get canRedo(): boolean { return this.future.length > 0; }
  get undoChange(): SourcePatch | null {
    const patch = this.past.at(-1)?.patch;
    return patch ? { ...patch, before: patch.after, after: patch.before, beforeHash: patch.afterHash, afterHash: patch.beforeHash } : null;
  }
  get redoChange(): SourcePatch | null { return this.future.at(-1)?.patch ?? null; }
  get path(): string | null { return this.past.at(-1)?.patch.file ?? null; }
  get sources(): ReadonlyMap<string, string> {
    return new Map([...this.files].filter(([, state]) => state.text !== state.original).map(([file, state]) => [file, state.text]));
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
    return draft;
  }

  async commit(approved: boolean): Promise<Checkpoint[]> {
    if (approved !== true) throw new Error("Explicit review approval is required before writing source.");
    const patches: SourcePatch[] = [];
    for (const [file, state] of this.files) {
      if (state.original === state.text) continue;
      const latest = [...this.past].reverse().find((step) => step.patch.file === file)?.patch;
      if (!latest) throw new Error(`Missing draft history for ${file}.`);
      patches.push({ ...latest, id: randomUUID(), file, before: state.original, after: state.text,
        beforeHash: hashSource(state.original), afterHash: hashSource(state.text),
        diff: unifiedDiff(state.original, state.text, file) });
    }
    if (!patches.length) throw new Error("There are no draft changes to save.");
    // Validate every original before the first write; each write rechecks its own hash.
    for (const patch of patches) {
      const full = await resolveProjectPath(this.root, patch.file);
      if (hashSource(await readProjectFile(this.root, patch.file)) !== patch.beforeHash)
        throw new Error(`Source conflict in ${patch.file}; no draft files were changed.`);
      if (!((await stat(full)).mode & 0o222)) throw new Error(`File has no write permission: ${patch.file}`);
    }
    const saved: Checkpoint[] = [];
    let attempted: SourcePatch | undefined;
    try {
      for (const patch of patches) {
        attempted = patch;
        saved.push(await applyPatch(this.root, patch, true));
        attempted = undefined;
      }
      return saved;
    } catch (error) {
      const failed: string[] = [];
      if (attempted) {
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
