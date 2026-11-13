# Compatibility matrix — 0.1.0

Evidence below concerns the tested fixture/pattern only. It is not a guarantee for
all projects using the same framework or library. Development host: macOS, Node
24.22.1. Tool versions: React/React DOM 19.3.1, Vite 8.3.5, TypeScript 5.9.3.

| Target / pattern                                    | Status                     | Exercised evidence / boundary                                                                                                                           |
| --------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite React TS demo                                  | Tested build               | `fixtures/demo` TypeScript check and Vite production build passed                                                                                       |
| Blank, Dashboard, Form, Operations + plain CSS      | Tested build               | All four generated starters typechecked and production-built                                                                                            |
| Blank, Dashboard, Form, Operations + CSS Modules    | Tested build               | All four generated starters typechecked and production-built                                                                                            |
| Form + Tailwind v4                                  | Tested install/build       | Fresh isolated `npm install --ignore-scripts`, `tsc`, Vite production build passed                                                                      |
| Other template + Tailwind v4                        | Partial                    | All emitted TSX parses; shared plugin config tested with Form; separate builds not recorded                                                             |
| Tailwind in internal instrumented preview           | Limited                    | Project plugin config is bypassed; standalone project dev/build is the fidelity check                                                                   |
| Literal static DOM text/props/classes/styles        | Tested subset              | Draft engine and browser fixture; operation-level validation applies, and preview refresh is explicit                                                                     |
| Static primitive structure                          | Tested subset              | Reorder/insert/remove and invalid-nesting engine tests passed; insertion may append beside expression children without rewriting them; repeated or conditional targets remain restricted |
| Compound component and tab insertion                 | Tested subset              | Reuses unique observed direct wrapper patterns, rejects ambiguous or unsupported wrappers and tab containers; arbitrary component contracts remain unverified |
| Inserted literal props / existing event function    | Tested subset              | Exact string/number/boolean values and safe events are staged before Save; missing/unsafe handlers and props are rejected                                       |
| JSX insertion formatting                            | Tested subset              | Multiline fixture reuses child indentation and CRLF; one-line source retains minimal insertion; arbitrary formatting remains unverified |
| Project component prop/event contracts              | Tested subset              | TS property/union declarations and JS destructuring drive literal controls; declared unknown JS props accept explicit primitives without runtime type proof; callbacks bind to existing owner functions |
| Wrapped component contracts                        | Tested subset              | Static `memo`/`forwardRef` chains expose destructured public prop names, including renamed callbacks; arbitrary HOCs remain unverified |
| Project palette insertion and styles                | Tested subset              | Component CSS modules retained in browser fixture; known missing required TypeScript props rejected; JavaScript/complex contracts and arbitrary styling remain incomplete |
| Named event bindings                                | Tested subset              | Fixture coverage adds, changes, removes, and undoes named bindings; inline expressions remain source-owned and business behavior is not inferred          |
| `.map()`, conditional JSX, spread/dynamic ownership | Inspect/read-only          | Demo and engine fixtures expose reasons; no single-row rewrite promise                                                                                  |
| Reusable local project components                   | Tested subset              | Components filters out business views/pages/screens/routes and nonvisual modules; drag stages JSX and relative imports; default/named and memo/forwardRef-wrapped exports supported |
| Selection, move, align, delete, and Undo             | Tested subset              | Static elements with event bindings can be deleted and undone; ambiguous repeated component instances require exact source-tree selection; runtime identity and all project layouts remain unverified |
| Existing JSX subtree duplication                    | Tested subset              | Copies without identities or spreads into an eligible container in the same file and scope; one literal identity may be changed for a sibling; multiple identities and ID references are rejected |
| Direct local context-provider inference             | Tested subset              | Provider-backed menu fixture and a large private application check passed; nested/dynamic/router/auth setup is not promised                               |
| Isolated Design fetch/XHR service guard             | Tested subset              | Cross-origin, non-GET/HEAD, and `.SVC` requests receive a generic local empty envelope; App preview/Interact remain unchanged                            |
| TypeScript/JavaScript config aliases                | Tested subset              | `tsconfig.json`, `jsconfig.json`, local `extends`/project references, `baseUrl`, multiple path targets, exact and terminal `/*` aliases                 |
| Lazy-loaded screen references                       | Tested subset              | Literal `React.lazy(() => import("..."))` and imported `lazy` default-export usages are linked in static fixtures; computed imports and arbitrary factories remain unresolved |
| Vite/Webpack static aliases                         | Tested subset              | Object and array aliases; CommonJS `__dirname`, `import.meta.dirname`, and ESM `fileURLToPath(new URL(...))` forms; config is parsed but never executed |
| Dynamic/computed aliases                            | Inspect/read-only          | Environment-derived, function-generated, regex, escaping, and other unproven aliases are ignored rather than guessed                                    |
| Module path candidates                              | Tested subset              | Relative/aliased `.js/.jsx/.ts/.tsx/.mjs/.cjs/.mts/.cts` and matching `index.*` candidates                                                              |
| Next.js App Router / Pages Router                   | Static only                | Framework/route analysis; runtime preview adapter and starter unavailable                                                                               |
| MUI / Ant Design / other component libraries        | Detection only             | Recognition does not provide a full prop schema or safe adapter                                                                                         |
| Existing Storybook                                  | Static evidence only       | No automatic execution/install; args/decorator import unavailable                                                                                       |
| Demo Button Board                                   | Exercised fixture          | Default/Loading/Error local scenarios and running Chrome capture; arbitrary provider setup unavailable                                                  |
| CSS provenance                                      | Partial                    | Grounded declarations/references; no full computed cascade resolver                                                                                     |
| Global design-token rewrite                         | Unsupported                | Separate scope intent is shown; automatic source mutation blocked                                                                                       |
| Visual regression                                   | NOT RUN / unavailable      | No integrated screenshot-difference engine                                                                                                              |
| macOS Node 24                                       | Development host exercised | Build, generator checks, and local controller workflow run here                                                                                         |
| Windows / Linux                                     | Unverified locally         | CI configuration is not equivalent to a successful platform run                                                                                         |
| ChromeOS Linux                                      | Experimental               | No native ChromeOS filesystem integration tested                                                                                                        |

