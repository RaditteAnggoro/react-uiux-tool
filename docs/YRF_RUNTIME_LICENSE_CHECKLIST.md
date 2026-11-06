# WaiReport runtime — licence and integration checklist

Status: **items 1–7 remain UNRESOLVED** as of 2026-11-06. The operator reports that a
licence discussion with the vendor/partner (corebank) is in progress; until a written
grant exists, the runtime stays external, optional, and disabled by default, and all
`.yrf` writes remain labelled **experimental**.

The tool now ships an experimental writer behind an explicit per-action
acknowledgement. This does not change the licence status: the operator owns the
decision to exercise it, and vendor-renderer validation is still required before
business use.

| # | Question | Evidence required | Status |
| --- | --- | --- | --- |
| 1 | May the runtime be used locally for development previews? | Written permission naming the tool, scope, and environment | UNRESOLVED |
| 2 | May it be embedded in a separate application (not the original vendor app)? | Licence clause or written confirmation | UNRESOLVED |
| 3 | May it be redistributed, bundled, or committed to a public MIT repository? | Explicit redistribution grant | UNRESOLVED — assume **no** |
| 4 | May derivative or modified works be created and distributed? | Written confirmation | UNRESOLVED |
| 5 | Is commercial internal use covered, and under which agreement? | Contract reference | UNRESOLVED |
| 6 | Which runtime version may be used, and is it pinned? | Version + hash recorded by the operator | UNRESOLVED |
| 7 | Are samples (`voucher.yrf`, `FA14.yrf`, `BandSample.yrf`) cleared for local test use only? | Operator statement; samples stay out of Git | UNRESOLVED |

## Current handling in this repository

- No vendor file is copied into this repository, its fixtures, or its package output.
- No vendor file is imported by application code or executed by any test.
- `.yrf` support is inspect-only, and only on operator-provided paths.
- Any future adapter must be opt-in, configured as an external local path, and must
  fail closed when the licence or path is missing.
- Third-party notices are updated only for dependencies that are actually installed.

## Stop conditions

Do **not** enable `.yrf` preview, save, or embedding while items 1–3 are unresolved.
A read-only inspector is the only permitted vendor-adjacent behaviour.
