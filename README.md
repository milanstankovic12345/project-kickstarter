# Project Kickstarter

A cross-agent skill that turns a raw idea into a complete, execution-ready
project kit — through a confidence-driven interview, then generates every
planning artifact, the agent team, IDE configs, and hooks.

## What's inside

### Skills (1)

| Skill | Purpose |
|---|---|
| **project-kickstarter** | Orchestrates the full flow: codebase analysis → questionnaire (30–100 four-option questions in rounds until confidence ≥ 95%) → PRD, tech stack, blueprint, UI/UX design, rules, project skills, CLAUDE.md + IDE configs + hooks → agent team → task plan |

### Agents (6 templates, generated into `.claude/agents/`)

| Agent | Role |
|---|---|
| **tech-lead** | Decomposes tasks, assigns work, guards architecture consistency, re-plans |
| **backend-engineer** | API, data layer, business logic, background jobs |
| **frontend-engineer** | UI screens, components, state, accessibility |
| **qa-engineer** | Test plans, E2E tests, verifies acceptance criteria |
| **devops-engineer** | CI/CD, environments, deployment, hook maintenance |
| **security-reviewer** | Read-only threat modeling, auth/authz review, dependency audit |

Team size scales with the questionnaire tier: **Quick** = tech-lead +
fullstack-engineer + qa-engineer · **Standard** = 5 agents (backend/frontend
split + devops) · **Deep** = 7–8 (adds security-reviewer, code-reviewer,
optionally data-engineer).

### Generated outputs (per project)

`docs/prd.md`, `docs/techstack.md`, `docs/blueprint.md`, `docs/uiux.md`,
`docs/rules.md`, `docs/tasks.md`, `CLAUDE.md`, `AGENTS.md` + per-IDE rule
files, `.claude/agents/*`, `.claude/skills/*`, `.claude/rules/*`, IDE hooks,
and `docs/kickstart/` (interview log, codebase analysis, hooks report).

---

# Installation

> The skill uses the standard `SKILL.md` format, so the same folder works in
> every agent below. Two install styles:
> **Marketplace/plugin** (auto-updates) or **manual copy** (simple).

Universal one-liner (auto-detects installed agents; requires Node.js):

```bash
npx skills add <your-username>/project-kickstarter
```

## 1. Claude Code

**Marketplace (recommended — supports updates):**

In Claude Code, run:

```
/plugin marketplace add <your-username>/project-kickstarter
/plugin install project-kickstarter@milan-plugins
```

`milan-plugins` is the marketplace name in
[.claude-plugin/marketplace.json](.claude-plugin/marketplace.json) — rename
it there (and in the install command) if you fork this repo.

**Manual copy (terminal):**

```bash
git clone https://github.com/<your-username>/project-kickstarter.git
# personal (all your projects):
mkdir -p ~/.claude/skills
cp -r project-kickstarter/skills/project-kickstarter ~/.claude/skills/
# or project-level (shared via repo):
mkdir -p /path/to/your-project/.claude/skills
cp -r project-kickstarter/skills/project-kickstarter /path/to/your-project/.claude/skills/
```

**Settings notes:**
- Skills hot-reload; no restart needed (run `/reload-skills` if you created
  a *new* top-level skills directory).
- Verify with `/skills` — `project-kickstarter` should be listed.
- The generated hooks use `templates/hooks/*.mjs`; after a kickstart, merge
  the provided settings snippet into `.claude/settings.json` and keep the
  scripts at `.claude/hooks/`.

## 2. Cursor

Cursor auto-loads skills from `.cursor/skills/`, `.agents/skills/` (project)
and `~/.cursor/skills/`, `~/.agents/skills/` (global) — **plus the Claude
and Codex directories** `.claude/skills/`, `.codex/skills/`, `~/.claude/skills/`,
`~/.codex/skills/` for compatibility. So if you installed for Claude Code
(manually), Cursor already sees it.

```bash
# global
git clone https://github.com/<your-username>/project-kickstarter.git ~/.cursor/skills/project-kickstarter
# project-level
mkdir -p .cursor/skills
cp -r /path/to/project-kickstarter/skills/project-kickstarter .cursor/skills/
```

**Settings notes:**
- Verify: **Cursor Settings (Ctrl+Shift+J) → Rules → "Agent Decides"**.
- Invoke manually with `/project-kickstarter` in Agent chat, or just describe
  a new project and let the agent trigger it.
- Remote/GitHub import: **Settings → Rules → Add Rule → Remote Rule
  (GitHub)** → paste the repo URL (auto-syncs updates).
- Cursor-native `hooks.json` is supported; the kickstart generates an
  equivalent hook script when it detects Cursor.

