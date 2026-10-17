---
id: {{id}}
title: {{title}}
status: draft
agent: {{agent}}
skills: []
model_tier: coding
priority: p2
depends_on: []
files_allowed:
  - {{scope_glob}}
files_excluded: []
review: [code]
validation:
  - cmd: {{validation_cmd}}
    expect: exit 0
acceptance:
  - {{acceptance_criterion}}
max_retries: 2
attempts: 0
created: {{date}}
updated: {{date}}
---

## Objective

One sentence: the single outcome this task delivers.

## Context

Only what the assigned agent needs: relevant files, decisions, links to
`project-context/project-profile.md` sections. No conversation history.

## Steps

1. Write or update the failing test that encodes the acceptance criteria.
2. Implement the smallest change that makes it pass.
3. Run every command in `validation` and record exit codes in the handoff.

## Blockers

Stop and write a handoff with `status: blocked` when: the change needs files
outside `files_allowed`, an acceptance criterion is ambiguous, a dependency
is missing, or a validation command cannot run in this environment. Never
widen scope silently.

## Deliverables

- Code/tests within `files_allowed`
- `reports/handoffs/{{id}}.md` (see templates/handoff.md)
