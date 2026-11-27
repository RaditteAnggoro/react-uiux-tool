# Changelog

All notable changes to this local-first project are recorded here. Git remains the
authoritative history; entries describe user-visible behavior.

## Unreleased

- Preserve mounted React state during draft edits and Undo in supported isolated
  component modules. Show a detected Next.js route's source alongside the running preview.
- Set literal parameters for individual linked reports. Preview and PDF read those
  values independently of the parent and leave the linked files intact.
- Crop an embedded native report image with a visual preview and Undo/Redo. The
  cropped asset uses the same frame in Design, Preview and PDF.
- Preserve Euro and typographic punctuation supported by WinAnsi in PDF export.

- Restore the React Design canvas when a touch drag is canceled or loses capture.
  Only the active pointer can finish a drag and stage a source edit.

- Preview and edit explicit Code 128 and QR values in YRF, while preserving legacy
  barcode payloads. Preview basic RTF text styles and open same-folder linked YRF files
  through the normal unsaved-draft prompt.
- Preserve object rotation in native PDF export. Editable PDF text import now keeps
  the angle of left-to-right text and still offers image import for scans and graphics.

- Fill declared component Board props through controls for strings, numbers, booleans
  and literal choices. Apply preserves the live isolated preview.
- Inspect explicit YRF pages and flag bands that exceed the raw paper height.
  Edit selected local fields for AR.DataControl, AR.XML, AR.Barcode, rtf and subReport.
  Save and Save copy protect scripts and format payloads outside those fields.
- Create a generic A4 vehicle collateral form from Report Studio. Experimental YRF
  creation preserves simple field binding names in its generated textboxes.

- Load only the Code 128 and QR encoders in Report Studio. Tests compare the
  output geometry with the previous encoder.
- Stack up to four eligible local providers in isolated Design. Keep Board props
  when changing providers and resume a tab switch requested during preview setup.
- Roll back files already written when a later file changes during draft Save.
  Preserve the external edit and the pending draft for retry.
- Keep native report moves and resizes attached to their active pointer. Escape
  cancels the gesture and completed gestures can be undone in one step.

- Jump from a selected object to its source line in React, native Report, and YRF
  Code views. React highlights the line and report editors place the caret at the object.
- Review a unique top-level CSS token before applying it. Plain stylesheets can
  update through Vite HMR during Apply and Undo, preserving live input.
- Run Save & Build as one project operation. A failed draft save preserves the
  draft and skips the build.
- Coordinate YRF Save and Save copy between Studio processes. Allow Unicode
  filenames for native reports and linked subreports.
- Preserve newer manual sample data when an import finishes late. Paste an image
  onto a selected report image and undo the replacement independently.

- Share `.yrf` validation across Save and Save copy. Preserve scripts and opaque vendor
  objects. Newly created reports can be saved immediately, and template conversion lists
  omitted features and approximations.
- Edit required and typed dataset fields. Mapping, quick import and sample validation
  keep the previous sample when an import fails.
- Link compatible native reports within the current folder. Preview and export resolve
  the latest saved child sections with bounded traversal and cycle detection. An
  experimental PDF import mode extracts simple horizontal text as editable objects.
- Lock native report content or hide objects from output. Keep the first merged row group
  with its preceding section when the group fits on a new page.
- Read literal Next.js base paths. Transfer Component Boards as validated JSON and choose
  a local Provider for isolated Design. Identical external draft changes retain disk bytes
  and modification time during Save.
- Preserve Playwright JSON reports and first-attempt failure traces on each CI OS.

- Fill named Next.js route parameters in the runtime preview.
- Apply local component boards and literal Storybook args without reloading the isolated preview.
- Open saved source in VS Code, recognize direct local React context providers, and rebase separated draft line hunks.
- Check report data types by record, group objects across sections, protect objects from Design deletion, and keep a fixed section with the next section.
- Draft Save rebases external edits separated by a line break. Overlapping and same-line edits preserve the draft and show a conflict.
- Generate a Next.js App Router starter or start the installed project's loopback runtime. Use concrete paths for dynamic routes.
- Map CSV, TSV and XLSX columns. Insert PDF pages as images and copy editable subreport sections.
- Add Code 128 and QR Code to native reports, with shared geometry in Design, HTML and PDF.
- Closing a React Studio tab can save, discard or retain its source-file draft.
  Project-wide Discard clears the recovery snapshot. Switching tabs synchronizes the preview.
- Changes links to source and restores action and object entries after a reload.
  Build and Save & Build run the approved npm build script for the active project.
- The Report Studio launcher supports keyboard focus trapping and Escape. Preview,
  Export and Save wrap on narrow viewports. Export warnings appear before download.
- YRF Design supports Undo and Redo for draft edits.
- Native report saves check the original folder. JSON and CSV imports report
  duplicate keys, duplicate headers and malformed rows. Report sample data is
  cached per file in the browser tab.
- Native and YRF panel controls fit narrow screens. Native objects can lock
  their position and size or move with their group to another report section.
- PDF exports bar, line and pie charts and crosstabs, with warnings for
  oversized content. XLSX exports every table in its own sheet. DOCX exports
  the report title and tables.
- CI runs the full browser suite and verifies documentation links and third-party notices.

## 0.1.0 — 2026-11-13 (unreleased local build)

### React Studio
- Single-click **Start local preview** consent; removed the second approval modal.
- Only Pages/Components navigation and Design/Code modes; one Help control.
- Draft-first editing with non-blocking edits, `Changes` object list, and Save/Save & Build.
- Up to three route or component/page tabs with per-tab selection, inspector and zoom.
- Logical selection for compound controls (`Form.Field`, date/range), Cmd/Ctrl+click
  multi-selection, one-step group movement.
- Code view reveals the selected object's file and line.
- Console persists warnings/errors per project.
- Removed header draft badges; footer `Changes` is authoritative.

### Report Studio
- Icon-based start launcher (Open existing / Create new) that carries into the folder,
  report list and template flows.
- Single folder entry in the left sidebar; removed footer folder input, Formats and YRF
  header buttons, and duplicate YRF entry points.
- Panel-edge chevrons plus resizable persisted panels.
- Native and YRF inspector: Alignment and Layers above Object Properties; layer list is
  grouped by band, topmost first, with icons and selection.
- **One Save** for YRF writes the opened original in place with a content-hash conflict
  check, no backup and no `.edited` copy; Save copy/Preview change removed.
- YRF layer reorder accepts non-scripted vendor objects (including `rtf`); scripted objects
  stay protected.
- Start dialog removed the verbose intro and now uses professional icon tiles.

### Documentation
- Regenerated Home, guide, analysis, React canvas, report launcher and report editor
  screenshots.
- Updated EN/ID guides and README flow, capabilities, and safety text.
- Added release-readiness and testing notes. No test output, logs, or temporary files are
  committed.

### CI
- Windows build runner now invokes `npm run build` through `ComSpec` so spawn no longer
  fails with `EINVAL`.
- Browser CI runs the stable React Studio suite and focused Report smoke journeys while
  the full historical Report suite is migrated.

### Known limitations
- YRF vendor rendering/z-order is not verified against WaiReport; canvas is approximate.
- YRF Undo/Redo history is not implemented.
- Drag/resize preview sync still refreshes the iframe for structural edits.
- Windows/Linux and large-project performance are not verified.
