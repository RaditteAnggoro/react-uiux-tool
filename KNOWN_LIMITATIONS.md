# Known limitations — 0.1.0 local test edition

This is a source-aware local editing subset of the supplied design baseline. It
must not be represented as complete compatibility with arbitrary React/Next.js.

- Change history is a curated list of repository commits maintained with releases.
  Commit timestamps and the explicitly marked preparation timestamp are not deployment or installation timestamps; new entries must
  be added to `studio/src/release-history.ts` when publishing changes.
- Native report PDF image export supports JPEG and non-interlaced 8-bit PNG; WebP,
  interlaced and other unsupported image encodings generate an export warning. HTML
  preview supports PNG/JPEG/WebP. XLSX and DOCX do not export report images and warn.

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
- Static reference indexing recognizes literal default-export `React.lazy` / imported
  `lazy` calls with a direct arrow-function import. Other dynamic imports, named-export
  adapters and runtime menu mappings can remain undiscovered. Editing exported screen
  implementations still requires shared-scope confirmation when ownership is uncertain.
- Source analysis and editing require UTF-8. Legacy-encoded source files are reported
  and skipped without conversion so the tool cannot silently corrupt their bytes.
- Literal text/props/classes and supported inline styles can be patched. Primitive
  insertion and resolved component callback props may reference a validated existing
  in-scope function. Contracts are inferred only from grounded TS declarations, JS
  destructuring defaults, and static JSX usage. Hooks, new handler logic, imperative
  methods, backend actions, permissions, controlled bindings, spreads,
  conditional/repeated JSX, and uncertain ownership are not rewritten speculatively.
- A declared JavaScript prop with unresolved type accepts an explicitly chosen literal
  string, number or boolean. Its runtime type and business meaning are not verified;
  undeclared custom props and complex values still require source review.
- Event bindings can be added or changed to a validated existing in-scope function,
  and a simple named binding can be removed. Inline event expressions remain source-owned;
  changing a binding does not validate the application's business behavior.
- Static JSX elements with event handlers can be deleted after confirmation; deleting
  the element also removes its event binding, but does not delete the handler function.
  When multiple rendered component instances cannot be distinguished by grounded
  literal text or identity, select the exact JSX usage in the source tree.
- Static insert/move/align/remove is constrained by source/container validation.
  The Components list prefers reusable visual exports and excludes business views,
  pages, screens, routes, providers, contexts, hooks, services, stores, and utilities.
  Indexed reusable components support direct JSX insertion and relative auto-import;
  private/dynamic components, cross-file moves, general drag-reparenting, required
  prop synthesis, and full framework-specific HTML semantics remain unavailable.
- Insertion into compound components can reuse an observed direct parent–wrapper–child
  pattern; conflicting or missing patterns and wrappers needing unsupported properties
  are rejected. Evidence is limited to indexed source and is not proof of runtime
  compatibility. Direct insertion into tab containers is refused. Repeated visual
  container instances may be ambiguous and must be selected in the source tree.
  Other component-specific layout contracts and all project styles cannot be inferred.
- Palette insertion rejects components with known required TypeScript properties
  that were not supplied. JavaScript and imported or complex type contracts may be
  incomplete, so passing this check does not prove a component can render safely.
  Project components keep their own styling; basic HTML elements rely on applicable
  project styles, and visual equivalence cannot be inferred for arbitrary CSS.
- The inspector flags a component that declares `value` when no `value` prop is
  present on the selected usage. This is a hint, not proof of a missing binding:
  uncontrolled components, defaults, and spread props need individual review.
- Existing static JSX subtrees without identity attributes or spreads can be copied
  beside the original, or into another eligible container in the same file and
  lexical scope; event bindings are copied too. For other subtrees, a literal
  identity property must be changed; copies with multiple identities, spreads, or
  references to a changed ID are rejected. Cross-container copy with identity is unavailable.
  Cross-reference rewriting beyond the chosen identity remains unavailable.
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

## Report Studio (P1)

- Native `.report.json` is editable; `.yrf` supports the experimental copy-only
  subset described below. PDF, HTML, XLSX, CSV, DOCX, and PNG/SVG are not editable sources.
