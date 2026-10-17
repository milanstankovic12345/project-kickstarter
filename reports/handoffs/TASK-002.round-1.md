---
task: TASK-002
agent: implementer
model: claude-opus-5-5
attempt: 0
status: done
summary: Fixed independent-review findings F1-F12 in gate, handoff scope, lifecycle and guards, each with a regression test that fails on the pre-fix code.
files_modified:
  - config/protected-paths.json
  - hooks/guard-bash.mjs
  - hooks/guard-paths.mjs
  - hooks/lib/bash-rules.mjs
  - scripts/lib/frontmatter.mjs
  - scripts/lib/gate.mjs
  - scripts/lib/glob.mjs
  - scripts/lib/handoff.mjs
  - scripts/lib/project.mjs
  - scripts/lib/tasks.mjs
  - scripts/reports.mjs
  - scripts/validate.mjs
  - skills/orchestration/SKILL.md
  - skills/project-kickstarter/templates/hooks/guard-bash.mjs
  - tests/integration/hooks.test.mjs
  - tests/integration/validate.test.mjs
  - tests/unit/review-findings.test.mjs
  - tests/unit/tasks.test.mjs
  - tests/unit/yaml.test.mjs
tests:
  - cmd: node scripts/run-tests.mjs
    exit_code: 0
    summary: 75 tests, 75 pass, 0 fail
  - cmd: node scripts/validate.mjs
    exit_code: 0
    summary: "OK: 24 agents, 12 skills, 8 commands checked; 0 error(s), 0 warning(s)"
unresolved: []
risks:
  - Bash classification remains pattern-based (documented limitation); F1 shell-level protection covers common write forms only
decisions:
  - "Scope widened to scripts/reports.mjs and scripts/validate.mjs after the handoff validator rejected the first save (scope violation); recorded in the task Context"
  - "Executed by the main session in the implementer role (plugin agents unavailable in this session)"
next_steps:
  - Independent code and security re-review of the fixes
blocker: null
---

## What changed
- glob: path normalisation, escapesRoot, ** inside braces, nocase option (F2, F11)
- handoff: rejects paths escaping the project root (F2)
- gate/reports: namespace- and case-insensitive reviewer independence; word-boundary approver check rejecting agent-like slugs (F5, F12)
- tasks: any re-entry to in_progress after a round consumes retry budget and archives the round's handoff/reviews as *.round-N.md (F6, F7)
- frontmatter: BOM-tolerant, line-ending-preserving in-place updates (F8, F12)
- bash-rules: anchored command-word write detection on quote-blanked segments, anchored framework-script exemption, rm long options, secret-file references after any command, env-dump anchoring, subagent denial of review/audit saves and of shell writes to framework state (F1, F3, F4, F9, F10, F12)
- guard-paths/protected-paths: subagents cannot Edit/Write reviews, handoffs, audits, risk acceptances; case-insensitive matching on Windows/macOS (F1, F11)
- validate.mjs: flags stray control characters in scripts/tests (found two real occurrences during this task)

## Evidence
tests/unit/review-findings.test.mjs: 11 tests; all 11 fail against the pre-fix commit (run in a git worktree) and pass after the fix.
