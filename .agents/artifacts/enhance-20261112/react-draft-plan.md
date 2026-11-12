# React draft-first implementation

1. Source transaction: in-memory snapshot with validated sequential edits, undo/redo, and conflict-checked same-file commit; test without source writes. Multi-file commit requires a separate recoverable transaction and is not implied by single-file atomic rename.
2. Controller: isolate draft state per workspace, serialize actions, preserve drafts on conflicts and guard workspace changes. No preview reload for draft operations.
3. Editor: connect every edit path to draft, render explicitly labelled draft projection, stable selection, Save/Discard and draft undo/redo. Unsupported operations must not appear successful.
4. Verification: engine/controller regression tests and browser journeys, required typecheck, test, build and relevant Playwright. Record unimplemented capabilities truthfully.

Skill trace: research-plan-implement (plan and execution); verification-before-completion (final checks).

Progress: the editor routes its supported single and grouped source edits to an in-memory
multi-file draft. Save checks every file and attempts checked rollback on failure;
Preview draft explicitly reloads the preview, with canvas interactions disabled while
it is stale. Selection is remapped conservatively and may clear when a change spans
multiple regions. Drafts have no crash recovery and cross-file writes are not atomic.
Browser coverage remains incomplete: older direct-write journeys need conversion and
the complete suite has not passed. Test rollback failure and multi-file browser flows.
