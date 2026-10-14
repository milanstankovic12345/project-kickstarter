---
name: project-kickstarter
description: Kickstarts a new project from a raw idea. Interviews the user in confidence-driven rounds of 4-option questions (30-100 based on complexity), optionally analyzes an existing codebase first, then generates the full project kit - PRD, tech stack, blueprint, UI/UX design, rules, skills, CLAUDE.md, a complete agent team, and an execution-ready task plan. Use when the user wants to start, plan, scaffold, or spec out a new project or product idea.
---

# Project Kickstarter

Turn a raw idea into a complete, execution-ready project kit through a
confidence-driven interview, then generate every planning artifact, the agent
team, IDE configs, and hooks — adapted to whichever agentic IDE the user runs.

## Reference files (read on demand, in this order)

| File | Read when |
|---|---|
| [references/codebase-analysis.md](references/codebase-analysis.md) | Phase 0 — before questioning, if any code exists |
| [references/question-catalog.md](references/question-catalog.md) | Phase 1 — every question round |
| [references/confidence-scoring.md](references/confidence-scoring.md) | Phase 2 — after every round |
| [references/artifact-guide.md](references/artifact-guide.md) | Phase 3 — when generating documents |
| [references/agent-team-blueprints.md](references/agent-team-blueprints.md) | Phase 4 — when generating the team |
| [references/ide-compatibility.md](references/ide-compatibility.md) | Phase 5 — when writing configs and hooks |
| `templates/…` | Copy structure from these when writing outputs |

## Phase pipeline

```
Idea → [0. Preflight] → [1. Complexity tier] → [2. Question rounds] →
[3. Artifacts] → [4. Agent team + skills] → [5. CLAUDE.md + IDE configs + hooks] →
[6. Task plan] → [7. Handoff to execution]
```

Work phases strictly in order. After each phase, show the user a one-screen
summary and require an explicit "continue" before moving on. Never skip a
phase without the user asking.

### Phase 0 — Preflight & codebase analysis

1. Ask the user to state their idea in their own words (free text). Record it
   as the "seed idea".
2. Detect whether the working directory contains an existing codebase.
   - If yes: run the **codebase analysis** procedure from
     `references/codebase-analysis.md` FIRST. Produce
     `docs/kickstart/codebase-analysis.md`. Use its findings to pre-answer
     questions (mark them `[inferred from code]`) and to flag contradictions.
   - If no (greenfield): note it and move on.
3. Detect installed agentic IDEs/configs (`.claude/`, `AGENTS.md`,
   `.cursor/`, `.github/copilot-instructions.md`, `.clinerules/`,
   `.windsurf/`, `opencode.json`, `.agent/`) and record them — Phase 5 needs
   this. **Bionic (LM Studio)** leaves no project-level marker, so ask the
   user whether they run it and record it the same way.

### Phase 1 — Complexity tier

Ask one question: which tier fits?

- **A) Quick** — small tool/prototype → ~30 questions, core team of 3 agents
- **B) Standard** — full product/web app → ~60 questions, team of 5
- **C) Deep** — platform/SaaS/enterprise → ~100 questions, team of 7–8
- **D) Auto** — you (the agent) infer the tier from the idea + codebase
  analysis and confirm with the user

The tier sets the question budget and team size; it can be changed later.

### Phase 2 — Confidence-driven question rounds

Run interview rounds following `references/question-catalog.md` (question
pool) and `references/confidence-scoring.md` (scoring + loop rules).

Hard rules:

- **4 options per question** (A–D). Always append a 5th implicit option:
  *"E) Other — I'll describe it"*. If the user picks E, capture free text.
- **5–10 questions per round**, selected from the catalog by the
  lowest-scoring confidence dimensions.
- **Batch questions in one message** (numbered list), and also tell the user
  they can answer with short codes like `1B 2A 3C 4D 5A`.
- After each round: re-score confidence per `confidence-scoring.md`,
  show a compact scoreboard, then either continue or stop.
- **Stop condition:** weighted overall confidence ≥ **95%** AND no dimension
  below 85%, OR the user explicitly says "proceed" (record that as an override
  with the current score), OR the tier's question budget is exhausted
  (report the final score and assumptions honestly).
- Minimum 3 rounds. Never pad with filler questions — when the budget runs
  out early because confidence hit 95%, stop.
