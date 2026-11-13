# Release readiness — 2026-11-13

**Target assessed:** commit `a35d997` with uncommitted working-tree changes for the
2026-11-13 seamless React Studio work. Environment: macOS (local), Node 24.x,
Playwright Chromium/Chrome, real local fixtures only.

**Decision:** **Ready for the assessed local/dev scope.** **Not ready for a public
release.** Windows/Linux, a representative large project, route discovery beyond the
analyzer's proven routes, and zero-reload drafting remain unverified or unimplemented.

## Checks run

| Check | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm test` | 205 pass, 0 fail |
| `npm run build` | pass |
| `npm run test:e2e` | 113 pass, 0 fail (latest full run) |
| `npm run docs:check` | 109 links valid |
| `npm run notices:check` | 80 locked packages verified |
| `npm run compat:inventory -- fixtures/demo` | ran; inventory reports `validation: not-tested` |

No telemetry, auto-commit, push, deployment or production connection was added or run.
A scan for debug logging and newly introduced external URLs found none.

## Requirement scenarios (spec §11)

Status is evidence-based. “Partial” means a representative slice passed, not the whole
scenario. “Not verified” is not a claim of breakage.

| ID | Status | Evidence / gap |
| --- | --- | --- |
| RS-01 | Verified | Analysis is read-only; no Inspect-only destination |
| RS-02 | Verified | `one click starts the controlled preview…` |
| RS-03 | Partial | New project requires its own preview click by flow; no dedicated e2e |
| RS-04 | Verified | Rail has only Pages/Components; no Interact tab |
| RS-05 | Partial | One Help in header; keyboard focus not separately tested |
| RS-06 | Partial | Icon undo/redo + Cmd/Ctrl shortcuts implemented; shortcut e2e absent |
| RS-07 | Verified | `clicking a compound form control selects its logical Form.Field owner` |
| RS-08 | Partial | `Form.Field` + select verified; date-range wrapper not |
| RS-09 | Partial | Generic group move verified; date group movement not |
| RS-10 | Verified | Platform modifier test (Meta on macOS) |
| RS-11 | Not verified | Windows Ctrl behaviour not exercised |
| RS-12 | Partial | Align path exists; disabled-geometry case not re-tested |
| RS-13 | Partial | Ambiguity warnings exist; candidate-choice UX not implemented |
| RS-14 | Not verified | Conditional/repeated JSX selection not re-tested |
| RS-15 | Partial | 0 drag requests verified and drag no longer refreshes the preview; structural edits still sync |
| RS-16 | Verified | 5 pointer-moves → 0 draft/build requests; pointer-up → 1 draft command |
| RS-17 | Verified | Three-route tab test |
| RS-18 | Partial | Clean LRU eviction; all-dirty path shows error, no Save/Discard flow |
| RS-19 | Not verified | Shared ledger Save commits all draft files, not active tab only |
| RS-20 | Not verified | Same-file multi-tab conflict rebase not implemented |
| RS-21 | Partial | Exit modal lists tabs; no e2e for two dirty tabs |
| RS-22 | Partial | Reload recovery e2e + snapshot unit; crash recovery not proven |
| RS-23 | Partial | Changes lists object/action/file; per-tab grouping and locate-on-canvas not implemented |
| RS-24 | Partial | Footer defaults collapsed; overlap audit not repeated at all sizes |
| RS-25 | Partial | Draft conflict regression passes for single-file |
| RS-26 | Not verified | Multi-file failure rollback test absent |
| RS-27 | Partial | Build runner unit-tested; no full Save & Build e2e |
| RS-28 | Not verified | Runtime crash labelling not re-tested |
| RS-29 | Not verified | Unrelated hook syntax-error isolation not re-tested |
| RS-30 | Not verified | No large-project (~879 files) performance capture |
| RS-31 | Partial | EN/ID guides updated; localization audit not repeated |
| RS-32 | Verified | Report Studio suite passes (67 tests) |
| RS-33 | Not verified | Provider/portal controls not re-tested |
| RS-34 | Verified | Only Design/Code modes |
| RS-35 | Not verified | Shared draft has one history; per-tab isolation not delivered |
| RS-36 | Not verified | Dirty dot after undo-to-baseline not tested |

## Known blockers before broader release

1. Route/page discovery is limited; Vite fixtures expose one route, so tabs rely on
   analyzer-proven routes.
2. Draft preview still reloads the iframe; Phase D zero-reload HMR was attempted and
   reverted because the React adapter did not apply synthetic updates reliably.
3. Tabs share one draft ledger; Save writes every dirty file, and per-tab draft/history
   isolation is not implemented.
4. Windows/Linux, large-project performance and crash recovery are untested.
5. Guide screenshots were not regenerated; textual guides are current.

## Smoke steps (local)

1. `npm ci` (or existing install), `npm run build`, `npm start`, open the printed URL.
2. Open `fixtures/demo`, confirm analysis has one Start button, click it once → Design.
3. Select a `Form.Field`; verify inspector owner and source path. Cmd/Ctrl-click a second
   group; drag one; confirm one draft entry and both files unchanged until Save.
4. Open up to three routes; close a dirty tab → Save/Discard/Cancel.
5. Save; reopen; run `npm run test:e2e` for regression evidence.

## Rollback

All changes are uncommitted in the working tree. Roll back with Git (discard/revert the
working tree), preserving user files; no data migration or external state was changed.
Report/YRF file writes are guarded by hashes and copy/backup rules from the earlier scope.
