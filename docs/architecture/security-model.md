# Security model and guardrails

## Principles

1. **Independent verification.** Security reviews run in separate
   read-only sessions, on the `security` model tier, which differs from
   the implementer's model. They inspect code themselves; the
   implementer's claims count only as claims.
2. **Blocking severities.** Open `critical` and `high` findings block
   `done` (`scripts/lib/gate.mjs`). They must be fixed **and** re-verified
   by the reviewer (`verified: true`), or accepted by a **named human**.
3. **No "secure" claims.** Reviews end with a coverage statement saying
   what was and wasn't inspected. The framework never reports a system as
   secure.
4. **Least privilege.** Tool sets come from access levels in
   `config/agent-registry.json`, and `scripts/validate.mjs` checks them
   (e.g. reviewers can't Edit or Write, only the orchestrator can
   delegate). Plugin agents ignore the `permissionMode`, `hooks` and
   `mcpServers` frontmatter fields, so the framework doesn't rely on them.
5. **Secrets are never read.** Discovery lists secret-bearing files by
   name only. The Bash guard asks before `cat .env`, `printenv` and
   similar. Path guards ask before edits to `.env*` and key files.

## Risk acceptance

Only a human can accept a Critical or High finding. Write the acceptance in
`project-context/risk-acceptances.md`:

```markdown
## RA-001
- task: TASK-012
- finding: SEC-3
- approved_by: Jane Doe
- date: 2026-10-14
- rationale: Admin-only internal tool on an isolated network; fix scheduled in TASK-020.
- expires: 2026-12-31
```

The reviewer then sets the finding to `status: accepted` with
`acceptance_ref: RA-001`. The gate checks that the entry exists, matches
this task and finding, and has a rationale. It also checks that
`approved_by` is not an agent-like name such as "claude", "agent", "bot" or
"automated", and that the acceptance hasn't expired.

Edits to this file trigger a permission prompt from `hooks/guard-paths.mjs`,
so an agent can't add an acceptance without a human approving the edit.

## Hooks (`hooks/hooks.json`, opt-in per project)

All hooks exit immediately unless `.claude/agent-framework.json` exists.

| Event | Script | Effect |
|---|---|---|
| PreToolUse `Bash` | `guard-bash.mjs` | **deny:** catastrophic commands (`rm -rf /`, mkfs, raw disk writes, `curl … \| sh`). **ask:** destructive or outward-facing commands (force push, hard reset, `DROP`/`TRUNCATE`, terraform/kubectl/helm changes, production deploys, cloud deletes and IAM, publishing, sudo, reading secret files, env dumps, `--human-approved`, `bootstrap apply --force`). **deny for read-only agents** (reviewers, auditors, orchestrator): commands that write files or change git state. Framework report scripts stay allowed (anchored `node …/scripts/<x>.mjs` invocations without redirects). **deny for any subagent:** saving reviews or audits unless it is a reviewer or auditor, and shell writes to framework state (task files, reports, risk acceptances, framework config). Commands referencing secret files (`.env*`, keys, credentials) ask, unless they only check ignore status. Heredoc bodies and quoted text are treated as data. |
| PreToolUse `Edit\|Write\|MultiEdit\|NotebookEdit` | `guard-paths.mjs` | **ask** for protected paths (`config/protected-paths.json`). **deny** for subagents writing outside the project; read-only or orchestrating agents editing anything; agents other than the planner editing `tasks/*.md`; any subagent editing `reports/reviews|handoffs|audits/**` or `project-context/risk-acceptances.md` (these go only through the validating `scripts/reports.mjs`). Case-insensitive on Windows/macOS. **ask** when an implementing subagent edits outside the scope of in-progress tasks. |
| PostToolUse `Edit\|Write\|MultiEdit` | `validate-artifact.mjs` | Validates task, handoff, review and config files right after a write, and feeds errors back. |
| SubagentStop | `require-handoff.mjs` | Blocks once when a framework agent ends without a HANDOFF block (`stop_hook_active` prevents loops). Records a metric. |
| SessionStart | `session-status.mjs` | Injects a resume summary of 10 lines or fewer. |

Outputs follow the documented formats: `hookSpecificOutput.permissionDecision`
plus `permissionDecisionReason`; `decision: "block"` plus `reason`;
`additionalContext`. When a hook hits an internal error it fails open, so a
broken hook never locks the user out. The deliberate deny and ask rules
still apply.

## Limitations (be aware)

- **Bash classification is pattern-based and best effort.** An obfuscated
  command can evade it. It is a safety net, not a sandbox. Use Claude Code
  permissions (`deny` rules) and OS sandboxing for hard boundaries.
- **`ask` only protects when someone sees the prompt.** In permission
  modes that auto-approve (e.g. bypass), an `ask` may not reach a human.
  Don't use bypass mode with this framework when protected actions are
  possible.
- **Read-only agents keep Bash** so they can run `git diff` and tests. The
  hook denies obvious writes, but Bash is not a capability boundary.
- **Scope enforcement uses the union** of all in-progress task scopes. It
  can't tell which task a given subagent is working on.

## Recommended project permissions (`.claude/settings.json`)

```json
{
  "permissions": {
    "deny": ["Read(./.env)", "Read(./.env.*)", "Read(./**/*.pem)", "Read(./**/*.key)"],
    "ask": ["Bash(git push *)", "Bash(npm publish *)", "Bash(terraform *)", "Bash(kubectl *)"],
    "allow": ["Bash(node *)", "Bash(npm test *)", "Bash(npm run *)", "Bash(git diff *)", "Bash(git status *)", "Bash(git log *)"]
  }
}
```

Deny rules beat allow rules. Adjust the allow list to the project's own
commands.
