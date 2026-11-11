# Report Studio: release and recovery

This checklist describes evidence to collect for a specific commit. A push is not a
deployment and does not prove that the version was installed or used.

## Before use

1. Record the exact commit and check its GitHub Actions results. The CI matrix runs
   typecheck, unit tests, and build on Windows, macOS and Linux with Node 22 and 24;
   browser journeys run on each OS with Node 24. A configured job is not a passing job.
2. Run the tool locally and open a native report and an independent `.yrf` copy. Check
   editing, save/reopen, preview and output with synthetic data. Compare amounts with an
   independent calculation. Review warnings and [known limitations](../KNOWN_LIMITATIONS.md).
3. For an existing `.yrf`, retain the original and check the edited copy in WaiReport.
   The approximate canvas and the test fixtures do not establish vendor equivalence.
4. Back up report files and note the last working application commit before updating.
   Do not upload customer reports or data to GitHub when reporting a problem.

## Recovery

If the new version behaves incorrectly, stop editing the affected report. Keep both the
original and the edited copy, and preserve any error message without sensitive values.
Return the application to the recorded working version in a separate checkout, then
open a copy of the report and check it. If a shared Git branch needs a rollback, use a
reviewed revert commit after identifying the change; do not rewrite shared history or
discard uncommitted work. Validate the recovered version before resuming work.

## After publication

Check the actual CI result and record failures with OS, Node version, commit, actions,
expected result, and a minimal synthetic example. Monitor usage through the user's
normal support process; this application has no automatic monitoring or telemetry.
Vendor rendering, physical printers and production financial totals need separate
evidence and cannot be inferred from synthetic tests.
