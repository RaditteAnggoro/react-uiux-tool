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
- Project-specific Vite plugins, middleware, environment injection, custom module resolution, and authentication
  may not render correctly. The isolated component harness infers direct local
  context providers reached through imported hooks; nested, dynamic, router, or
  application-specific provider setup is not guaranteed. Static analysis remains available.
- Next App/Pages routes are discovered statically. The approved loopback Next runtime
  renders saved source and recognizes literal basePath configuration, route groups and
  supported catch-all parameters. Computed configuration is resolved by Next itself.
  Source selection, draft overlays and isolated component Design
  use the Vite adapter. Dynamic Next routes need explicit path values.
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
- A reviewed token edit can update one unique top-level `:root` declaration in
  indexed plain CSS. It preserves source comments and checks the current hash.
  Theme-scoped overrides, ambiguous declarations, calculated cascade, and bulk
  rewrites remain outside this editing scope.
- Style provenance reports grounded source evidence, not a complete computed-style
  cascade, inherited value resolver, or visual breakpoint rule editor.
- There is one applied checkpoint for the current project/session. Undo checks
  conflicts; persistent multi-level history and redo
  are not implemented. The checkpoint is not a substitute for Git.
- No automatic target build/lint is run after a direct edit. Source-syntax validation and
  engine invariants do not prove application-level behavior or type correctness.

The original LN02 workflow has been exercised on a synthetic React fixture. Reproducing
it on LN02 requires an anonymized React checkout and the original steps.

## Boards, integrations, and UI

- The deterministic demo Button Board supports Default, Loading, and Error. Board
  create/duplicate/rename/delete settings are in the current UI session only.
- Isolated components support JSON boards scoped to the current browser tab and
  literal Storybook CSF args linked to local exported components. The declared prop form
  covers strings, numbers, booleans, and literal string choices. Board props update
  in place. Apply and Undo of a reviewed token refresh a self-accepting plain CSS
  module through Vite HMR. A JSX draft can preserve mounted state through React Fast
  Refresh when a single isolated component module accepts the update. Other overlays,
  project entries and incompatible refresh boundaries can reload the preview.
  Versioned Board JSON files import and export the current component's presets. Preview
  supports automatic inference or up to four ordered local exported Providers with no required
  props beyond children. Storybook decorators, play, loaders, custom render, dynamic args,
  and component-library schema adapters remain open.
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
- Code mode links to the saved source in desktop VS Code. An extension that
  embeds Studio and synchronizes selection remains open. Screenshot comparison
  requires a separate check.
- The source is published on GitHub, but the application never commits, pushes,
  deploys, collaborates, runs in the cloud, or calls an AI service automatically.
  The npm package has not been published.

See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for actual verification and
[COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md) for fixture-level evidence.

React Editor stores supported visual source edits in a draft with a local recovery
snapshot. An approved Save rebases disjoint line hunks. Overlap or incompatible
changes at the same insertion point preserve the draft and show a conflict. Multi-file saves
use checked per-file writes and best-effort rollback across the affected files.
Save & Build starts only after a successful commit under the Studio request lock.
External processes may still edit source or build inputs.

## Report Studio (P1)

- Native `.report.json` is editable; `.yrf` supports the experimental editing
  subset described below. PDF, HTML, XLSX, CSV, DOCX, and PNG/SVG are not editable sources.
- Exports support PDF, HTML, CSV, XLSX, and DOCX. XLSX exports a worksheet for
  each table. DOCX exports the title and tables. Bar, line, and pie charts and
  sum/count crosstabs render in HTML and PDF. The PDF writer has chart data and
  frame limits. Code 128 and QR Code render in HTML and PDF. Physical scanning
  and printer profiles remain unverified. The conditional style
  editor supports one leading rule for text and fields.
