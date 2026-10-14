# Initial Audit — project-kickstarter (v0.1.0)

- Date: 2026-10-14
- Commit audited: `050c4b9` (branch `main`)
- Scope: every tracked file (26 files, ~1,465 lines)
- Method: read every file; ran `claude plugin validate . --strict` and
  `claude plugin validate .claude-plugin/plugin.json --strict` (Claude Code 2.1.300);
  checked platform claims against the docs at code.claude.com (see
  [research-and-decisions.md](research-and-decisions.md)).

## 1. Inventory

| Component | Path | Purpose |
|---|---|---|
| Marketplace manifest | `.claude-plugin/marketplace.json` | Marketplace `milan-plugins` with one plugin, `source: "./"` |
| Plugin manifest | `.claude-plugin/plugin.json` | `project-kickstarter` v0.1.0 |
| Skill | `skills/project-kickstarter/SKILL.md` | 8-phase interview → kit pipeline (144 lines) |
| References | `skills/project-kickstarter/references/*.md` (6) | question catalog (~94 Qs), confidence scoring, artifact guide, codebase analysis, agent team blueprints, IDE compatibility |
| Doc templates | `templates/{prd,techstack,blueprint,uiux,rules,tasks}.md`, `claudemd.template` | Skeletons for generated docs |
| Agent templates | `templates/agents/*.md` (6) | tech-lead, backend, frontend, qa, devops, security-reviewer |
| Hook templates | `templates/hooks/{guard-bash,post-edit}.mjs`, settings snippet | Copied into target projects |
| README | `README.md` | Install instructions for 9 agentic IDEs + usage |

Baseline validation: both `claude plugin validate` runs **passed**. There are
no tests, no CI, no scripts and no plugin-level agents, commands or hooks.

## 2. What is worth preserving

- **The interview engine**: question catalog, confidence scoring with
  weighted dimensions and stop rules, `[ASSUMPTION]` traceability to answer
  IDs. It is well structured and loads its references progressively.
- **Codebase-analysis rules**: list `.env` key *names* only, survey before
  asking. This matches the secrets policy we need for discovery.
- **The cross-IDE config matrix**: the only part that targets non-Claude
  tools. Its claims can't all be verified from here, but it is useful.
- **The specs-of-record idea** (`docs/rules.md` as the single source,
  thin per-IDE wrappers). It carries over directly.
- **Least-privilege intent**: the security-reviewer template is already
  read-only.

## 3. Problems (severity-ranked)

### High

| ID | Problem | Evidence | Impact |
|---|---|---|---|
| H1 | `guard-bash.mjs` puts its deny message in `hookSpecificOutput.reason`. The documented field is `permissionDecisionReason`; top-level `decision`/`reason` are deprecated for PreToolUse. | `templates/hooks/guard-bash.mjs:23-29` | The deny still applies, but Claude and the user never see why. Fixing it the wrong way (top-level `reason`) would make it worse. |
| H2 | Dangerous-command patterns are narrow. They miss `rm -r -f`, `rm -fr` with paths, `git push -f`, `git clean -fdx`, `Remove-Item -Recurse -Force`, `del /s`, `TRUNCATE`, `terraform destroy`, `kubectl delete`. | same file, lines 14-20 | Destructive commands get through, especially on Windows, the author's platform. |
| H3 | No task lifecycle, state, handoff contract, quality gate or retry bound. `docs/tasks.md` is a static table. | `templates/tasks.md`, `agent-team-blueprints.md` | Nothing can verify "done". A new session can't resume without the old conversation. Agents can loop or claim completion early. |
| H4 | No independent review gate. Security findings are "reported" but nothing blocks completion on Critical/High. | `templates/agents/security-reviewer.md` | Security review is advisory only. |
| H5 | Agent templates have no blocker or failure reporting, no structured handoff, no activation conditions and no model routing. | `templates/agents/*.md` | Orchestration has to rely on free-form prose summaries. |

### Medium

| ID | Problem | Evidence | Impact |
|---|---|---|---|
| M1 | `post-edit.mjs` appends to `.claude/hooks/audit.log` relative to the process cwd, not `$CLAUDE_PROJECT_DIR`. Its header says it "reminds via stderr" but it prints nothing. | `templates/hooks/post-edit.mjs` | Logs land in the wrong directory after a `cd`. The comment misleads. |
| M2 | The task template has no validation commands, file scopes, exclusions, required skills or lifecycle states. | `templates/tasks.md` | Tasks can't be run in parallel safely and can't be verified mechanically. |
| M3 | The hook event list in `ide-compatibility.md` is a partial, hand-maintained list (e.g. no SubagentStart, SessionEnd, PreCompact). | `references/ide-compatibility.md:10` | It drifts from the platform. |
| M4 | Phases 4 (agent team) and 6 (task plan) re-implement what a reusable framework should own. Every kickstarted project gets a fresh copy of near-identical agents. | `SKILL.md` Phase 4/6 | Duplicated agents per project, no shared improvements, no idempotency. |
| M5 | No automated tests, validators or CI. | repository | Regressions in templates or hooks go unnoticed. |
| M6 | Rerunning the kickstart has no idempotency or customization detection, beyond "Never overwrite user files without confirmation" in prose. | `SKILL.md` output contract | Reruns may duplicate or clobber work. |
| M7 | No model guidance anywhere. `model` is "if the user has a preference". | `agent-team-blueprints.md` | Every agent runs on the session model, including cheap or mechanical tasks. |