- Track answers in `docs/kickstart/answers.md` (append-only log, one line per
  answer: `Q14 → B — Postgres`). This log is the source of truth for every
  downstream artifact.

### Phase 3 — Artifacts

Generate into `docs/` (or the user's preferred folder), following
`references/artifact-guide.md` and the templates:

1. `docs/prd.md` — product requirements
2. `docs/techstack.md` — tech stack with justifications per decision
3. `docs/blueprint.md` — system architecture blueprint
4. `docs/uiux.md` — UI/UX design (skip for API-only/CLI products)
5. `docs/rules.md` — engineering rules (source for all IDE configs)

Every claim must trace back to an answer ID (`Q14 → B`) or be marked
`[ASSUMPTION]`. No invented requirements.

### Phase 4 — Agent team, skills, rules

**Detect the framework first.** It is available when this skill was loaded
from the project-kickstarter plugin, so that
`${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap.mjs` exists. Check with
`node -e "process.exit(require('fs').existsSync(process.argv[1])?0:1)" "${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap.mjs"`.

- **Framework available (Claude Code plugin install):** don't copy agent
  templates. Invoke the `project-kickstarter:project-bootstrap` skill
  (audit → plan → apply). It enables only the framework agents this
  project needs, reuses existing ones, generates justified specialists,
  and writes the project profile and config. Then add what bootstrap
  doesn't cover:
  - `.claude/skills/<project>-conventions|domain|runbook/SKILL.md`, from
    the answers. Only the relevant ones.
  - `.claude/rules/*.md`, from `docs/rules.md`.
- **Framework not available** (skill-only install, or an IDE without
  plugins): fall back to the templates. Write `.claude/agents/<role>.md`
  for each team member following
  `references/agent-team-blueprints.md`, plus the same project skills and
  rules as above.

### Phase 5 — CLAUDE.md, IDE configs, hooks

Following `references/ide-compatibility.md`:

- Generate `CLAUDE.md` (template in `templates/`).
  - **Framework available:** replace the template's "Agent Team" table
    with a single pointer to `/project-kickstarter:run-task` and
    `/project-kickstarter:status`. Then re-run
    `bootstrap.mjs apply` (idempotent) so it adds its marker section to
    the new CLAUDE.md.
- For every IDE detected in Phase 0 (or every IDE the user names): write the
  correct instructions/rules files (AGENTS.md, `.cursor/rules/`,
  `.github/copilot-instructions.md`, `.clinerules/`, …) so all tools share
  one source of truth.
- Install hooks **per IDE capability**: Claude Code hook events in
  `.claude/settings.json`, Cursor `hooks.json`, and for IDEs without native
  hooks, document the equivalent enforcement path (rules + CI) in
  `docs/kickstart/hooks-report.md`. Never claim a hook works where the IDE
  has no hook support.

### Phase 6 — Task plan

- **Framework available:**
  1. Follow the `project-kickstarter:task-planning` skill. Turn the PRD
     user stories and blueprint components into `tasks/TASK-NNN-*.md`
     files: one-session tasks with file scopes, dependencies, exact
     validation commands and acceptance criteria taken from the stories.
  2. Run `${CLAUDE_PLUGIN_ROOT}/scripts/tasks.mjs validate` until it
     passes.
  3. Write `docs/tasks.md` as a short index: the phases, plus the output
     of `tasks.mjs status`.
- **Framework not available:** generate `docs/tasks.md` from
  `templates/tasks.md`: phased, dependency-ordered tasks with acceptance
  criteria and an owning agent from the Phase 4 team.

### Phase 7 — Handoff

Print:
- what was generated, and where;
- the confidence score;
- the remaining `[ASSUMPTION]` items;
- the next step:
  - framework available: promote the reviewed tasks with
    `tasks.mjs transition <ID> ready`, then run
    `/project-kickstarter:run-task`;
  - fallback: "Execute Phase 1 of docs/tasks.md as tech-lead; delegate per
    the plan."

## Output contract (all phases)

- One summary screen per phase: files written, key decisions, open questions.
- All generated files must be valid for the detected IDEs; when in doubt
  about an IDE capability, check `references/ide-compatibility.md` first.
- Never overwrite user files without confirmation.