- Exports support PDF, HTML, CSV, XLSX, and DOCX. XLSX contains the first table
  only; DOCX has limited layout fidelity. Bar, line, and pie charts render as SVG
  in HTML, while PDF omits charts and crosstabs. Barcodes and subreports are not
  implemented. Crosstabs support sum/count aggregation; conditional styling has no visual editor yet.
- Pagination drives the HTML renderer and the PDF writer with the same layout:
  repeated headers/footers, grouped sections, table row splitting, page X of Y.
  PDF still draws text, lines, tables, and fields only; charts and crosstab cells
  are not rendered into PDF yet.
- The expression evaluator is available as a library and covered by unit tests, but
  the canvas inspector does not expose expression editing yet.
- The design canvas renders bands in a single column; preview and exports use
  bounded pagination with fixture-tested page numbering and grouped totals.
- Canvas fields display binding paths rather than evaluated data; the preview can
  evaluate supported bindings using supplied sample data.
- `.yrf` style edits change the vendor `style` declaration string only; the approximate
  canvas applies a small CSS subset (weight/style/decoration/size/colour/align) and the
  result is still not a vendor-rendered preview. Multi-select alignment stages raw-unit
  geometry patches and always saves a copy.
- `.yrf` patches refuse duplicated JSON keys, preserve BOM/CRLF/Unicode and unknown
  vendor properties, and reject parent-directory symlinks. Adding/removing objects or
  bands, editing scripts, and overwriting originals remain blocked.
- `.yrf` support: inspection plus an **experimental** write path. Existing textbox `text` and `dataField`, captions
  and numeric geometry can be patched into a sibling `*.edited.yrf` copy, and new
  files can be produced from a native template after an explicit acknowledgement.
  Adding objects/bands, editing scripts, and overwriting originals stay blocked. The
  producer uses an approximate 11 units/mm mapping derived from three samples and has
  **not** been validated by the vendor renderer. Vendor licence status is unresolved;
  nothing vendor-owned is bundled.
- Report files are capped at 5 MiB and stored in an operator-chosen folder; the
  server rejects symlink, traversal, and secret-path access. Browsing is bounded to
  two directory levels and 200 entries, and excludes hidden, dependency, build and
  `secrets` folders.
- Report Studio has one web entry; the native folder picker is the primary way to
  choose a report folder, with a manual absolute path as fallback. Opening a project
  never selects its root as the report folder by itself. The chosen report folder
  persists for the server session until the user changes it or clears it.
- Basic formatting palette supports style presets, bold/italic/underline/strike, lists,
  justify, line height, letter spacing, borders, wrap and rotation, plus multi-select,
  six alignment modes, group/ungroup and group move. PDF simplifies these rich styles and
  emits a warning. Font effects, table column editor, real group resize and picture
  effects are not implemented.
- Canvas supports pointer move, eight resize handles, 1 mm snapping (toggle + Alt bypass),
  palette click and drag-to-band, Alt+Arrow keyboard resize, numeric X/Y/W/H and undo/redo.
  Locked/hidden elements, a visual grid overlay and touch/pen input are not implemented.
  Images can be imported from local PNG/JPEG/WebP files (≤ 2 MiB, no SVG, no network), and
  CSV sample data can be loaded with a schema preview; clipboard paste, cropping, column
  mapping, per-row CSV errors and large-dataset virtualisation are not implemented.
- The native Code tab edits the JSON draft and rejects invalid JSON. The `.yrf` Code tab
  displays source inertly and starts read-only; **Edit source** enables a draft that can
  be applied to a saved copy. Vendor scripts are not executed by the inspector.
- Canvas text uses pt→px with zoom only; content that exceeds its box is visible instead
  of clipped, and the status bar reports an overflow count. There is no automatic
  fit-to-box or silent resize.

- React's formatting palette applies individual supported CSS properties to editable
  JSX styles. Report-specific presets, automatic list creation, and identical toolbar
  behavior across React, native reports and `.yrf` are not implemented. Report Align
  and Group require elements in the same band; existing cross-band groups can be
  selected and ungrouped. `.yrf` palette adds experimental text, field, box, and line objects; advanced vendor objects still have limited visual controls.

- WaiReport lines stored as endpoints can be moved or resized; other objects without
  known geometry remain without drag controls. Existing string, number, and boolean object properties are
  editable in Design, and structured values are editable through Code. Vendor rendering,
  data-binding semantics, newly added objects, and print results remain unverified.
