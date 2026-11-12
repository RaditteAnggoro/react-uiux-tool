# Historical issues — verification matrix

Source statuses are historical. An item is fixed only when the linked regression succeeds.

| Issue | Source status | Priority | Current evidence |
| --- | --- | --- | --- |
| ISS-004 | Partial | P0 | Not yet verified in this run; no fix claimed. |
| ISS-015 | Partial | P0 | Not yet verified in this run; no fix claimed. |
| ISS-026 | Still open | P0 | Fixed in synthetic browser fixture: Pages and Components searches are independent; regression failed on previous build and passed after change. |
| ISS-027 | Still open | P0 | Not yet verified in this run; no fix claimed. |
| ISS-032 | Still open | P0 | Not yet verified in this run; no fix claimed. |
| ISS-038 | Still open | P0 | Not yet verified in this run; no fix claimed. |
| ISS-042 | New | P0 | Partial: Save updates the original for caption/geometry edits without backup. Synthetic browser tests cover repeated saves, no copy and preserving a draft on external conflict. Structural/source edits still require explicit Save copy. |
| ISS-002 | Partial | P1 | Not yet verified in this run; no fix claimed. |
| ISS-005 | Partial | P0 | Not yet verified in this run; no fix claimed. |
| ISS-006 | Partial | P1 | Not yet verified in this run; no fix claimed. |
| ISS-007 | Partial | P1 | Not yet verified in this run; no fix claimed. |
| ISS-008 | Partial | P1 | Partial: forbidden `children` and `style.*` are excluded from suggestions; duplicates removed. Synthetic browser test passes; wider component contracts need coverage. |
| ISS-014 | Partial | P1 | Not yet verified in this run; no fix claimed. |
| ISS-019 | Partial | P0 | Open: the existing server regression confirms that concurrent requests can receive HTTP 409; queuing or a non-lossy client retry is not established. |
| ISS-028 | Still open | P1 | Partial: unsupported `children` cannot be selected by default or saved; tested on a synthetic section, not PageContainer. |
| ISS-030 | Still open | P1 | Fixed for expandable source-file rows in synthetic browser fixture: Design remains active; the regression failed before the fix and passes after it. |
| ISS-033 | Still open | P1 | Not yet verified in this run; no fix claimed. |
| ISS-034 | Still open | P0 | Not yet verified in this run; no fix claimed. |
| ISS-035 | Still open | P1 | Not yet verified in this run; no fix claimed. |
| ISS-037 | Still open | P1 | Partial: `style.display` cannot be prefilled or saved through Props; tested in synthetic browser fixture. |
| ISS-039 | Partial | P0 | Open by source inspection: empty watcher filenames are treated as relevant without a content-hash comparison. No runtime regression has been run yet. |
| ISS-040 | Still open | P1 | Not yet verified in this run; no fix claimed. |
| ISS-043 | New | P1 | Partial: synthetic `rtf`, `AR.XML`, and unknown objects have disabled visual controls; visual scalar and removal helpers reject unknown/script edits, and supported line/style regression passes. Raw source route still needs independent checks. |
| ISS-044 | New | P1 | Partial: synthetic YRF insertion and deletion show band objects before/after without writing; reordering and other structural operations need separate checks. |
| ISS-010 | Partial | P2 | Not yet verified in this run; no fix claimed. |
| ISS-011 | Partial | P2 | Not yet verified in this run; no fix claimed. |
| ISS-012 | Partial | P2 | Not yet verified in this run; no fix claimed. |
| ISS-017 | Partial | P2 | Not yet verified in this run; no fix claimed. |
| ISS-018 | Partial | P2 | Not yet verified in this run; no fix claimed. |
| ISS-020 | Partial | P2 | Not yet verified in this run; no fix claimed. |
| ISS-021 | Partial | P2 | Not yet verified in this run; no fix claimed. |
| ISS-029 | Still open | P1 | Partial: reproduced field overflow; four fresh invoice fields fit and do not overlap in Design and fit in Preview. PDF verification remains. |
| ISS-031 | Still open | P1 | Not yet verified in this run; no fix claimed. |
| ISS-036 | Still open | P2 | Not yet verified in this run; no fix claimed. |
| ISS-041 | New | P2 | Not yet verified in this run; no fix claimed. |
| ISS-045 | New | P2 | Not yet verified in this run; no fix claimed. |
