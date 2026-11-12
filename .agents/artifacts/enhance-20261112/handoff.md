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
