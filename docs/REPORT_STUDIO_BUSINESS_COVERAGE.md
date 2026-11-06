# Report Studio — business coverage map

Status: updated 2026-11-06. Source of truth: the v2 specification catalog (§7).
No `project.md` exists in this repository, so the spec catalog is used until the
operator names another file. Statuses are evidence-based, not aspirational.

## Template catalog

| # | Template | Status |
| --- | --- | --- |
| 1 | Corporate Cover / Summary | Planned |
| 2 | Loan Repayment Schedule & Payment Breakdown | **Implemented** (`loanSchedule`, grouped totals) |
| 3 | Partial Payment Allocation | **Implemented** (`allocation`) |
| 4 | Payment Receipt / Proof of Payment | **Implemented** (`receipt`) |
| 5 | General Ledger / Journal Voucher | **Implemented** (`voucher`, debit/kredit totals) |
| 6 | Daily/Monthly Collection Report | **Implemented** (`collection`) |
| 7 | Partner/Channeling Reconciliation | Planned |
| 8 | Aging / Outstanding Balance Statement | **Implemented** (`aging`) |
| 9 | Cash/Funding Disbursement | Planned |
| 10 | Audit & Exception Report | Planned |
| 11 | Customer Statement / Notice | **Implemented** (`statement`) |
| 12 | Printable Business Dashboard | **Implemented** (`dashboard`, SVG bar chart) |
| 13 | Branch Operational Report | Planned |
| 14 | Regulatory Summary (generic) | Planned |
| 15 | Invoice / Purchase Order / Delivery Note | **Implemented** (`invoice`) |
| 16 | Barcode/QR Label Sheet | Partial: `label` template without a barcode component |

Blank page (`blank`) is also implemented as a starting point.

## Business components

| Capability | Status | Evidence |
| --- | --- | --- |
| Decimal money arithmetic | Implemented | `decimal.ts` + `money.test.ts` |
| Currency/date formatting (id-ID, en-US) | Implemented | Renderer + expression tests |
| Label/value fields, page X of Y | Implemented | Renderer + pagination tests |
| Totals via expressions (`SUM`, `ROUND`, `FORMAT_NUMBER`) | Implemented (library) | Expression tests; not yet exposed in the inspector |
| Signature placeholder / footer note | Implemented | Receipt template + footer bands |
| Status badge | Not implemented | — |
| Conditional styling/visibility | Implemented | `conditions[{when,color,background,hide}]` evaluated per element |
| Group subtotals driven by rows | Implemented | `groupHeader`/`groupFooter` repeat per group; `SUM(group.field)` evaluated per group |
| Aging buckets, installment schedule math | Not implemented | Needs P2 grouping + expressions in tables |
| Charts (bar/line/pie) | Implemented | `renderers/chart.ts`, deterministic SVG, escaping tested |
| Barcodes/QR | Not implemented | P4 |
| Crosstab | Implemented | `crosstab` element: row/column/value keys, sum or count, row/column/grand totals |
| PII masking, audit footer with user/time | Not implemented | — |

## Next coverage work (ordered)

1. Group subtotals: evaluate `SUM` per group slice during pagination.
2. Loan schedule + payment breakdown templates (2, 3) on top of grouped totals.
3. Aging statement (8) and GL voucher (5) using the same engine.
4. Status badge + conditional formatting in the schema and renderer.
5. Charts/barcodes behind explicit component registration.
