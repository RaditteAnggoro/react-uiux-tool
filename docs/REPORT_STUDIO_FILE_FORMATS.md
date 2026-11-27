# Report Studio — file format capability matrix

The matrix describes the format operations available in Report Studio and their current limits.

## Legend

| Label | Meaning |
| --- | --- |
| **Fully Editable** | Native round trip: open, edit every supported object, save, reopen. |
| **Editable Subset** | Only named, separately verified properties may change. |
| **Import as Data** | Contents can become dataset rows; geometry/styles are not imported. |
| **Preview Only** | Can be displayed read-only; never written back. |
| **Export Only** | Generated output; opening it again is not a source round trip. |
| **Unsupported** | No adapter; the picker must say so before selection. |
| **Requires Licensed Renderer** | Depends on an external, separately licensed runtime. |

## Format × operation

| Format | Create | Open / inspect | Edit | Export / render | Fidelity policy |
| --- | --- | --- | --- | --- | --- |
| `.report.json` (native RDM v1) | **P1 — implemented** | **P1 — implemented** | **P1 — implemented** | N/A (source) | Canonical lossless editable source; versioned schema. |
| `.yrf` / `.YRF` (WaiReport) | Experimental | Experimental | Editable subset with explicit in-place Save and hash check | Approximate design preview | Scripted objects are protected. Vendor rendering, units and compatibility require verification. |
| `.csv` / `.tsv` | Unsupported | Import as Data | Unsupported | CSV export | Rows and columns only. CSV export guards formula-like cells. |
| `.xlsx` | Unsupported | Import as Data | Unsupported | Export only | Choose and map one worksheet. Export writes a worksheet per table. |
| `.pdf` | Unsupported | Import pages as images | Unsupported | Export only | Insert one to six pages. Export warns about unsupported text and frame limits. |
| `.html` | Unsupported | Unsupported | Unsupported | Export only | Print-ready rendering of the native document. |
| `.docx` | Unsupported | Unsupported | Unsupported | Export only | Includes the report title and tables. |
| `.png` / `.svg` | Unsupported | Unsupported as a report | Unsupported | Unsupported | Report Studio can embed supported PNG images in native reports. |
| `.jrxml` / `.rdl` / `.rpt` / `.repx` / `.frx` | Unsupported | Unsupported | Unsupported | Unsupported | Distinct grammars; no generic import claim. |
| Vendor runtime folder (e.g. `waiReport/`) | — | Read-only inventory | — | Requires Licensed Renderer | Never bundled, copied, or executed by the default build. |

## Rules the UI must enforce

1. Show the label **before** the file picker performs any conversion.
2. A lossy import needs explicit consent and keeps the original file unmodified.
3. Exported files open as documents, never as native editable sources.
4. The format decision matrix and `KNOWN_LIMITATIONS.md` change together with code.
5. No capability may be claimed for a format without a test that exercises it.

## Historical P1 scope decisions

- Initially, only `.report.json` was editable and exports were deferred. Current
  implemented subsets are listed in the table above.
- The YRF editor started with copy-only inspection and editing. Current saves update
  the opened file after approval and a hash check. Vendor verification remains open.
