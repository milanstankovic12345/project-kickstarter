---
id: TASK-001
title: Rewrite README for the agent framework with verified usage
status: review
agent: docs-writer
skills: []
model_tier: fast
priority: p2
depends_on: []
files_allowed: ["README.md"]
files_excluded: []
review: ["code"]
validation:
  - cmd: node scripts/validate.mjs
    expect: exit 0
  - cmd: node scripts/run-tests.mjs
    expect: exit 0
acceptance:
  - README documents architecture, install, configuration, permissions, model setup, every command, an end-to-end workflow, resuming, troubleshooting and limitations
  - Every shell command shown in README was executed in this session or is marked not executed
  - Original kickstarter install instructions are preserved
  - node scripts/validate.mjs reports no broken links
max_retries: 2
attempts: 0
created: 2026-10-14
updated: 2026-10-14
---

## Objective

Replace the v0.1 README with documentation of the v0.2 framework that only describes commands and capabilities that exist.

## Context

- Architecture docs: `docs/architecture/*.md` (audit, decisions, lifecycle, routing, security).
- Commands: `commands/*.md`; scripts: `scripts/*.mjs`; agents: `config/agent-registry.json`.
- The bootstrap-generated section between `project-kickstarter:start/end` markers must stay intact (dogfooding).
- Live LLM evals are out of scope (user decision); plugin commands inside Claude Code are documented but cannot be executed from this session.

## Steps

1. Run every script command that will be shown and capture its output.
2. Write README sections: overview, architecture, install, configuration, commands, workflow, resume, troubleshooting, limitations.
3. Keep the original multi-IDE install instructions, marking unverified claims.
4. Run the validation commands.

## Blockers

Stop if a documented command fails or a capability cannot be verified and cannot be clearly marked as unverified.

## Deliverables

- `README.md`
- `reports/handoffs/TASK-001.md`
