# Enhancement 2026-11-12 execution plan

Source: `ENHANCE_AND_BUG_FIXING_20261112.md`. Treat the issue list as historical
reports, not verified current failures. Preserve the user's existing skill updates.
Do not publish, execute vendor scripts, or use customer data as a fixture.

| Phase | Workflow | Depends on | Exit evidence |
| --- | --- | --- | --- |
| 0. Inventory and baseline | research-plan-implement | — | Map write paths and tests; record observed limitations and initial checks. |
| 1. Draft-first React editing | research-plan-implement | 0 | Draft operations, no writes/reloads during gestures, conflict-safe final commit and regression tests. |
| 2. YRF same-file save | research-plan-implement | 0 | Hash-checked in-place save without backup, explicit conflict handling and round-trip tests. |
| 3. Panels, layers, audit context | ui-implementation | 1, 2 | Accessible layout, native layer ordering and trusted audit integration evidence. |
| 4. Remaining issues | systematic-debugging | relevant phases | Reproduce each issue and test its fix or record evidence/blocked status. |
| 5. Verification and documentation | verification-before-completion | 1–4 | Required checks and issue-to-evidence matrix; report unverified vendor and platform cases. |

Independent low-risk defects may be fixed during phase 0 without bypassing the exit
criteria for the architectural phases. Script execution follows existing user approval;
do not execute the user's external project's scripts as part of fixture inspection.

## Baseline observations

- `studio/src/App.tsx` uses a single search state for the Pages and Components panels;
  its source also explicitly reloads the iframe in several write flows.
- `/api/edit` and `/api/edit-group` in `src/server/index.ts` invoke
  `refreshAfterWrite()`, which refreshes the preview and analysis after source writes.
- At baseline, `src/server/report-routes.ts` used `writeYrfCopy()` for YRF write routes.
  The current scalar Save writes the opened file without a backup as requested; the
  separate copy route remains available.
- The user's Channeling source directory exists, but its contents are private and must
  not be copied to fixtures or changed by verification.
- Actual vendor rendering and a trusted backend-to-report identity contract are not yet
  established. The user specifies that the backend provides the printer's user ID;
  no concrete integration contract has been supplied yet. `SUPERADMIN` is an example
  development identity only, not proof of authenticated print context.
- The user specifies that explicit Save & Build authorizes running `npm run build` on
  the selected project after saving; ordinary Save does not authorize a build.

## Progress / evidence

- Phase 0: initial baseline typecheck, 193 unit tests, and build pass; full baseline
  browser and performance measurements remain pending.
- ISS-026 and ISS-030: regressions reproduced on the old build and pass in synthetic
  browser fixtures. ISS-029 and ISS-044 have partial fixes; see `issue-matrix.md`.
- A YRF scalar save checks explicit approval and file hashes, and tests
  repeated, concurrent and stale saves. Per the user's latest instruction it creates no
  private backup; users validate changes before using Git. The editor offers Save for
  caption/data-field/geometry; structural/source in-place save and conflict UX are unfinished. Native
  report Layers now supports per-section ordering; React/YRF layers, panel resizing,
  draft-first React editing and the trusted watermark remain open.
  Existing React edits still write directly. Release gate remains blocked.
