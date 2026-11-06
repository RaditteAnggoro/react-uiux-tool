# Report Studio — P1 implementation plan

Status: active, 2026-11-06. Scope approved by the operator: **P0 artifacts + P1 core**,
**no new runtime dependencies**, `.yrf` stays inspect-only.

## Outcome for P1

A user can open the Report Studio workspace, create a report from a blank page or a
professional template, edit it on a canvas, and save/reopen it as `.report.json`
without touching the existing React Studio flows.

## Increments

| # | Outcome | Files | Verification |
| --- | --- | --- | --- |
| P1.1 | RDM v1 types, validation, deterministic serialization, limits | `src/reports/core/{types,schema,geometry}.ts` | `tests/reports/schema.test.ts` |
| P1.2 | Format registry with honest capability states; no export claims | `src/reports/core/registry.ts` | `tests/reports/registry.test.ts` |
| P1.3 | Professional templates (3 style families, invoice/statement/receipt/blank) | `src/reports/core/templates.ts` | `tests/reports/templates.test.ts` |
| P1.4 | Deterministic print-oriented HTML renderer for preview/print | `src/reports/renderers/print-html.ts` | `tests/reports/renderer.test.ts` |
| P1.5 | Report API namespace: create, open, save (hash-conflict), list | `src/server/report-routes.ts`, wiring in `src/server/index.ts` | `tests/reports/server.test.ts` |
| P1.6 | Report Studio UI: home, canvas, tree, inspector, page setup, EN/ID | `studio/src/features/report-studio/*` | `tests/e2e/report-studio.spec.ts` |

Each increment must leave `npm run typecheck`, `npm test`, and `npm run build` green.
Existing React Studio tests are a regression gate for P1.6.

## Safety rules for the report API

- Same session capability, loopback binding, Host/Origin checks as the existing server.
- Dedicated JSON limit for report payloads (bounded, not the 128 KiB generic cap).
- Path confinement to the opened report folder; reject symlink escapes and traversal.
- Save requires the expected SHA-256; a stale hash returns a conflict, never overwrites.
- Atomic temp write + rename; no write happens on preview or validation.
- No remote fetch, no telemetry, no automatic install.

## Out of scope for P1 (explicit)

PDF/XLSX/CSV/DOCX export, PDF.js preview, charts, barcodes, crosstab, grouped
pagination, expressions evaluation, `.yrf` write, and any vendor runtime integration.

## Acceptance for this phase

- [ ] `.report.json` round trip: create → save → reopen → identical document.
- [ ] Duplicate/unknown keys rejected with a path in the error.
- [ ] Three professional templates validate and render on the canvas.
- [ ] EN and ID labels complete for the Report Studio surface.
- [ ] Existing React Studio unit/e2e suites still pass.
- [ ] `IMPLEMENTATION_STATUS.md`, `COMPATIBILITY_MATRIX.md`, and
      `KNOWN_LIMITATIONS.md` state the real P1 coverage.
