---
task: TASK-002
kind: code
reviewer: code-reviewer
model: null
round: 2
verdict: approve
scope_checked: [hooks/lib/bash-rules.mjs, hooks/guard-bash.mjs, tests/unit/review-round2.test.mjs, reports/handoffs/TASK-002.md, reports/reviews/TASK-002-code.round-1.md, agents/orchestrator.md, skills/orchestration/SKILL.md]
not_checked: [template parity, SEC-* items beyond overlap, test execution (no shell), hooks/lib/common.mjs access mapping]
findings:
  - id: CR-1
    severity: high
    title: "stripHeredocs swallows a same-line redirect, so 'cat <<EOF > reports/reviews/X.md' is not seen as a write (F1 bypass)"
    location: "hooks/lib/bash-rules.mjs:81"
    confidence: 85
    status: fixed
    verified: true
    acceptance_ref: null
  - id: CR-2
    severity: medium
    title: "Output-redirect rule ignores '1>', '&>' and '>|' forms"
    location: "hooks/lib/bash-rules.mjs:59"
    confidence: 80
    status: fixed
    verified: true
    acceptance_ref: null
  - id: CR-3
    severity: medium
    title: "Command-word WRITES rules anchored at segment start miss then/do/xargs/env/bash -c wrapped commands"
    location: "hooks/lib/bash-rules.mjs:62"
    confidence: 75
    status: fixed
    verified: true
    acceptance_ref: null
  - id: CR-4
    severity: medium
    title: "SECRET_FILE tested on unblanked segment, so quoted prose mentioning .env triggers ask"
    location: "hooks/lib/bash-rules.mjs:131"
    confidence: 75
    status: fixed
    verified: true
    acceptance_ref: null
---

## Findings

CR-1 to CR-4 were each verified by tracing the code. The heredoc opener tail is preserved. REDIRECT is fd-aware and still excludes `2>&1` and `/dev/null`, and `>|` is kept intact. LEADING normalization terminates, and recursion depth is capped at 3. MESSAGE_ARGS removes prose before the secret check.

Three residuals fall below the reporting threshold:
- `xargs -0 cmd` remains partially unanchored.
- The `xargs` option group could backtrack on unrealistic input.
- A `node -e` that only reads a protected path is denied for subagents.

No regressions: read-only agents can still run git diff/log/status, rg, grep, `npm test 2>&1 | tail` and `node scripts/run-tests.mjs`. Review saves with `--root` or heredocs still work for reviewers. The transition restriction matches the documented callers.

## Coverage statement

Static reading and hand-tracing only; no commands executed. Independent session (feature-dev:code-reviewer agent type).
