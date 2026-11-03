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
| Static primitive structure                          | Tested subset              | Reorder/insert/remove and invalid-nesting engine tests passed; eligible containers only                                                                 |
| Inserted literal props / existing event function    | Tested subset              | Exact string/number/boolean values and safe events write directly; missing/unsafe handlers and props are rejected                                       |
| Project component prop/event contracts              | Tested subset              | TS property/union declarations and JS destructuring defaults drive literal controls; declared callbacks bind only to existing owner functions           |
| `.map()`, conditional JSX, spread/dynamic ownership | Inspect/read-only          | Demo and engine fixtures expose reasons; no single-row rewrite promise                                                                                  |
| Reusable local project components                   | Tested subset              | Components filters out business views/pages/screens/routes and nonvisual modules; drag writes JSX and relative import directly; default/named and memo/forwardRef-wrapped exports supported |
| Selection, move, align, delete, and Undo             | Tested subset              | Clear single/multi-selection outlines, direct drag, arrow movement, visual alignment controls, Delete/Backspace, and one-step Command/Ctrl+Z are covered |
| Existing JSX subtree duplication                    | Tested subset              | Direct copy with changed literal id/name/fromName/toName/*Id; nested identity tested; dynamic/repeated JSX blocked                                      |
| Direct local context-provider inference             | Tested subset              | Provider-backed menu fixture and a large private application check passed; nested/dynamic/router/auth setup is not promised                               |
| Isolated Design fetch/XHR service guard             | Tested subset              | Cross-origin, non-GET/HEAD, and `.SVC` requests receive a generic local empty envelope; App preview/Interact remain unchanged                            |
| TypeScript/JavaScript config aliases                | Tested subset              | `tsconfig.json`, `jsconfig.json`, local `extends`/project references, `baseUrl`, multiple path targets, exact and terminal `/*` aliases                 |
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