- XLSX imports a worksheet as sample rows. PDF imports one to six pages as image
  sections. Subreport insertion copies editable sections and compatible datasets
  and parameters. Linked sections resolve same-folder relative native reports during
  preview and export. The resolver caps nesting at four levels, follows at most 16 linked
  documents within 5 MiB of combined source, and rejects schema collisions and cycles.
  Links share sample datasets. Literal parameter values can be set per link and take
  precedence inside that report. Parent-parameter expressions and independent child page
  masters remain unavailable. Editable PDF text skips OCR and layout reconstruction.
  The experimental text import supports left-to-right glyph runs, including rotated runs. Mirrored,
  skewed, vertical and right-to-left runs should use image import. Image import also
  preserves scans and graphics. PDF export applies the Design rotation to each object.
- Pagination drives the HTML renderer and the PDF writer with the same layout:
  repeated headers/footers, grouped sections, table row splitting, page X of Y.
  The PDF writer reports crosstabs that exceed the frame and table cells that
  may be clipped.
- The expression evaluator is available as a library and covered by unit tests, but
  the canvas inspector does not expose expression editing yet.
- The design canvas renders bands in a single column; preview and exports use
  bounded pagination with fixture-tested page numbering and grouped totals.
- Native objects can lock their position and size in Design. A selection or
  group can move to a section that has space for its bounds. An occupied
  table section is excluded from table moves. Groups can span sections. Alignment
  uses a single section. Deletion protection applies to Design.
- Native image cover/contain positions images inside their frames. Crop replaces the
  embedded asset with a PNG in the draft and supports Undo/Redo. The crop output is
  limited to 2 MiB and eight million pixels. YRF image rendering remains approximate.
- Native report parameter defaults and overrides under `parameters` are resolved in
  HTML preview and PDF. Missing required values and incorrect types warn in preview and
  export but do not block output; users must check values. Expression names must use
  identifier syntax.
- YRF Design shows explicit pages with raw geometry and warns when stacked sections
  exceed the paper height. It does not paginate repeating data. The local field allowlist
  covers AR.DataControl visibility, AR.XML visibility and recordset patterns, raw geometry
  for barcode, QR, rtf and subReport, explicit Code 128/QR values, plain rtf text, and
  local .yrf/.rpx reference names. Design previews bold, italic and underline for
  a bounded RTF 1 subset. Legacy AR.Barcode payloads, rich RTF source, and script fields
  stay protected. **Open linked YRF** opens a sibling .yrf as its own report.
- YRF Save updates the opened original with a hash conflict check and no backup.
  Design Undo/Redo keeps up to 20 draft steps and clears on Save or Discard.
  The Code editor uses its own text undo. Vendor rendering remains unverified.
  Filesystem rename is not a cross-process compare-and-swap.
- Canvas fields display binding paths rather than evaluated data; the preview can
  evaluate supported bindings using supplied sample data.
- The native inspector can configure multi-level table headers, body merges, and multiple
  row rules. HTML renders these for the tested cases; a merge that does not fit within a
  page placement is left unmerged so its data is not hidden. PDF renders header matrices
  and basic merged cells but simplifies other advanced styling; XLSX/DOCX simplify advanced
  tables. These exports show a fidelity warning. Check every page with your own data.
- Section reordering and "page break before" are available per band; keeping arbitrary
  groups together and multi-object band flow remain limited. A fixed section can stay
  with the next section or start of a table when both fit on a fresh page.
- `.yrf` style edits change the vendor `style` declaration string only; the approximate
  canvas applies a small CSS subset (weight/style/decoration/size/colour/align) and the
  result is still not a vendor-rendered preview. Multi-select alignment stages raw-unit
  geometry patches.
- `.yrf` scalar patches refuse duplicated JSON keys, preserve BOM/CRLF/Unicode and unknown
  vendor properties, and reject parent-directory symlinks. Save and Save copy apply the
  same validation for scripts and format-specific fields outside the local allowlist.
  XML reads, embedded .rpx rendering and script execution are unavailable. Participating Studio
  processes use an exclusive sibling `.uiux-yrf-<hash>.lock`. External editors can
  ignore it. A killed Studio process can leave the lock behind. Confirm no Studio
  is saving that file before removing an orphaned lock.
