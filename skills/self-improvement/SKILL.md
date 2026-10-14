---
name: self-improvement
description: Controlled, evidence-based improvement of the agent framework - analyzes recorded metrics (rejected handoffs, fix loops, failed tasks, review findings, missing handoffs), user feedback and skill effectiveness, and writes versioned improvement proposals with baselines, success metrics and rollback; never self-modifies security policy, permissions, hooks or global instructions without human approval. Use for /project-kickstarter:improve, retrospectives, or when agents keep making the same mistake.
---

# Controlled self-improvement

> `<plugin-root>` in commands below means `${CLAUDE_PLUGIN_ROOT}`. If that
> still shows literally, it is the plugin folder that contains the `skills/`
> directory you read this file from.

An improvement needs **evidence**, a **baseline** to compare against, a
**success metric**, and a **rollback**. Without all four, don't write a
proposal. Report what data is missing instead.

## 1. Gather evidence (read-only)

```bash
node "<plugin-root>/scripts/metrics.mjs" summary --json     # events, rejection reasons, fix loops, signals
node "<plugin-root>/scripts/metrics.mjs" proposals          # existing proposals and their status
```

Also look at:
- `reports/reviews/` and `reports/audits/`: recurring finding titles and
  categories across tasks;
- `reports/handoffs/`: `unresolved` and `risks` that keep coming back;
- `*.rejected` handoff candidates: what validation caught;
- user feedback given in the command arguments or the conversation.

What isn't tracked: token usage, cost and per-dispatch latency aren't
available to the framework. Don't estimate them. If a proposal is about
cost, base it on observable proxies such as dispatch counts, fix loops and
model tier per task.

## 2. Decide whether a proposal is justified

Propose a change only when:
- the same failure appears **at least twice**, or a single failure was
  severe (a false "done", a missed Critical finding); **and**
- you can point to the instruction, skill, rule or config that should have
  prevented it; **and**
- you can name a measurable effect, for example "handoff rejections for
  skipped validation drop to 0 over the next 10 tasks", or "fixture test X
  passes".

**Redundant skills or instructions** are also valid targets. Examples: two
skills giving conflicting rules, or a reference file that no agent reads
for its tasks. Show the conflicting lines.

## 3. Write the proposal

Write it as `reports/improvements/PROP-NNN-<slug>.md`, with frontmatter
matching `<plugin-root>/schemas/proposal.schema.json`:

```yaml
---
id: PROP-001
title: Make validation-command evidence explicit in implementer agents
status: proposed
targets: [agents/implementer.md, skills/handoff-protocol/SKILL.md]
evidence:
  - "metrics: 3 handoffs rejected with validation_not_run (2026-10-01..10-14)"
  - "reports/handoffs/TASK-012.md.rejected: lint command missing"
hypothesis: Implementers skip lint because the protocol lists it after tests.
baseline:
  scenario: tests/integration/cli.test.mjs handoff rejection cases + last 10 tasks
  command: node scripts/run-tests.mjs && node scripts/metrics.mjs summary --json
  result: "60/60 tests pass; validation_not_run = 3"
success_metric: validation_not_run = 0 over the next 10 handoffs; tests still pass
sensitive: false
approved_by: null
version_bump: patch
rollback: git revert <commit>; plugin version back to the previous tag
created: 2026-10-14
---
```

The body shows the exact diff you propose, and why it is the smallest
change that addresses the evidence.

## 4. Safety rules (non-negotiable)

- `sensitive: true` applies to any proposal that touches:
  - security policy (`skills/security-review/**`);
  - evidence rules (`skills/handoff-protocol/**`);
  - permissions or tools in agent frontmatter;
  - `hooks/**`;
  - `config/protected-paths.json`, `config/model-routing.json` or
    `config/agent-registry.json`;
  - gate settings;
  - CLAUDE.md or other global instructions.

  Such proposals need `approved_by: <named human>` before anyone applies
  them. The edit triggers a permission prompt because of the
  protected-paths hook.
- The analyst only writes proposals. It never applies them.
- Applying a proposal is an ordinary task, created through
  `/project-kickstarter:plan`, with review and validation. After it is
  applied, re-run the baseline command, record `result`, and set `status:
  evaluated`. If the metric didn't improve, or a test regressed, roll back
  (`git revert`) and set `status: rolled_back`.
- Version every applied framework change: bump `plugin.json`, add a
  `CHANGELOG.md` entry, and commit on its own so that `git revert` gives a
  clean rollback.
- Never weaken a gate, delete a test, or widen permissions to make a
  metric look better.
