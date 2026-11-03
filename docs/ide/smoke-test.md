# Verifying a STATIC_EXPORT target in the real IDE

`node scripts/export-ide.mjs <target>` is tested against its own output
(does it produce parseable, deterministic files with no Claude-only
references), but no automated test opens a real Cursor, Codex CLI, GitHub
Copilot or OpenCode session. Until someone does, every one of those targets
stays `NOT_VERIFIED` in `config/tool-capabilities.json`. This is a short,
repeatable checklist to turn one target `VERIFIED`.

## Steps

1. Export into a scratch project (not this repo):
   ```bash
   mkdir /tmp/smoke-<target> && cd /tmp/smoke-<target> && git init -q
   node <this-repo>/scripts/export-ide.mjs <target> --project . --json
   ```
2. Open that folder in the real tool (Cursor, Codex CLI, Copilot in VS
   Code/github.com, or OpenCode).
3. Confirm the tool actually reads the generated instructions file
   (`.cursor/rules/agent-framework.mdc`, `AGENTS.md`, or
   `.github/copilot-instructions.md`) — ask it a question whose answer is
   only in that file (e.g. "what must you do before committing?").
4. Invoke one agent skill and one command skill by whatever means the tool
   actually offers (do not assume the slash syntax in this repo's docs is
   correct — that is exactly what this step checks).
5. Confirm the tool follows the sequential-mode note
   (`.agent-framework/runtime/docs/sequential-mode.md`): it should take one
   framework role at a time, not try to dispatch parallel subagents.
6. Run one task end to end: `tasks.mjs transition`, implement inside
   `files_allowed`, save a handoff, run a review in a fresh session, confirm
   `tasks.mjs validate` and `ci-check.mjs` stay green.
7. For Cursor only: trigger the three hook events
   (`sessionStart`, a shell command, an edit to a protected path) and
   confirm `.cursor/hooks.json` actually runs
   `hooks/adapters/cursor.mjs` and returns a decision the tool honors.

## Recording the result

- If every step above passes with no corrections to this repo's generated
  text: update that tool's `static_export.status` to `"VERIFIED"` in
  `config/tool-capabilities.json`, and run
  `node scripts/capabilities.mjs show <tool>` to confirm it prints cleanly.
- If a step fails or needs a correction: fix the generator
  (`scripts/lib/export-ide.mjs`), bump that target's entry in
  `ADAPTER_VERSION`, re-run this checklist, and leave the status
  `"NOT_VERIFIED"` until it fully passes.
- Either way, note the date and what was checked in the tool's `notes`
  field so the next person knows what "verified" actually covered.
