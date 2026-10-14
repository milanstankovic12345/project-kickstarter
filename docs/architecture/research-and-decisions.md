# Research & Architectural Decisions

All platform facts below were checked against the official Claude Code docs
on 2026-10-14, using Claude Code 2.1.300 locally. Sources:

- https://code.claude.com/docs/en/plugins-reference
- https://code.claude.com/docs/en/plugin-marketplaces
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/permissions

## 1. Verified platform facts

| Topic | Fact | Consequence for this repo |
|---|---|---|
| Plugin layout | Root dirs: `skills/`, `commands/` ("prefer `skills/` for new plugins"), `agents/` (subfolders become part of the agent name), `hooks/hooks.json`, `.mcp.json`, `settings.json`, `bin/`. A plugin-root `CLAUDE.md` is **not** loaded. | Framework logic goes into skills and agents, not a CLAUDE.md. |
| Hooks file | `hooks/hooks.json` must wrap the events in a top-level `"hooks"` key. | `validate.mjs` checks this. |
| Variables | `${CLAUDE_PLUGIN_ROOT}` is the installed plugin path and changes when the plugin updates. `${CLAUDE_PLUGIN_DATA}` persists across updates. Neither is set inside the Bash tool's environment; both are substituted inline in skill and agent markdown. | Skills call scripts as `node "${CLAUDE_PLUGIN_ROOT}/scripts/…"`. Project state lives in the project, not the plugin dir. |
| Validation | `claude plugin validate <path> [--strict]` is "the authoritative check". | It is part of the verification steps; CI uses `validate.mjs` because CI has no Claude CLI. |
| Plugin agents | Plugin agents **ignore** `hooks`, `mcpServers` and `permissionMode` frontmatter. | Least privilege is enforced with `tools` / `disallowedTools`, plus plugin-level hooks. |
| `model` | `sonnet`, `opus`, `haiku`, `fable`, a full model ID, or `inherit`. The Agent tool accepts a per-call `model`, which takes precedence over frontmatter, then `CLAUDE_CODE_SUBAGENT_MODEL`, then the session model. | Central routing works by resolving the model at dispatch time. Frontmatter values are generated from config as defaults. |
| Delegation | The tool is `Agent`; `Task` is an alias since v2.1.63. Subagents may spawn subagents up to 3 levels deep. `Agent(a,b)` allowlists only apply to an agent running as the main thread (`claude --agent`). Up to 20 subagents can run concurrently. | Parallelism is real when several Agent calls go out in one message. The orchestrator works best as the main thread. |
| Skills | Frontmatter includes `disable-model-invocation`, `user-invocable`, `allowed-tools`, `context: fork`, `agent`, `paths`, `argument-hint`. `description` plus `when_to_use` is truncated at 1,536 chars. Unknown fields are ignored. Plugin skills are invoked as `/plugin:skill`. | Entry points are commands; knowledge lives in skills; descriptions stay short. |
| Hooks | 33 events, including PreToolUse, PostToolUse, SubagentStop, SessionStart, Stop, TaskCompleted. PreToolUse returns `hookSpecificOutput.permissionDecision` (`allow`/`deny`/`ask`/`defer`) with `permissionDecisionReason`. Precedence is deny > defer > ask > allow. Exit 2 blocks. PostToolUse can't block. | Guards use `ask` for recoverable risk and `deny` for catastrophic risk. The v0.1 `reason` bug is fixed. |
| Model aliases | `default`, `best`, `fable`, `sonnet`, `opus`, `haiku`, `sonnet[1m]`, `opus[1m]`, `opusplan`. `availableModels` can restrict them via managed settings. | `config/model-routing.json` allows only verified aliases or `inherit`, and supports fallbacks for orgs that restrict models. |
| Permissions | Rules are evaluated deny, then ask, then allow. Bash patterns look like `Bash(npm run *)`; paths use gitignore-style patterns. | The README documents recommended project permission rules. |

### Not verified (and not relied upon)

- Exact skill `name` length limits (not stated on the skills page).
- How exactly the runtime picks a fallback when a requested model is
  unavailable. The framework **doesn't assume** automatic fallback: the
  orchestrator re-dispatches with the next tier fallback when a dispatch
  fails, and that rule lives in the instructions. It is not enforced by code.
- Live skill auto-triggering accuracy. The user chose not to run paid
  `claude plugin eval` runs.

## 2. Reference projects studied

### Superpowers (obra/superpowers, MIT, © 2025 Jesse Vincent; read v6.4.1 locally)

Principles adopted (re-expressed; no text copied):

1. **Plans made of tiny, exact tasks.** Each task names its files and
   interfaces, has short steps, and has no placeholders.
   → `task-planning` skill and `schemas/task.schema.json`.
