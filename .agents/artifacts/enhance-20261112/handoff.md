# Handoff — enhancement 2026-11-12

The user prioritized draft-first React editing, YRF in-place save, panels and Layers
before the remaining specification, without publishing. The latest instruction removes
the private-backup requirement: save replaces the local file, without a private backup.
The current increment is not a release candidate: React draft-first browser coverage is incomplete.
YRF Save updates the original only for bounded caption/data-field/geometry patches, without backup;
structural/source edits still require explicit Save copy. See `plan.md` and `issue-matrix.md`.

Completed in synthetic fixtures: independent Pages/Components searches (ISS-026),
expandable file rows retain Design mode (ISS-030); inspector guards for unsupported
property names (partial ISS-008/028/037), invoice field fit (partial ISS-029), YRF
unsupported-object control guards (partial ISS-043), and YRF structural before/after
for insertion/removal (partial ISS-044). Each new browser
regression was reproduced on the preceding implementation and checked after its fix.

User decisions: an explicit Save & Build authorizes `npm run build` after Save;
`SUPERADMIN` is only a development example and the printer ID is supplied by a backend.
The backend endpoint, field contract and authenticated audit context were not supplied.
Do not represent sample data as a verified print identity.

Native report Layers now supports selection, search, per-band front/back and undo/redo;
synthetic browser and HTML/PDF order tests pass. Cross-band ordering, React and YRF
layers remain open. In-place YRF scalar saves use no backup; structural/source saving
is not yet integrated with Save.

Latest validation: typecheck, 197 unit tests, build, docs check (109 links), and
100 Playwright tests passed. The Playwright suite used an alternate local port because
the default port was already occupied. No Windows or vendor validation was performed.

Next: complete React draft-first browser coverage and extend the
YRF in-place save to structural/source edits and conflict UX, with fixtures
before changing the current safe copy path. Then continue panels, layers, trusted audit integration,
remaining issue verification, and full checks. Never execute YRF scripts or silently
overwrite externally changed files. Preserve the pre-existing uncommitted skill update.

React draft increment: `src/engine/draft.ts` and `/api/draft/*` support multiple files,
draft history and checked commit/rollback. The UI now uses those routes and exposes
explicit Preview draft, Save and Discard. Selection may clear for ambiguous structural
changes. The complete browser suite has not passed: tests assuming direct writes and
immediate preview must be migrated, and multi-file rollback failure needs dedicated
fault-injection tests. See `react-draft-plan.md`.


## Progress 2026-11-12 (P0 React + P1 Report/YRF focus)

- Browser suite: 36 studio scenarios converted to draft-first Save semantics and passing;
  draft edits auto-refresh the preview with cache-busting, timers cancelled on Save/Discard.
- Selection: Ctrl/Meta/Shift-click preserved; native report canvas and React preview gained
  mouse-drag marquee selection; native multi-select style presets and React multi-element
  style presets stage draft edits.
- Fixed: preview reload race that cleared selection after Save; repeated-instance multi-select
  remains a documented limitation.
- P1 remains open: YRF save-to-original for structural/Code edits, panel resize/collapse,
  React/YRF layers, optional YRF preview before/after, invoice PDF visual check, watermark
  contract. Save & Build and draft crash recovery remain open P0 items.


### 2026-11-12 follow-up

- Draft recovery: `/api/draft/state`, temp snapshot with `SourceDraft.toSnapshot/fromSnapshot`,
  client reattach on project open; Playwright reload journey passes.
- Save & Build: `runProjectBuild` (fixed `npm run build`, no shell), `/api/build`, header
  action with separate status; unit tests cover success/failure/missing script.
- YRF save original: `/reports/yrf/save-source` with approval, hash recheck, `.bak`
  backup; API tests and Code-tab Playwright journey pass.
- Panels: report and YRF side panels resize by pointer/arrow keys, widths persisted.
- Still open: React/YRF Layers parity, YRF vendor validation/WaiReport, watermark, and
  cross-file atomic save.


## Phase B (seamless selection) — 13 November 2026

- Compound member assignments (`Form.Field = ...`) are discovered as component contracts
  with destructured props; usages resolve to `componentId`.
- Selection remaps component internals to the single non-root usage, then climbs to the
  nearest compound ancestor; root `<App/>` is excluded to keep normal controls selectable.
- Preview outline/hover/drag and additional-selection markers use a label+control wrapper
  heuristic.
- Platform hint (`⌘+click`/`Ctrl+click`); modifier multi-select verified with two logical
  Form.Field groups.
- Tests: engine compound contract unit; Playwright logical owner, outline presence,
  two-group modifier selection.
- Still open: repeated-instance disambiguation, full logical-group movement semantics,
  max-three per-tab drafts, no-reload editing pipeline.


## Phase C slice (tabs) — 13 November 2026

- Route tabs max 3, dedupe by path, per-tab selection/inspector/zoom restored on switch.
- Shared draft ledger; dirty tabs derived from draft files + active draft; unsaved dot.
- Fourth route evicts LRU clean tab; if all dirty, a clear error and no silent eviction.
- Dirty close modal: Save & close / Discard & close / Stay; exit modal lists all tabs.
- Playwright injects four routes to exercise cap/dedupe/dirty dot/dirty close.
- Generic group movement verified on two native buttons in one draft operation.
- Open: analyzer route discovery, inactive canvas suspension, per-tab draft isolation,
  beforeunload/recovery per tab, keyboard focus traversal of tab strip.


## Phase D slice (measured drag) — 13 November 2026

- Verified via Playwright request listener: 5 pointer-moves → 0 draft/build requests;
  pointer-up → 1 draft/edit-group; preview syncs once.
- Removed the draft-refresh "starting" overlay; iframe is still reloaded with a cache-buster
  because synthetic Vite js-update was not applied by the React adapter (reverted safely).
- Open: targeted HMR, incremental analysis, no-reload tab switch, p50/p95 benchmarks,
  large-project memory/CPU capture.


## Phase E (regression/docs/release) — 13 November 2026

- Docs updated for single-click preview, Pages/Components + Design/Code, tabs max 3,
  logical grouping, platform modifier, draft-first Save/Save & Build.
- Added `docs/RELEASE_READINESS_2026-11-13.md` with scenario matrix, blockers, smoke steps
  and rollback. Decision: ready for local/dev scope; not ready for public release.
- Checks: typecheck, 205 unit, build, 112 e2e, docs 109, notices 80, inventory ran.
- Screenshots not regenerated; Windows/large-project/per-tab isolation remain unverified.


## UX polish round — 13 November 2026

- Removed header draft badges; stable `data-draft-count` attr for tests.
- Changes tab lists object/action/file; code mode reveals selected line; console persists
  warnings/errors per project; date/range selection grouped; drag keeps local transform
  without preview reload.
- Tests: 46 studio e2e scenarios pass; full run after docs to be recorded.