### Low

| ID | Problem | Evidence |
|---|---|---|
| L1 | The `tech-lead` template uses the legacy `Task` tool name, which the docs say was renamed to `Agent` in v2.1.63; `Task` is still accepted as an alias. | `templates/agents/tech-lead.md:4` |
| L2 | README install claims that couldn't be verified from here: `npx skills add`, `npx codex-marketplace`, `~/.antigravity/skills`, Cursor remote-rule import, `/reload-skills`. | `README.md` |
| L3 | `plugin.json` lacks `repository`, `license`, `keywords`, `homepage`. | `.claude-plugin/plugin.json` |
| L4 | `marketplace.json` duplicates the plugin description by hand. | — |
| L5 | Seven mandatory "continue" gates in the interview raise interaction cost. They are kept because they are a deliberate UX choice. | `SKILL.md` |

### Checked and found not to be problems

- **Subagent nesting.** The old tech-lead delegates with `Task` from a
  subagent. Current docs allow nested spawning up to three levels, so this
  works. It is still better to orchestrate from the main thread; see the
  decisions doc.
- **Manifest validity.** Both manifests pass strict validation.
- **Secrets handling in analysis.** It already says "key names only".

## 4. Missing components (vs. the target)

- Project discovery that produces a versioned profile
- A real orchestrator that delegates, with parallel batching, conflict
  prevention and a progress ledger
- A task schema, lifecycle state machine, dependency and cycle checks,
  handoffs
- Model routing by logical tier, kept in one place
- Security agents and skills (appsec, threat modeling, supply chain,
  security testing) with a blocking gate
- Premium UI/UX agents and skills, accessibility, visual verification rules
- Independent code review and architecture review with a severity rubric
- An adaptive bootstrap with audit/plan/apply/validate modes and
  idempotency
- Self-improvement with evidence, proposals, baselines and rollback
- Runtime guardrail hooks: path protection, handoff enforcement, session
  resume
- Validators, unit and integration tests, fixture projects, CI

## 5. Target architecture (summary)

The plugin keeps its name (`project-kickstarter`, so existing installs
keep working) and becomes two layers:

1. **Framework layer** (plugin-level, reusable): `agents/` grouped into
   orchestration, engineering, review, security, ui and improvement;
   `skills/`; `commands/`; `hooks/`; `config/`; `schemas/`; `scripts/`
   (zero-dependency Node); `templates/`.
2. **Project layer** (generated per target repo by bootstrap):
   `project-context/project-profile.md`, `.claude/agent-framework.json`
   (enabled agents, gates, routing overrides),
   `.claude/agent-framework/manifest.json` (ownership hashes),
   `tasks/TASK-NNN-*.md`, `reports/{handoffs,reviews,metrics}/`, and
   project specialists in `.claude/agents/` only when justified.

The interview skill sits on top: it produces specs, then hands off to
bootstrap and task planning. The full design is in
[research-and-decisions.md](research-and-decisions.md),
[task-lifecycle.md](task-lifecycle.md), [model-routing.md](model-routing.md)
and [security-model.md](security-model.md).

## 6. Migration risks

| Risk | Mitigation |
|---|---|
| Global plugin hooks now run for every user who has the plugin enabled, including interview-only users. | Every hook is opt-in and does nothing unless the project has `.claude/agent-framework.json`. Hooks are tested for that no-op path. |
| More agents mean more description text in every session's context. | Agent descriptions stay to one or two short lines; detailed procedures live in skills loaded on demand. |
| Existing projects kickstarted with v0.1 have agents in `.claude/agents/` with the same names as the framework agents. | Bootstrap inventories existing agents and reuses them (marked "reused"), and never overwrites. Plugin agents are namespaced (`project-kickstarter:…`), so names can't collide. |
| `Task` → `Agent` rename. | Use `Agent` everywhere and leave old templates working, since the alias is kept. |
| Skill-only installs (Cursor, Codex, etc.) don't get plugin agents, hooks or scripts. | The kickstarter keeps its templates as a fallback and detects whether framework scripts are reachable. |
| Live LLM behaviour (skill triggering, real parallel dispatch) can't be tested deterministically, and the user chose not to run paid evals. | Deterministic logic is pushed into scripts with full tests; the LLM-facing parts are documented as unverified. |

## 7. Implementation plan

1. Task system, handoffs, gate (scripts, schemas, unit tests)
2. Config and model routing (`routing.mjs` sync/check/resolve)
3. Agents and skills
4. Discovery and bootstrap, with fixture-based integration tests
5. Hooks, with stdin-driven tests
6. Commands, repo validator, CI
7. Kickstarter handoff integration and template fixes
8. Dogfood on this repo
9. Docs and README
