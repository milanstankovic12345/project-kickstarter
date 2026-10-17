# Bootstrap report

Mode: apply · Generator: project-kickstarter bootstrap 0.2.0 · Source hash: d1b063a47d54252e

## Discovery

Languages: JavaScript · Frameworks: none · Tests: 10 files · CI: github-actions · UI: no

## Agents

Enabled:
- `code-reviewer` — core agent (always enabled)
- `dependency-auditor` — dependency manifests present [rule deps]
- `devops-engineer` — CI, containers or IaC detected [rule delivery]
- `docs-writer` — core agent (always enabled)
- `implementer` — core agent (always enabled)
- `improvement-analyst` — core agent (always enabled)
- `orchestrator` — core agent (always enabled)
- `planner` — core agent (always enabled)
- `project-discoverer` — core agent (always enabled)
- `security-reviewer` — core agent (always enabled)
- `test-engineer` — core agent (always enabled)

Omitted (no project signal):
`architect`, `backend-engineer`, `frontend-engineer`, `database-engineer`, `refactoring-engineer`, `performance-engineer`, `integration-engineer`, `architecture-reviewer`, `threat-modeler`, `security-tester`, `ui-director`, `accessibility-auditor`, `visual-qa`

Reused existing components:
- none

Project specialists:
- none justified

## File actions

Created (0):

Updated (0):

Unchanged (3):
- `.claude/agent-framework.json` — enabled agents, aliases, specialists, validation commands
- `project-context/project-profile.md` — source hash unchanged
- `README.md` — usage instructions for the framework

Conflicts (0) — not overwritten:

Skipped (1):
- `CLAUDE.md` — CLAUDE.md does not exist; not created

## Next steps

1. Review generated tasks in `tasks/` (status `draft`) and promote: `node <plugin-root>/scripts/tasks.mjs transition TASK-NNN ready`.
2. Enrich `project-context/project-profile.md` Notes (project-discoverer agent) if needed.
3. Run `/project-kickstarter:run-task` to execute ready tasks.

