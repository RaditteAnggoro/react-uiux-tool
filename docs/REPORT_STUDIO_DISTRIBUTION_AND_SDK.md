# Report distribution (P7) and embedded SDK (P8)

Status: local subset implemented, 2026-11-06. This record separates what ships from
what stays deferred and why. No infrastructure, vendor runtime, or scheduled service is
included.

## P7 — distribution, safely scoped

Implemented locally:

| Capability | State | Evidence |
| --- | --- | --- |
| 80 mm thermal receipt template | Done | `thermalReceipt` template, custom 80×140 mm page, unit test in the template suite |
| 50 × 30 mm label template | Done | `label` template, landscape custom page |
| Print-ready HTML / PDF export | Done (existing) | `/api/reports/export`, per-format fidelity warnings |
| Template catalog metadata | Done | Name/description in EN + ID, style family, page profile |

Explicitly deferred, with reasons:

1. **Print server / spooler** — requires a long-running service, printer discovery,
   retry semantics and hardware testing; the tool is local-first and loopback-only.
2. **Scheduled generation** — needs a scheduler, stored credentials and delivery
   channels; none of that belongs in the current session-scoped server.
3. **Template approvals and revision history service** — needs durable storage, identity
   and audit policy. The native document keeps `schemaVersion` only.
4. **ZPL / ESC-POS output** — must be validated on real hardware before any claim; no
   hardware was available, so it is not offered.
5. **Vendor-rendered goldens** — unchanged gate from the `.yrf` track.

## P8 — embedded SDK

Package subpath: `react-uiux-tool/reports` (built from `dist/reports/index.js`).

```ts
import {
  createReport, renderReport, exportDocument,
  parseDocument, serializeDocument, validateDocument, listTemplates,
} from "react-uiux-tool/reports";

const report = createReport("invoice", { locale: "id-ID" });
const html = renderReport(report, { invoice: { total: 1250000 }, lines: [] });
const pdf = await exportDocument(report, "pdf", data); // async, server-only
```

The subpath resolves to `dist/reports/embed.js`, so `npm run build` is required before
importing the package name. `exportDocument` is async and loads Node-only exporters
lazily; importing the SDK itself never pulls Buffer/zlib into a browser bundle.

Stability contract:

- The document model is `react-uiux-report` schema version 1. Unknown keys are rejected
  so an embedder cannot silently invent fields.
- `html` and `csv` are browser-safe (no Node APIs). `pdf`, `xlsx` and `docx` rely on
  Node buffers/zlib and are server-only; `EMBED_USAGE` states this explicitly.
- Every function is pure: no network, filesystem, environment variable, or vendor code.

Verified: `tests/reports/embed.test.ts` covers template listing, creation, validation,
rendering, CSV export, serialization round trip, unknown-template rejection and the
browser/server format split.

Deferred for P8:

1. **Framework component packages** (React/Next wrappers) — a thin wrapper needs its own
   build and peer-dependency policy.
2. **Java Spring Boot integration** — requires a separate runtime, schema parity tests and
   distribution decisions.
3. **Published package** — the repository is not published to npm; the subpath export is
   exercised from the built `dist` only via unit tests.