2. **A fresh subagent per task with a file-based brief**, never pasted
   conversation history. Superpowers cites a 42k-character dispatch that
   was 99% history.
   → The orchestrator passes paths (task, profile, handoff) only.
3. **Short return values plus a full report on disk.** The status line is
   DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT.
   → Our handoff file, plus a ≤15-line chat summary.
4. **Never run implementers in parallel on overlapping files.**
   → `tasks.mjs batches` only batches tasks whose `files_allowed` globs
   are disjoint.
5. **Bounded fix loop that escalates the model tier** in later rounds.
   → `max_retries` and `attempts` on each task, with a fallback tier on
   retry.
6. **A progress ledger that survives compaction.** Controllers that lost
   their place re-ran finished work.
   → `reports/progress.md` and `reports/metrics/events.jsonl`.
7. **Verification before completion.** A claim needs fresh command output,
   and an agent's own report is not evidence.
   → Handoffs must record `cmd` and `exit_code`, and `transition done`
   runs the gate.
8. **TDD red → green discipline.** → `testing-tdd` skill.

Not adopted: the 5-round fix loop (we default to 2 retries, configurable)
and the git-ignored `.superpowers/` workspace. We keep tasks and reports in
the repo so they can be reviewed and a new session can resume from them.

### Anthropic official plugins (Apache-2.0 per local LICENSE files)

- **code-review**: parallel specialised reviewers, then an independent
  confidence score per issue, dropping anything below the threshold.
  → The `code-review` skill requires a confidence score per finding and
  reports only findings ≥ 80 as actionable.
- **feature-dev**: explore → clarify → architect (several options) →
  implement → review with parallel read-only reviewers on `model: sonnet`.
  → Read-only review agents. The architect proposes options and the human
  or orchestrator decides.
- **security-guidance**: PostToolUse pattern reminders for dangerous sinks,
  an LLM review at Stop, and a deeper review on commit. Its README warns
  about Stop-time review when agents share one worktree.
  → We keep cheap deterministic hooks (path and command guards). LLM
  security review is an explicit, independent agent step in the workflow,
  not a per-Stop hook, to avoid cost and shared-worktree races.

## 3. Decisions (ADR-style, short)

| # | Decision | Why | Alternatives rejected |
|---|---|---|---|
| D1 | One plugin (`project-kickstarter`) holds both the framework and the interview. | User decision; keeps existing installs working. | Two plugins (cleaner hook isolation, but the user preferred one). |
| D2 | Deterministic logic lives in zero-dependency Node scripts: task state, gate, routing, discovery, bootstrap, validation. | Testable, cross-platform, cheap; the LLM doesn't have to re-derive logic. Node is already required by the v0.1 hooks. | Python (not guaranteed on Windows); pure prose (can't be verified). |
| D3 | A YAML-subset frontmatter parser ships with the plugin. | Zero dependencies; we control the format of tasks and handoffs. | js-yaml (would need npm install inside a plugin). |
| D4 | The orchestrator runs as the main thread via the `/project-kickstarter:run-task` command, or `claude --agent`. | The main thread sees all subagent results and can dispatch parallel batches. Nested orchestration adds a layer of cost. | An orchestrator subagent (allowed, documented as a secondary option). |
| D5 | Model routing uses logical tiers in `config/model-routing.json`. Frontmatter `model` is **generated** by `routing.mjs sync`, and the per-call `model` comes from `routing.mjs resolve`. | One source of truth; per-project overrides; drift is caught by `routing.mjs check`. | Hard-coding models in each agent. |
| D6 | Reviews are separate agent sessions on a different tier from the implementer (review/security = opus, coding = sonnet by default). | Independence in context and model. | A self-review step inside the implementer. |
| D7 | Critical/High findings block `done`. Acceptance must reference `risk-acceptances.md`, and the hook makes every edit to that file an `ask`. | A human approval is enforced by the permission prompt, not by prose. | A "please don't edit" instruction. |
| D8 | All hooks are opt-in, keyed on `.claude/agent-framework.json`. | Interview-only users are unaffected. | Always-on hooks. |
| D9 | Bootstrap tracks ownership by content hash in `.claude/agent-framework/manifest.json`. | Idempotency, and detection of user customisations. | Overwrite-with-backup. |
| D10 | Framework agents stay in the plugin and aren't copied into projects. Projects get only an enablement list and justified specialists. | No per-project copies to keep in sync; improvements reach everyone. | Copying the full team into each project (the v0.1 behaviour). |
| D11 | No live LLM evals are run (user decision). The `claude plugin eval` path is documented but not exercised. | Cost control. | — |