Recorded generator commands are reproducible from exported `templateFiles` and
`createProject` in `src/templates/index.ts`; safety tests live in
`tests/templates.test.ts`. The generated starter builds were run in temporary
directories and cleaned up, without changing a user's existing project.

Review [known limitations](KNOWN_LIMITATIONS.md) before expanding a support claim.

## Report Studio (P1)

| Target / format | Status | Exercised evidence / boundary |
| --- | --- | --- |
| Native `.report.json` create/open/edit/save | Tested subset | Schema validation, deterministic serialize/parse round trip, atomic save with SHA-256 conflict check; unit + API + Playwright coverage |
| Professional templates (blank, invoice, grouped statement, receipt, pre-analysis, approval memo) | Tested | Sixteen catalog templates validate; pre-analysis and approval memo add two-level/matrix headers, merged cells, multiple row rules, flowing narrative, page break and signature areas; synthetic data renders with independently checked totals |
| Print-oriented HTML rendering | Tested subset | Escapes text, blocks unsafe image URLs, deterministic output; HTML export is available |
| PDF, HTML, CSV, XLSX, DOCX export | Tested subset | PDF follows paginated layout and supports JPEG and 8-bit non-interlaced PNG images with fit and transparency; unsupported images, charts and crosstabs produce warnings. XLSX/DOCX are OOXML zip containers and do not export images. |
| PDF unsupported characters | Tested subset | Warnings count replacement characters in text actually rendered, including bound fields and table rows; PDF still uses limited fonts. |
| Report browsing and entry | Tested subset | Home opens Report Studio; bounded browse lists `.report.json` and `.yrf` (depth 2) with `public/rpt` suggestion; symlink/excluded paths are skipped. The project rail does not contain a report shortcut. |
| Native table editing and PDF cells | Tested subset | Configure columns, static rows or dataset binding, numeric format, header and border; PDF draws individual cells and warns on estimated text clipping. Complex merged cells and vendor parity are not covered. |
| Native Code tab | Tested subset | JSON draft is validated through `/api/reports/validate`; invalid text is rejected without touching the draft |
| `.yrf` inspector + experimental writer | Tested subset | Existing scalar object values and supported geometry can be edited; the palette adds objects and static table/form layouts. A single Save replaces the opened original for supported caption, data-field, geometry, style, structure and source changes with a content-hash conflict check and no backup; unsupported/scripted vendor edits are refused with the draft preserved. Creation and edits are **not vendor-validated** |

