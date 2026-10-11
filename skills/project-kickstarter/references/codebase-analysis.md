# Codebase Analysis (Phase 0, brownfield only)

Run this BEFORE the questionnaire when the working directory contains code.
Goal: understand what exists so questions only fill real gaps.

## Procedure

1. **Inventory manifests** (read, don't guess):
   `package.json`, `pyproject.toml`, `requirements*.txt`, `go.mod`,
   `Cargo.toml`, `pom.xml`/`build.gradle`, `composer.json`, `Gemfile`,
   `pubspec.yaml`, `*.csproj`, `mix.exs`.
2. **Detect frameworks & versions** from manifests and lockfiles
   (framework fields, dependencies/devDependencies).
3. **Map the structure**: top-level directories, src layout, monorepo?
   (workspaces, pnpm-workspace.yaml, turbo.json, nx.json).
4. **Identify persistence**: ORM/config files (prisma, drizzle, knex,
   alembic, migrations/), docker-compose services, DB URLs in `.env*`
   (key names only — never print secret values).
5. **Build & test tooling**: scripts in package.json / Makefile / justfile,
   CI configs (`.github/workflows/`, `.gitlab-ci.yml`).
6. **Existing agent configs**: `CLAUDE.md`, `AGENTS.md`, `.claude/` (agents,
   skills, rules, settings, hooks), `.cursor/`, `.clinerules/`,
   `.windsurf/`, `.github/copilot-instructions.md`, `opencode.json`,
   `.agent/` — list what exists so Phase 5 can merge rather than duplicate.
7. **Docs**: README, docs/, ADRs — summarize claimed architecture.

## Output: `docs/kickstart/codebase-analysis.md`

Required sections:

1. **Stack summary** — languages, frameworks, versions, key dependencies.
2. **Architecture snapshot** — layers, entry points, data flow as far as
   observable, storage, external services.
3. **Tooling snapshot** — build, test, lint, CI/CD, deploy hints.
4. **Agent config inventory** — existing CLAUDE.md/AGENTS.md/rules/skills
   and whether they look maintained or stale.
5. **Pre-answered questions** — catalog question IDs the code already
   answers (e.g. T1, T2, D1, O2), each marked `[inferred from code]` with
   the evidence file path.
6. **Contradictions & unknowns** — e.g. README says Postgres but no driver
   in lockfile; these become priority questions in round 1.
7. **Risk flags** — outdated/deprecated deps, missing tests, secrets in
   repo, no CI.

## Rules

- Never print secret values from `.env` — key names only.
- Cap exploration: this is a survey, not an audit. Prefer breadth over depth.
- If the repo is huge, analyze manifests + top 2 levels + CI first, then
  drill into the areas the seed idea touches.
