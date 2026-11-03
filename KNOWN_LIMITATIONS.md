# Known limitations — 0.1.0 local test edition

This is a source-aware local editing subset of the supplied design baseline. It
must not be represented as complete compatibility with arbitrary React/Next.js.

## Runtime and framework coverage

- The Design preview supports conventional client-rendered React applications
  with an `index.html` entry using the built-in Vite preview. It intentionally
  bypasses target scripts, Vite/PostCSS configuration, and lifecycle hooks.
- Project-specific Vite plugins, Next.js runtime behavior, SSR/server components,
  middleware, environment injection, custom module resolution, and authentication
  may not render correctly. The isolated component harness infers direct local
  context providers reached through imported hooks; nested, dynamic, router, or
  application-specific provider setup is not guaranteed. Static analysis remains available.
- Next App/Pages routes are discovered statically. There is no Next runtime source
  selection adapter and no Next starter generator in this release.
- Plain CSS/CSS Modules starters build. Tailwind v4 starters install/build with their
  actual plugin; the internal preview does not load that project plugin. Do not
  infer full Tailwind utility-generation fidelity from the starter's plain CSS.
- React/React DOM may be supplied by the tool for an uninstalled generated/demo
  project. This convenience preview does not replace standalone dependency setup.
- Windows/Linux configuration exists, but a macOS development run does not prove
  either platform works. Native picker needs OS support (`zenity` on Linux); absolute
  path entry is the fallback. ChromeOS Linux remains experimental.

## Source analysis and editing

- Analysis is bounded static evidence, not a complete TypeScript language service
  or whole-program proof. Common tsconfig/jsconfig and literal Vite/Webpack aliases
  are parsed without executing configuration. Dynamic/computed aliases, dynamic
  imports, higher-order components, wrappers, runtime data, and third-party
  implementations may remain unresolved.
- Source analysis and editing require UTF-8. Legacy-encoded source files are reported
  and skipped without conversion so the tool cannot silently corrupt their bytes.
- Literal text/props/classes and supported inline styles can be patched. Primitive
  insertion and resolved component callback props may reference a validated existing
  in-scope function. Contracts are inferred only from grounded TS declarations, JS
  destructuring defaults, and static JSX usage. Hooks, new handler logic, imperative
  methods, backend actions, permissions, controlled bindings, spreads,
  conditional/repeated JSX, and uncertain ownership are not rewritten speculatively.
- Static insert/move/align/remove is constrained by source/container validation.
  The Components list prefers reusable visual exports and excludes business views,
  pages, screens, routes, providers, contexts, hooks, services, stores, and utilities.
  Indexed reusable components support direct JSX insertion and relative auto-import;
  private/dynamic components, cross-file moves, general drag-reparenting, required
  prop synthesis, and full framework-specific HTML semantics remain unavailable.
- Existing static JSX subtrees can be duplicated when a literal identity property
  can be changed. Cross-reference rewriting beyond that chosen identity is unavailable.
- Scope is validated internally for direct writes.
  Automatic global-token/theme rewrites are blocked; unknown style origin does not
  become a guessed global declaration.
- Style provenance reports grounded source evidence, not a complete computed-style
  cascade, inherited value resolver, or visual breakpoint rule editor.
- There is one applied checkpoint for the current project/session. Undo checks
  conflicts; persistent multi-level history and redo
  are not implemented. The checkpoint is not a substitute for Git.
- No automatic target build/lint is run after a direct edit. Source-syntax validation and
  engine invariants do not prove application-level behavior or type correctness.

## Boards, integrations, and UI

- The deterministic demo Button Board supports Default, Loading, and Error. Board
  create/duplicate/rename/delete settings are in the current UI session only.
- Arbitrary user-component Boards, persisted Board files, configurable providers,
  configurable response fixtures, Storybook scenario import, and component-library
  schema adapters are follow-up work. Detection is not support for all props.
- Isolated component Design returns one generic empty JSON envelope for blocked
  fetch/XMLHttpRequest service calls. It does not model business responses and does
  not block WebSocket/EventSource, image/script URLs, or non-network mount effects.
  App preview and Interact can trigger real application actions.
- Viewport presets change canvas width; they do not emulate every device API.
  This is a desktop editor, with limited inspection at narrow widths.
- Supported shortcuts include Esc, Command/Ctrl+Z for the latest safe visual edit,
  Delete/Backspace, arrow movement, Command/Ctrl+Arrow movement, and
  Command/Ctrl+Click multi-selection. Command palette, Command/Ctrl+S workflow,
  persistent multi-level history, and redo are not shipped.
- Visual regression and the VS Code extension are not implemented. Screenshot
  comparison status is NOT RUN unless a separate real check is performed.
- The source is published on GitHub, but the application never commits, pushes,
  deploys, collaborates, runs in the cloud, or calls an AI service automatically.
  The npm package has not been published.

See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for actual verification and
[COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md) for fixture-level evidence.
