---
description: Evidence-based self-improvement - analyze framework metrics, rejected handoffs, review findings and feedback, and write versioned improvement proposals with baselines and rollback. Sensitive changes require human approval.
argument-hint: "[focus area or feedback text]"
disable-model-invocation: true
---

Focus / feedback: `$ARGUMENTS`

1. Invoke the `project-kickstarter:self-improvement` skill.
2. Resolve the analyst's model with
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/routing.mjs" resolve improvement-analyst --json`.
3. Dispatch the `project-kickstarter:improvement-analyst` subagent with
   the plugin root (`${CLAUDE_PLUGIN_ROOT}`) and the focus. It writes
   proposals only.
4. Present each proposal: evidence → change → baseline → expected effect
   → rollback.

Don't apply any proposal without explicit user approval. Proposals that
touch protected paths (security policy, permissions, hooks, routing,
global instructions) also trigger permission prompts when edited.
