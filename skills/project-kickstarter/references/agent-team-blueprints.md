# Agent Team Blueprints (Phase 4)

Generate the team sized to the tier. All agents are written as Claude Code
subagents in `.claude/agents/<role>.md` (see templates/agents/), follow the
subagent frontmatter format, and reference the generated project rules and
skills.

## Team sizes by tier

| Tier | Agents |
|---|---|
| Quick (30q) | tech-lead, fullstack-engineer, qa-engineer |
| Standard (60q) | tech-lead, backend-engineer, frontend-engineer, qa-engineer, devops-engineer |
| Deep (100q) | + security-reviewer, code-reviewer (and data-engineer if D3/C3/C4 are heavy) |

## Roles and responsibilities

| Agent | Owns | Reads | Never does |
|---|---|---|---|
| **tech-lead** | Decomposes tasks, assigns work, reviews architecture consistency, merges plans | prd, blueprint, techstack, tasks | Writes feature code |
| **backend-engineer** | API, data layer, business logic, jobs | blueprint (data model, API surface), rules | Frontend |
| **frontend-engineer** | UI, components, state, a11y | uiux.md, design system choice, rules | Backend, schema changes |
| **fullstack-engineer** | (Quick tier only) end-to-end features | prd, blueprint, rules | Architecture changes |
| **qa-engineer** | Test plans, test writing, E2E, verifies acceptance criteria | prd (stories/AC), tasks | Fixes prod code directly (proposes instead) |
| **devops-engineer** | CI/CD, environments, IaC, deploy scripts, hooks maintenance | techstack (hosting), blueprint (topology) | App feature code |
| **security-reviewer** | Threat model, auth/authz review, secrets, dependency audit | rules (security baseline), blueprint | Fixes directly (reports instead) |
| **code-reviewer** | Per-PR quality review against rules.md | rules.md, diff | Style bikeshedding beyond rules |

## Per-agent file format

Every `.claude/agents/<role>.md` must contain:

1. Frontmatter: `name`, `description` (when to delegate to it), `tools`
   (least privilege — e.g. security-reviewer gets read-only tools),
   `model` if the user has a preference.
2. **Mission** — 2–3 sentences.
3. **Context to load first** — exact file paths (docs/prd.md, etc.).
4. **Rules to obey** — pointer to the relevant `.claude/rules/*.md` files,
   plus 3–5 role-specific hard rules.
5. **Output contract** — what it must return (e.g. reviewer returns
   findings as severity-rated list with file:line).

## Project skills generated alongside the team

Create `.claude/skills/` entries derived from answers (only those relevant):

- `<project>-conventions/SKILL.md` — from rules.md + T answers
- `<project>-domain/SKILL.md` — glossary of domain terms from D answers
- `<project>-runbook/SKILL.md` — how to run/test/deploy locally (from O answers)

## Coordination contract

- Task assignment lives in `docs/tasks.md` (column: suggested agent).
- tech-lead is the only agent that re-plans; others report blockers back.
- All agents must cite the task ID they worked on in their final summary.
