# IDE Compatibility (Phase 5)

Detect which agentic IDEs the user uses (from Phase 0 scan + ask), then
generate ONLY the configs those IDEs actually support. Never fabricate
support.

## Config matrix

| IDE | Instructions file | Rules dir | Agents/subagents | Skills | Native hooks |
|---|---|---|---|---|---|
| **Claude Code** | `CLAUDE.md` + `.claude/rules/*.md` | `.claude/rules/` | `.claude/agents/*.md` | `.claude/skills/` | ✅ `.claude/settings.json` — events: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PermissionRequest, Stop, SubagentStop, TaskCreated/Completed, PostToolUseFailure |
| **Cursor** | `AGENTS.md` | `.cursor/rules/*.mdc` | — | reads `SKILL.md` folders | ✅ `hooks.json` (project or user level) — spawned processes, JSON over stdio |
| **OpenAI Codex CLI** | `AGENTS.md` | — | — | reads `SKILL.md` | ❌ not native — enforce via AGENTS.md protocol + CI |
| **GitHub Copilot** | `.github/copilot-instructions.md` | — | `.github/copilot-agents.yml` (where supported) | partial | ❌ not native — use instructions + CI |
| **OpenCode** | `AGENTS.md` | — | — | reads `SKILL.md` | ⚠️ via JS plugins (`opencode.json`), not hook events |
| **Cline** | `.clinerules/` (`.clinerules` also works) | `.clinerules/*.md` | workflow files `.clinerules/workflows/` | ⚠️ via workflows | ❌ — emulate with rules + CI |
| **Windsurf** | `.windsurf/rules/*.md` (legacy `.windsurfrules`) | `.windsurf/rules/` | — | ⚠️ | ❌ |
| **Antigravity** | `AGENTS.md` / `.agent/rules/` | `.agent/rules/` | — | ⚠️ | ❌ — verify current support at generation time |

Rules of thumb:
- `AGENTS.md` is the emerging cross-tool standard: always write it, and keep
  `CLAUDE.md` pointing at the same rules (one source of truth, thin
  per-IDE wrappers — do not duplicate content).
- Copy content, adapt format only (frontmatter, `.mdc` headers for Cursor).

## Hooks: what to install per IDE

| Goal | Claude Code | Cursor | Others (no hooks) |
|---|---|---|---|
| Format/lint after edit | `PostToolUse` on `Edit\|Write` | `hooks.json` post-edit script | rules.md rule + CI lint job |
| Block dangerous bash | `PreToolUse` matcher `Bash` | `hooks.json` pre-tool script | rules.md "never run …" + CI |
| Run tests before finishing | `Stop` agent hook | hooks.json stop script | CI required check |
| Context on session start | `SessionStart` | hooks.json session start | AGENTS.md intro section |

- See `templates/hooks/claude-code-settings-snippet.json` for a safe
  starting set for Claude Code (PostToolUse format + PreToolUse guard).
- For Cursor, write equivalent logic as a stdio JSON script and register in
  `hooks.json` — same script can often be reused since both speak JSON.
- For IDEs without hooks, write `docs/kickstart/hooks-report.md`: table of
  desired enforcement points → how it's enforced instead (rule file +
  which CI job). Be explicit that enforcement is advisory there, not
  blocking.

## Verification step (always do)

After generating configs: re-read each generated file and confirm
(1) the format matches the IDE's current documented format, (2) referenced
paths exist, (3) hooks commands are cross-platform or marked
platform-specific. If unsure about an IDE's current capabilities, say so in
hooks-report.md rather than guessing.
