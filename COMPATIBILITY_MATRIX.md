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
| Literal static DOM text/props/classes/styles        | Tested subset              | Engine tests and real browser direct-write/Undo; operation-level validation applies                                                                     |
| Static primitive structure                          | Tested subset              | Reorder/insert/remove and invalid-nesting engine tests passed; insertion may append beside expression children without rewriting them; repeated or conditional targets remain restricted |
| Compound component and tab insertion                 | Tested subset              | Reuses unique observed direct wrapper patterns, rejects ambiguous or unsupported wrappers and tab containers; arbitrary component contracts remain unverified |
| Inserted literal props / existing event function    | Tested subset              | Exact string/number/boolean values and safe events write directly; missing/unsafe handlers and props are rejected                                       |
| JSX insertion formatting                            | Tested subset              | Multiline fixture reuses child indentation and CRLF; one-line source retains minimal insertion; arbitrary formatting remains unverified |
| Project component prop/event contracts              | Tested subset              | TS property/union declarations and JS destructuring drive literal controls; declared unknown JS props accept explicit primitives without runtime type proof; callbacks bind to existing owner functions |
| Wrapped component contracts                        | Tested subset              | Static `memo`/`forwardRef` chains expose destructured public prop names, including renamed callbacks; arbitrary HOCs remain unverified |
| Project palette insertion and styles                | Tested subset              | Component CSS modules retained in browser fixture; known missing required TypeScript props rejected; JavaScript/complex contracts and arbitrary styling remain incomplete |
| Named event bindings                                | Tested subset              | Fixture coverage adds, changes, removes, and undoes named bindings; inline expressions remain source-owned and business behavior is not inferred          |
| `.map()`, conditional JSX, spread/dynamic ownership | Inspect/read-only          | Demo and engine fixtures expose reasons; no single-row rewrite promise                                                                                  |
| Reusable local project components                   | Tested subset              | Components filters out business views/pages/screens/routes and nonvisual modules; drag writes JSX and relative import directly; default/named and memo/forwardRef-wrapped exports supported |
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
| Professional templates (blank, invoice, grouped statement, receipt) | Tested | All four validate and render; three style families |
| Print-oriented HTML rendering | Tested subset | Escapes text, blocks unsafe image URLs, deterministic output; HTML export is available |
| PDF, HTML, CSV, XLSX, DOCX export | Tested subset | PDF follows paginated layout and supports JPEG and 8-bit non-interlaced PNG images with fit and transparency; unsupported images, charts and crosstabs produce warnings. XLSX/DOCX are OOXML zip containers and do not export images. |
| PDF unsupported characters | Tested subset | Warnings count replacement characters in text actually rendered, including bound fields and table rows; PDF still uses limited fonts. |
| Report browsing and project entry | Tested subset | Home and project rail open the same studio; bounded browse lists `.report.json` and `.yrf` (depth 2) with `public/rpt` suggestion; symlink/excluded paths skipped; Back returns to the project |
| Native Code tab | Tested subset | JSON draft is validated through `/api/reports/validate`; invalid text is rejected without touching the draft |
| `.yrf` inspector + experimental writer | Tested subset | Existing scalar object values and supported geometry (including line endpoints) can be edited; palette adds text, field, box and line, and existing objects can be removed. Changes save to a copy with hash checks; creation and edits are **not vendor-validated** |

React Style includes a basic formatting property selector for supported inline JSX
styles; report presets and automatic list creation are not shared with React or `.yrf`.
Report multi-selection Align/Group requires the same band. PDF rich formatting emits
an export warning when the currently detected unsupported properties are used.
