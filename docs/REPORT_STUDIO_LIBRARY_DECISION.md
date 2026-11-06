# Report Studio — library and renderer decision (P0)

Status: P0 decision, 2026-11-06. This is a **decision record**, not a benchmark result.
No third-party report library has been installed, imported, or executed in this
repository.

## Decision

**Build the P1 foundation on a native Report Document Model (RDM v1) with this
project's own React canvas and print-oriented HTML renderer. Install no new runtime
dependency for P1.**

Rationale:

- P1 needs deterministic schema, lifecycle, and canvas behaviour, not a full report
  engine. Every candidate library ships its own document schema and would become the
  de facto source format.
- The repository ships a light MIT package (React + Vite + TypeScript + Playwright).
  Adding `pdfme`, Open Reports, ExcelJS, PDF.js, or ECharts changes bundle size,
  licences, and the supply-chain surface. That requires its own review round.
- The specification itself forbids making the default architecture depend on a single
  imported designer, and requires capability declarations rather than universal
  conversion claims.

## Candidate comparison (source-derived, not executed)

| Candidate | Strength | Why not now | Revisit trigger |
| --- | --- | --- | --- |
| **Native RDM + own canvas** | Owns schema, deterministic, no licence risk, small | More code to write for pagination and export | P2 pagination needs a real flow engine |
| `pdfme` | React designer, JSON templates, PDF output, MIT | Fixed-layout forms only; would own the document schema | P3 fixed-layout PDF export is prioritised |
| Open Reports | Broad bands/groups/export surface, MIT claimed | Large host surface, different schema, unverified pinned tree | P2 grouped pagination cannot stay native |
| Paged.js | Print CSS pagination | No editor; pagination semantics differ from a band engine | P3 HTML/PDF print fidelity |
| PDF.js | PDF viewing | Viewer only; never an editor | P3 PDF preview |
| ExcelJS / `docx` | XLSX / DOCX export | Output only; adds bundle and licence duties | P4 export phase |
| jsreport / ReportBro | Full server rendering | Server dependency; AGPLv3 or paid licence | Only as an external, separately licensed adapter |

## Non-negotiables carried into P1

1. `.report.json` is the only editable source; adapters are declared, not assumed.
2. Any renderer is labelled with its fidelity state and version.
3. No `eval`, no script execution from imported documents.
4. Exports are generated documents, never described as editable templates.
5. A dependency is added only with pinned version, licence review, notices update, and
   a threat review of its transitive tree.

## P1 measurement targets (to be filled with real numbers)

| Measurement | Target | Status |
| --- | --- | --- |
| Editor module parse/execute cost | lazy-loaded chunk, measured on M1 8 GB | not measured |
| Bundle delta from Report Studio | recorded before/after | not measured |
| Idle heap with 1-page document | recorded, no invented budget | not measured |

No performance number may be published until it is measured on the stated host.
