# Report Studio — capability matrix (object × format × phase)

Capabilities reflect the native editor, local export engines, and experimental YRF editor.

## Native object support (`.report.json`)

| Object group | Components | Phase | Current state |
| --- | --- | --- | --- |
| Page & layout | page, margins, header/footer band, divider, rectangle, line | P1 | Schema + templates implemented; canvas renders boxes |
| Text | static text, dynamic field, currency/date format, page X of Y | P1 | Schema + text/field elements |
| Images | logo/image box with fit, alt text | P1 | Schema + template placeholder |
| Tables | fixed columns, repeated headers, column widths and merges | P1/P2 | Editable, with pagination and format-specific export limits |
| Bands | report title, page header, detail, summary, page footer, no-data | P1/P2 | Editable bands, groups and section reassignment from Properties |
| Data binding | dataset reference, field paths, sample data | P2 | Dataset binding, sample imports and per-report browser-tab cache |
| Expressions | whitelisted DSL, decimal money math | P2 | Native evaluation with expression and total controls |
| Charts | bar/line/pie | P4 | Rendered in HTML and PDF with bounded PDF frames |
| Barcodes | Code 128 and QR Code | P4 | Design, HTML and PDF with bounded values and quiet zones |
| Crosstab | sum/count, row and column totals | P6 | Rendered in HTML and PDF with bounded dimensions |
| Subreport | Copy native report sections | P6 | Editable snapshot insertion. Live links and nested execution remain open |
| Thermal/label profiles | ZPL/ESC-POS | P7 | Not implemented |

## Format eligibility, per object

| Object | `.report.json` | `.yrf` | `.xlsx` | `.csv` | `.pdf`/`.html` | `.docx` |
| --- | --- | --- | --- | --- | --- | --- |
| Bands | Fully Editable | Locked | Export Only | Unsupported | Export Only | Export Only |
| Text / field | Fully Editable | Experimental subset | Unsupported | Import as Data | Export Only | Report title only |
| Image | Fully Editable | Experimental subset | Unsupported | Unsupported | Export Only | Unsupported |
| Table | Fully Editable | Experimental static layout | Export Only | Import/Export Data | Export Only | Export Only |
| Chart and crosstab | Rendered | Unsupported | Unsupported | Unsupported | Export Only | Unsupported |
| Barcode | Editable | Unsupported | Unsupported | Unsupported | Export only | Unsupported |
| Script / expression | Read-only DSL (P2) | Opaque, never executed | Unsupported | Unsupported | Evaluated by native engine only | Unsupported |

## Evidence and limits

- "Fully Editable" for native objects means the schema validates them and the editor
  round trips them; it does **not** mean pagination or export fidelity.
- The experimental YRF editor can write supported objects after explicit approval
  and a file hash check. Vendor schema, units, and render fidelity remain unverified.
- PDF, HTML, XLSX, CSV, and DOCX can be exported from native source. CSV and TSV
  can also load sample rows.

## Update rule

When a phase lands, update this matrix, `REPORT_STUDIO_FILE_FORMATS.md`,
`COMPATIBILITY_MATRIX.md`, `KNOWN_LIMITATIONS.md`, and the tests in the same change.
