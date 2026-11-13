# Testing guide (draft-first era)

Behavior changes must come with tests that follow the **current** workflow, not the
previous one. Remove stale expectations instead of keeping tests that prove an obsolete
process.

## Current rules

- **React editor:** visual/prop/event edits stage an in-memory draft. Never assert that
  the source file changed immediately after an edit. Assert the draft message/`Unsaved
  draft` state, then `Save` (helpers such as `commitDraft`) before reading source.
- **Preview:** draft edits refresh the preview automatically. Tests do not need to click
  **Preview draft** unless they are specifically testing that button.
- **Selection:** multi-select uses Ctrl/Meta/Shift-click or marquee; selection may be
  remapped after commit, so re-select after Save when a journey needs it.
- **Report Studio:** edits are draft changes until Save; `.yrf` edits default to
  **Save copy**. Only the explicit **Save** / **Save original** actions write files.
- **Assertions:** prefer user-visible outcomes (draft banner, status region, saved file
  contents after Save) over internal implementation strings.

## Commands

```bash
npm run typecheck
npm test
npm run build
npx playwright test
node scripts/check-docs.mjs
```

Playwright runs against the built app, so run `npm run build` first after UI changes.
Keep tests aligned when a command, label, or workflow changes; delete or rewrite stale
tests in the same change rather than adding retries.
