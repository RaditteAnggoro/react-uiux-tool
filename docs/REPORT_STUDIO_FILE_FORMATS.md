# Report Studio — file format capability matrix

Status: P0 deliverable, 2026-11-06. This document records **decisions and labels**,
not implemented behaviour. Every capability below is a product claim and must match
code plus tests before it is advertised in the UI.

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
| `.yrf` / `.YRF` (WaiReport) | Experimental (acknowledged, unverified) | **Read-only inspector shipped** | Editable Subset: caption + numeric geometry, saved as a sibling copy only | Blocked | Original never rewritten. Producer is inferred from three samples, not vendor-validated; licence still unresolved. |
| `.csv` / `.tsv` | Export Only (P3) | Import as Data (P4) | Not a design file | Export Only (P3 — implemented) | Data rows only; no page geometry. Formula-injection escaping implemented. |
| `.xlsx` | Export Only (P4) | Import as Data (P2) | Editable Subset (tables only, later) | Export Only (P4) | Tabular layout; spreadsheets are not page designers. |
| `.pdf` | Export Only (P3 — implemented) | Preview Only (P3) | Unsupported | Export Only (P3 — implemented) | Dependency-free native PDF writer; existing PDF is never converted into an editable template. |
| `.html` | Export Only (P3 — implemented) | — | — | Export Only (P3 — implemented) | Print-ready rendering of the native document. |
| `.docx` | Export Only (P4) | — | Unsupported | Export Only (P4) | Word layout may differ from PDF; warnings are mandatory. |
| `.png` / `.svg` | Export Only (P4, snapshot) | — | — | Export Only | Snapshot, not a template. |
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
- `.yrf` inspection and an experimental copy-only editor are available; creation
  and geometry remain unverified by the vendor renderer and are not production-certified.
