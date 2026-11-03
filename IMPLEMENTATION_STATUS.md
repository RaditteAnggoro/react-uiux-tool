# Implementation status — local test edition

Date: 3 November 2026. Version: 0.1.0. Implementation coverage is listed here
honestly. The source repository is prepared for public GitHub publication; the npm
package has not been published.

## Implemented vertical slices

- Local Node controller/CLI and bundled React/Vite Studio; session capability,
  loopback binding, Host/Origin validation, and conflict-checked direct source edits.
- English/Bahasa Indonesia, light/dark/system theme, front User Guide and Home/New/Open flows,
  analysis gate, source tree, real iframe canvas, inspector, and direct source mode.
- Read-only project analysis with source positions, framework/routing evidence,
  literal props, behavior/events/style evidence, editability, and scan coverage.
- Files-only Vite React TS generator: four local templates, plain CSS/CSS Modules/
  Tailwind v4; preview plan; safe empty-target validation; no unattended installation.
- Dev-only instrumented Vite preview without generated metadata in project source;
  selected components use an isolated design harness with direct local provider
  inference and a generic fetch/XHR service mock, so state-driven menu screens do not
  fall back to login or fail when a company backend is unavailable.
- Direct targeted source edits with conflict-checked Undo; exported project-component
  catalog limited to reusable visual components, with automatic JSX/import insertion;
  subtree duplication with a new identity;
  typed component prop contracts, callback-event binding to existing owner functions,
  primitive controls, validated values/functions, and explicit read-only reasons.
- Clear single and multi-selection outlines, direct drag, arrow movement, group
  movement and alignment, object deletion, and Command/Ctrl+Z for the latest safe edit.
- Internal deterministic fixture coverage without a public Try Demo entry point.
- Bilingual user guides, legal/provenance notices, security notes, and explicit
  compatibility/limitations files.

## Recorded generator and fixture verification

Host: macOS; Node 24.22.1; npm 11.19.1. Runtime versions used for builds: React/React
DOM 19.3.1, Vite 8.3.5, TypeScript 5.9.3.

| Check                                                    | Actual result                                                                                                                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --import tsx --test tests/templates.test.ts`       | 3 tests passed; no skipped/failed tests                                                                                                                                |
| Read-only creation plan / spaces and Unicode             | Passed; preview left parent directory untouched                                                                                                                        |
| Nonempty/file/symlink/traversal/reserved-name validation | Passed; existing contents preserved                                                                                                                                    |
| All 12 template/style TSX output combinations            | Parsed without diagnostics                                                                                                                                             |
| Four templates × plain CSS/CSS Modules                   | Eight TypeScript checks and production builds passed                                                                                                                   |
| Fresh Form/Tailwind dependency install                   | Passed in isolated temporary directory, 40 packages                                                                                                                    |
| Fresh Form/Tailwind `npm run build`                      | Passed; Vite 232 ms, emitted CSS 6.39 kB / 2.12 kB gzip                                                                                                                |
| Demo `tsc --noEmit`                                      | Passed                                                                                                                                                                 |
| Demo Vite production build                               | Passed; Vite 262 ms, JS 225.52 kB / 70.35 kB gzip                                                                                                                      |
| Full `npm test` integration suite                        | 33 passed, 0 failed/skipped; includes component filtering, typed prop/event contracts, project-component insertion/import, direct write, deletion, Undo, identity duplication, and alias compatibility |
| `npm run typecheck`                                      | Passed for controller/engine/templates and strict Studio TypeScript                                                                                                    |
| `npm run build`                                          | Passed; Studio JS 357.88 kB / 106.35 kB gzip, CSS 51.05 kB / 10.19 kB gzip                                                                                             |
| `npm run test:e2e`                                       | 6 Chrome workflows passed: front User Guide/no public demo, separate Pages/Components, drag target, prop/event binding, isolated fetch/XHR guard, and Next gating     |
| Large private React application check                    | Menu-driven screens, provider inference, alias handling, and unavailable backend behavior were checked locally; no private source or screenshots are included in this repository |
| `npm run benchmark`                                      | Controller 7.9 ms; demo analysis 358.4 ms; idle 68.3 MiB RSS; observed analysis peak 206.3 MiB                                                                         |
| `npm pack --dry-run --json`                              | Passed; expected runtime, fixture, docs, legal/status files and screenshots included                                                                                   |
| `npm audit --omit=dev --audit-level=high`                | 0 known production dependency vulnerabilities reported                                                                                                                 |
| Local Markdown/image-link validation                     | 70 relative documentation links resolved                                                                                                                               |
| Real running-application screenshots                     | Safe demo captures cover Home, wizard, analysis, canvas/inspector, component list, diff, Boards, unsupported element, guide, and dark theme                            |

Build timings are individual development-host observations, not p95 benchmarks or
promises for other hardware. Temporary verification directories were removed.

## Remaining verification and scope

The unit/integration suite exercised controller capability/Origin enforcement,
preview approval, direct edit/Undo, legacy patch safety, AST identity, minimal edits, CRLF/BOM
preservation, safe legacy-encoding isolation, type constraints, symlink/path/secret
boundaries, permissions, and external-edit conflicts. It also covers malformed HTTP
targets, tsconfig/jsconfig references and baseUrl, multiple alias targets, static
Vite/Webpack alias forms, preview resolution without project cache writes, and
shared-scope enforcement when zero usages are indexed. Browser screenshots were
captured from the running UI; the browser tasks exercised lazy source navigation,
interactive help, direct text-edit/Undo, language/theme/Boards, and Next.js
inspection-only gating successfully. It also exercised project-component drag with
automatic import, configured primitive insertion, identity-aware subtree duplication,
typed project-component property/event binding, and a state-driven menu component
whose isolated render required a local provider.

Studio production build, automated browser E2E, and a bounded local benchmark passed
on the development host. The analysis peak exceeded the initial approximate 200 MiB
target by 6.3 MiB; idle stayed below the target. See [BENCHMARKS.md](BENCHMARKS.md)
for measurement limits. This document does not claim every acceptance test in the
full design baseline has passed.

See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md): Next runtime/creation, arbitrary
provider Boards, Storybook import, global-token rewrite, complete computed CSS,
visual regression, and VS Code extension remain unavailable. Windows/Linux and
ChromeOS have not been manually tested on this macOS host.

## Local acceptance path

Run `npm install`, `npm run build`, `npm start`. In the browser: choose language →
Open Existing Project on a disposable trusted fixture → start preview → edit literal
text → Save to source → Undo. Then test component drag and identity-aware Duplicate.
Test New Project into a fresh directory and Open Existing
Project on a trusted React application. Report observed failures before any GitHub
publication. No automatic push is triggered by these actions.