React Style includes a basic formatting property selector for supported inline JSX
styles; report presets and automatic list creation are not shared with React or `.yrf`.
Report multi-selection Align/Group requires the same band. PDF rich formatting emits
an export warning when the currently detected unsupported properties are used.

Native A4 canvas has zoom, visual grid and rulers; the YRF canvas uses a separate raw-unit ruler and zoom. Design aids do not alter report output. Native rectangle fill/border rendering is exercised in HTML and PDF; YRF color output remains vendor-unverified.

Native tested subset: multi-page rows and repeated/optional headings, multi-level headers, body merges in HTML, multiple conditional row rules, dedicated flowing simple narrative, and basic conditional colors for text/fields. Vendor-rendered YRF parity remains unverified.

Seamless UX Phase D slice (13 November 2026): drag gestures are measured—five pointer
moves produce **zero** `/api/draft/edit*` requests and zero `/api/build` requests; pointer-up
produces exactly one draft command and the preview refreshes once. The canvas still uses a
cache-busted iframe reload for draft sync because a synthetic Vite `js-update` was not
accepted reliably by the React adapter (attempted and reverted). The blocking preview
"starting" overlay is no longer used for draft refresh; inline draft status remains.
Not achieved: zero-reload editing, targeted HMR, incremental per-file analysis and
p50/p95 frame/latency benchmarks. Tab switch still navigates the shared preview route.

