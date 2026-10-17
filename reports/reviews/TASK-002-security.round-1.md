---
task: TASK-002
kind: security
reviewer: security-reviewer
model: null
round: 1
verdict: block
scope_checked: [tasks/TASK-002-fix-independent-review-findings-in-gate-handoff-.md, reports/handoffs/TASK-002.md, hooks/lib/bash-rules.mjs, hooks/guard-bash.mjs, hooks/guard-paths.mjs, hooks/lib/common.mjs, config/protected-paths.json, scripts/lib/glob.mjs, scripts/lib/handoff.mjs, scripts/lib/gate.mjs, scripts/lib/tasks.mjs, scripts/reports.mjs, scripts/lib/project.mjs, docs/architecture/security-model.md]
not_checked: [scripts/lib/frontmatter.mjs, scripts/validate.mjs, template copy, hooks/require-handoff.mjs, hooks/validate-artifact.mjs, end-to-end stdin hook runs, PowerShell write forms beyond Remove-Item]
findings:
  - id: SEC-1
    severity: high
    title: "Implementer can save a forged review by putting a flag before the action or quoting the kind, then self-transition to done"
    location: "hooks/lib/bash-rules.mjs:77"
    confidence: 90
    status: open
    verified: false
    acceptance_ref: null
  - id: SEC-2
    severity: medium
    title: "git global options (-C, -c, --no-pager) defeat the anchored git write rules"
    location: "hooks/lib/bash-rules.mjs:64"
    confidence: 85
    status: open
    verified: false
    acceptance_ref: null
  - id: SEC-3
    severity: medium
    title: "Interpreter one-liners (node -e, python -c) write reviews/task files or the working tree without detection"
    location: "hooks/lib/bash-rules.mjs:133"
    confidence: 80
    status: open
    verified: false
    acceptance_ref: null
  - id: SEC-4
    severity: low
    title: "Globbed secret reads (cat .env*, cat config/*.env) are not flagged"
    location: "hooks/lib/bash-rules.mjs:50"
    confidence: 85
    status: open
    verified: false
    acceptance_ref: null
  - id: SEC-5
    severity: low
    title: "Read-only agents can delete or rewrite files via find -delete, xargs rm, npm run <script> -- --fix"
    location: "hooks/lib/bash-rules.mjs:62"
    confidence: 80
    status: open
    verified: false
    acceptance_ref: null
---

## Findings

**SEC-1 (high).** The review-save denial is bypassed in three ways: `node reports.mjs --root X save review …`, `--json` before the action, and a quoted `"review"`. No subagent restriction exists on `tasks.mjs transition`. Fix: tokenize the invocation, and deny `tasks.mjs transition` for subagents other than the orchestrator and planner.

**SEC-2 (medium).** `git -C . checkout -- tasks/…` and `git -C . stash` are allowed. Fix: strip git global options before matching.

**SEC-3 (medium).** `node -e "require('fs').writeFileSync('reports/reviews/…')"` and `python -c "open(…,'w')"` are allowed. Fix: deny interpreter one-liners that reference protected targets, and flag fs-write calls for read-only agents.

**SEC-4 (low).** `cat .env*` and `cat config/*.env` are allowed. Fix: allow glob characters around the token.

**SEC-5 (low).** `find -delete`, `xargs rm` and `npm run lint -- --fix` are allowed for reviewers. Fix: add WRITES rules for them.

The legitimate workflow showed no false positives. Probe outputs are recorded in the reviewer's report.

## Coverage statement

About 80 classify() probes across implementer, reviewer and orchestrator option sets. Also ran `node scripts/run-tests.mjs` (75/75 pass) and `node scripts/validate.mjs` (OK). End-to-end stdin hook runs and deliberate obfuscation were not tested. Bash classification is pattern-based and is not a capability boundary. This review does not claim the system is secure.
