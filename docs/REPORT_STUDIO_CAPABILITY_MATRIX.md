# Report Studio — capability matrix (object × format × phase)

Status: P0 deliverable, 2026-11-06. Derived from the v2 specification and the actual
repository baseline. No vendor renderer was executed to produce this file.

## Native object support (`.report.json`)

| Object group | Components | Phase | Current state |
| --- | --- | --- | --- |
| Page & layout | page, margins, header/footer band, divider, rectangle, line | P1 | Schema + templates implemented; canvas renders boxes |
| Text | static text, dynamic field, currency/date format, page X of Y | P1 | Schema + text/field elements |
| Images | logo/image box with fit, alt text | P1 | Schema + template placeholder |
| Tables | fixed columns, repeated header row, column widths | P1/P2 | Schema describes table elements; pagination is P2 |
| Bands | report title, page header, detail, summary, page footer, no-data | P1 | Band kinds validated; grouped bands in P2 |
| Data binding | dataset reference, field paths, sample data | P2 | Schema reserves `bindings`; evaluator in P2 |
| Expressions | whitelisted DSL, decimal money math | P2 | Read-only placeholder; no `eval` |
| Charts | bar/line/pie | P4 | Not implemented |
| Barcodes | Code128/QR | P4 | Not implemented |
| Crosstab, subreport, nested groups | — | P6 | Not implemented |
| Thermal/label profiles | ZPL/ESC-POS | P7 | Not implemented |

## Format eligibility, per object

| Object | `.report.json` | `.yrf` | `.xlsx` | `.csv` | `.pdf`/`.html` | `.docx` |
| --- | --- | --- | --- | --- | --- | --- |
| Bands | Fully Editable | Locked | Export Only | Unsupported | Export Only | Export Only |
| Text / field | Fully Editable | Locked | Import as Data (P4) | Import as Data | Export Only | Export Only |
| Image | Fully Editable | Locked | Export Only (P4) | Unsupported | Export Only | Export Only (P4) |
| Table | Fully Editable | Locked | Export Only (P4) | Import as Data | Export Only | Export Only (P4) |
| Chart / barcode | P4 | Locked | Unsupported | Unsupported | Export Only (P4) | Unsupported |
| Script / expression | Read-only DSL (P2) | Opaque, never executed | Unsupported | Unsupported | Evaluated by native engine only | Unsupported |

## Evidence and limits

- "Fully Editable" for native objects means the schema validates them and the editor
  round trips them; it does **not** mean pagination or export fidelity.
- `.yrf` cells are locked because no vendor schema, unit, or runtime contract has been
  verified. Structural observations are recorded in `YRF_SCHEMA_FINDINGS.md`.
- PDF/HTML/XLSX/CSV/DOCX are outputs. They are never presented as editable sources.
- Export renderers are not installed in P1. No export claim is made until the
  corresponding phase adds golden tests.

## Update rule

When a phase lands, update this matrix, `REPORT_STUDIO_FILE_FORMATS.md`,
`COMPATIBILITY_MATRIX.md`, `KNOWN_LIMITATIONS.md`, and the tests in the same change.
