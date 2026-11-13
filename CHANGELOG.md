# Changelog

All notable changes to this local-first project are recorded here. Git remains the
authoritative history; entries describe user-visible behavior.

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