Seamless UX Phase C (13 November 2026): route-based page tabs are capped at three,
activate an existing route instead of duplicating, persist per-tab selection/inspector/zoom,
show an unsaved dot derived from the shared draft file set, evict the least-recently-used
clean tab for a fourth route, and guard closing a dirty tab with Save & close /
Discard & close / Stay. Exit lists all open tabs with dirty/clean state. The draft remains
a single shared ledger (per the spec's allowed shared-workspace option), so Save commits
all draft files; there are no three independent drafts. Playwright injects three routes to
verify the cap, duplicate activation, dirty dot and dirty-close dialog. Boundaries: route
discovery currently comes from the analyzer (Vite projects expose one route), tabs do not
suspend/reload-free switch canvases, and crash recovery is not per-tab.

Group movement: a Playwright fixture with two plain `<button>` objects verifies one drag
applies `marginLeft` to both selected objects in a single draft operation, not only
compound/date/combo controls.

Seamless UX Phase B (13 November 2026): analyzer discovers compound member
components assigned as `Form.Field = ...` (props from destructuring) and resolves usages
to that contract; clicking an inner input/select maps through its component usage to the
nearest compound ancestor, so the inspector shows the logical owner (e.g. `Form.Field`)
with the real source location. Root `<App/>` usages are excluded from remapping so normal
controls still select themselves. The preview selection outline/hover/drag uses the
nearest wrapper containing a label and control where available. Platform hint shows
⌘+click on macOS and Ctrl+click elsewhere; multi-select/group move still uses the shared
draft edit-group path. Playwright covers logical owner selection, outline presence and a
two-group modifier selection. Boundaries: the outline wrapper is a DOM heuristic, not a
source-declared group; compound contract resolution covers statically assigned members,
not arbitrary HOC/dynamic definitions; per-tab drafts and no-reload editing remain open.

Seamless UX Phase A (13 November 2026): React Studio now keeps only Pages/Components
navigation and Design/Code modes, starts the controlled Vite preview with one explicit
click (no second approval modal, no Inspect-only destination), and exposes a single
top-right Help. The footer defaults to the Changes view; Scenarios UI is removed from
reach. Undo/Redo are icon controls with Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z shortcuts outside
text fields. Playwright covers the simplified navigation, one-click preview, no-prompt
edits and exit save/discard; one long fixture journey remains timing-sensitive under full
suite load. Not implemented in this increment: max-three menu tabs with per-tab drafts,
logical compound-control grouping (`Form.Field`), and removal of draft-preview reloads.

Editing UX increment (12 November 2026): per-edit browser confirmations for shared
components, delete and event removal were removed at the user's request, so shared edits
apply to every usage without a prompt (undo remains available). Exit with a draft now
offers Save & leave / Discard & leave / Stay; header actions are Save, Save & Build,
icon Undo/Redo and a More menu. Report panels toggle on desktop and resize with persisted
widths. `.yrf` exposes object paint-order controls and labelled text/fill/border colours.
Coverage: Playwright journeys for no-prompt edits, exit choices, panel toggle/resize and
YRF code overwrite.

Recovery/build/YRF increment (12 November 2026): draft state survives a browser reload
through `/api/draft/state` and a best-effort 0600 temp snapshot keyed by project root
(unit-tested round trip; Playwright reload-and-save journey). `Save & Build` commits the
draft and then runs the project's declared `npm run build` through a fixed, shell-free
runner; the build result is reported separately from the save (unit-tested success,
failure and missing-script paths). `.yrf` structural/source edits can overwrite the opened
original in place after a fresh hash check; no backup or sibling copy is written (API tests plus Playwright code-tab journey). Report and `.yrf` panels
support pointer and arrow-key resizing with widths persisted in localStorage (Playwright
resize check). Boundaries: cross-file Save remains best-effort rollback, snapshots are
local temp data, and full React/YRF Layers parity is still absent.

Draft-first React editor increment (12 November 2026): the browser suite was converted
from direct-write expectations to draft commits and is green for the exercised fixtures
(36 studio scenarios plus report scenarios). Draft edits now debounce an explicit preview
overlay refresh, the preview iframe reload is cache-busted, pending refresh timers are
cancelled on Save/Discard, and selection maps survive the refresh. Ctrl/Meta/Shift-click
multi-select and mouse-drag marquee selection (native report canvas and React preview)
select multiple objects; native report style presets and React style presets apply to the
whole selection. Coverage: Playwright and unit tests; repeated component instances still
collapse to one source element, and vendor/OS coverage is unchanged.

Advanced-table and pagination increment: the native inspector supports header matrices, body merges and multiple row rules; `pageBreakBefore` starts a new page, and sections can be renamed and reordered. HTML and PDF use page-relative merge coordinates and keep a merge together when it fits. PDF still simplifies some styling; PDF/XLSX/DOCX warn about advanced-table fidelity. Coverage is limited to synthetic fixtures; no WaiReport comparison exists.

Native images support horizontal and vertical positioning within the frame for contain/cover in Design, HTML and PDF. A freeform crop rectangle is not supported; YRF image rendering remains unverified against WaiReport.

Native Layers supports selecting, searching and changing object order within one
section as an undoable draft. Synthetic HTML/PDF checks verify drawing in object order;
cross-section and vendor YRF stacking are not verified.

YRF in-place Save supports bounded caption/geometry patches with hash-conflict detection
and no backup. Structural and raw source changes use the same in-place Save path.

Native report parameter definitions can be edited, with defaults and sample overrides resolved for field bindings and expressions in HTML/PDF. Missing required values and incorrect types generate warnings, not blocks; parameter support across other formats is not verified.


## Release readiness — 13 November 2026

Local/dev scope assessed on commit `a35d997` + uncommitted seamless-UX changes.
Evidence: 205 unit tests, 112 Playwright tests, 109 docs links, 80 notices. Decision:
ready for the assessed local/dev scope, **not** for a public release (Windows untested,
large-project performance unmeasured, route discovery limited, draft preview still
reloads, shared draft ledger). See `docs/RELEASE_READINESS_2026-11-13.md`.


## Seamless UX polish — 13 November 2026

- Header draft/recovered badges removed; draft state is exposed by the fingerprint
  `data-draft-count` for tests and by the footer **Changes** tab.
- Changes list shows object type + action + file for draft edits (no heavy diff required).
- Logical grouping extended to date/range component owners; clicking inner input or
  calendar trigger selects the owner.
- Drag moves keep the local transform and skip the preview refresh; structural edits still
  refresh. Resize/nudge and HMR-based zero-reload remain unverified.
- Code mode loads the selected object's file and scrolls to its line.
- Console persists warnings/errors per project in localStorage (bounded) and shows popup
  errors as `[error]` entries.