- `.yrf` support: inspection plus an **experimental** write path. Supported captions,
  data fields and numeric geometry can be saved in place or to a sibling copy; new
  files can be produced from a native template after an explicit acknowledgement. The
  producer uses an approximate 11 units/mm mapping derived from three samples and has
  **not** been validated by the vendor renderer. Vendor licence status is unresolved;
  nothing vendor-owned is bundled.
- Report files are capped at 5 MiB and stored in an operator-chosen folder; the
  server rejects symlink, traversal, and secret-path access. Browsing is bounded to
  two directory levels and 200 entries, and excludes hidden, dependency, build and
  `secrets` folders.
- Report Studio uses the last chosen folder or creates `Documents/React UIUX Reports`
  on first use. A local folder preference survives server restarts while the folder
  remains available. The native picker and manual path are available for changing
  folders. On Windows, the Explorer-style picker requires an interactive desktop
  session. Opening a React project never selects its root as the report folder by itself.
- Basic formatting palette supports style presets, bold/italic/underline/strike, lists,
  justify, line height, letter spacing, borders, wrap and rotation, plus multi-select,
  six alignment modes, group/ungroup and group move. PDF simplifies these rich styles and
  emits a warning. Font effects, arbitrary body-cell merges, real group resize and picture
  effects are not implemented.
- Canvas supports pointer move, eight resize handles, 1 mm snapping (toggle + Alt bypass),
  palette click and drag-to-band, Alt+Arrow keyboard resize, numeric X/Y/W/H and undo/redo.
  A Design object can lock its content or be hidden from preview and exports. Code can
  explicitly change those properties. Chromium tests simulate touch drag and pen resize.
  Physical-device verification remains open. The grid and ruler are visual aids. YRF rulers
  use unverified raw units.
  Images can be imported from local PNG/JPEG/WebP files (≤ 2 MiB).
  CSV, TSV and XLSX columns can be mapped with a preview. Pasting a supported
  image replaces the selected native image. Large-dataset virtualisation remains open.
- The native Code tab edits the JSON draft and rejects invalid JSON. The `.yrf` Code tab
  displays source inertly and starts read-only; **Edit source** enables a draft that can
  be applied to the opened file or a separately named copy. The inspector keeps vendor
  scripts inert.
- Canvas text uses pt→px with zoom only; content that exceeds its box is visible instead
  of clipped, and the status bar reports an overflow count. There is no automatic
  fit-to-box or silent resize.

- React's formatting palette applies individual supported CSS properties to editable
  JSX styles. Report-specific presets, automatic list creation, and identical toolbar
  behavior across React, native reports and `.yrf` are not implemented. Native
  groups can span sections. Align uses the coordinate system of a single section.
  The `.yrf` palette adds experimental text, field, box, and line objects. Advanced
  vendor objects have limited visual controls.

- WaiReport lines stored as endpoints can be moved or resized; other objects without
  known geometry remain without drag controls. Existing string, number, and boolean object properties are
  editable in Design, and structured values are editable through Code. Vendor rendering,
  data-binding semantics, newly added objects, and print results remain unverified.

- YRF image import embeds PNG/JPEG/WebP data up to 2 MiB per image within the 5 MiB report limit. Vendor rendering and image size modes are not verified. Table and form palette layouts create independent static objects; they do not create repeatable tables, merged cells, calculations, or automatic multi-page layouts. The supplied multi-page financial report examples require additional work and have not been reproduced or validated.

- Native table columns support editing keys, headings, proportional widths, alignment, numeric formats, and static rows or a dataset binding. PDF draws table cells with configurable header and border styling; long text is clipped with an estimated-width warning, not automatically wrapped. Complex cell styles and YRF/vendor parity remain unsupported or unverified.

- Native P1 tables support one level of grouped consecutive column headings, repeated headings and split rows; arbitrary body-cell merging is not implemented. A dedicated flowing narrative section splits simple text across pages with approximate character widths and normalizes whitespace. Other multi-object bands and rich text do not automatically flow. Conditional visual editing covers one leading rule on text/fields; multiple row rules and vendor YRF output are not validated.