## 3. Codex CLI

```bash
# global (auto-discovered at session start)
git clone https://github.com/<your-username>/project-kickstarter.git ~/.agents/skills/project-kickstarter
# or project-level
mkdir -p .codex/skills
cp -r /path/to/project-kickstarter/skills/project-kickstarter .codex/skills/
```

Alternative via the Codex marketplace CLI:

```bash
npx codex-marketplace add <your-username>/project-kickstarter --skills
```

**Settings notes:**
- Verify: `ls ~/.codex/skills/project-kickstarter/SKILL.md` (or
  `~/.agents/skills/`), then start a **new** Codex session.
- Optional Codex-only metadata (`openai.yaml`) is not required.
- Codex has no native hook events — the generated kit enforces rules via
  `AGENTS.md` + CI, documented in `docs/kickstart/hooks-report.md`.

## 4. OpenCode

OpenCode discovers skills from `.agents/skills/`, `.opencode/skills/`, and
`.claude/skills/` (project) plus `~/.agents/skills/` (global).

```bash
git clone https://github.com/<your-username>/project-kickstarter.git ~/.agents/skills/project-kickstarter
```

**Settings notes:**
- The skill loads on demand via OpenCode's native `skill` tool.
- Skill names must be lowercase-with-hyphens — `project-kickstarter`
  complies. Enforcement is via JS plugins/config rather than hook events.

## 5. GitHub Copilot

```bash
git clone https://github.com/<your-username>/project-kickstarter.git ~/.copilot/skills/project-kickstarter
```

**Settings notes:**
- Copilot reads repository instructions from
  `.github/copilot-instructions.md` — the generated kit writes this file so
  the rules and specs of record are always loaded.
- For team repos, commit the generated `.github/` config files so every
  teammate gets them on clone.
- Hook events are not native; rules + CI enforcement is documented instead.

## 6. Antigravity

```bash
git clone https://github.com/<your-username>/project-kickstarter.git ~/.antigravity/skills/project-kickstarter
```

**Settings notes:**
- ⚠️ Antigravity's skill discovery is newer and less standardized. If the
  skills path isn't picked up, check its current documentation, or use the
  `AGENTS.md` / `.agent/rules/` files the kickstart generates — those are
  Antigravity's primary configuration surface.
- Verify support at generation time; the skill never fabricates capability.

## 7. Cline

No native skill/marketplace system — use rules + workflows:

```bash
# one-time manual setup
mkdir -p .clinerules/workflows
cp /path/to/project-kickstarter/skills/project-kickstarter/SKILL.md .clinerules/workflows/kickstart.md
```

**Settings notes:**
- Invoke in chat with the workflow, or add the rules content to
  `.clinerules/*.md`.
- The generated kit writes `.clinerules/` files during Phase 5.

## 8. Windsurf

```bash
mkdir -p .windsurf/rules
cp /path/to/project-kickstarter/skills/project-kickstarter/SKILL.md .windsurf/rules/kickstarter.md
```

**Settings notes:**
- Windsurf reads `.windsurf/rules/*.md` (legacy `.windsurfrules` also works).
- No native hooks; rules-based enforcement per the generated hooks report.

---

# Usage (any agent)

Describe what you want, or invoke explicitly:

> "I want to build a recipe-sharing app — kickstart it."
> `/project-kickstarter`

The flow, in order:

```
[0] Codebase analysis (if code exists)  → docs/kickstart/codebase-analysis.md
[1] Complexity tier (Quick 30q / Standard 60q / Deep 100q / Auto)
[2] Interview rounds: 4-option questions (A–D + "Other"),
    5–10 per round, scoreboard each round, stops at ≥95% confidence
[3] Artifacts: PRD, techstack, blueprint, UI/UX, rules
[4] Agent team + project skills + rules files
[5] CLAUDE.md + AGENTS.md + per-IDE configs + hooks
[6] Execution task plan                 → docs/tasks.md
[7] Handoff: "Execute Phase 1 of docs/tasks.md as tech-lead"
```

Answer questions with short codes (`1B 2A 3C…`), pick **E) Other** for
free-text, or say **"proceed"** at any point to accept the current state
(recorded as an explicit override with the remaining unknowns listed as
`[ASSUMPTION]` items).

# Updating

```bash
# publish a new version
git add . && git commit -m "feat: improve X" && git push
git tag v0.2.0 && git push origin v0.2.0

# update per tool
# Claude Code: /plugin update project-kickstarter   (or reinstall)
# skills.sh:   npx skills update
# cloned dirs: git -C ~/.agents/skills/project-kickstarter pull
```

One repo = one source of truth. Never maintain per-IDE copies; all tools
read the same `SKILL.md`.
