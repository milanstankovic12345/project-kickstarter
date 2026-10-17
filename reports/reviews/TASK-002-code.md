---
task: TASK-002
kind: code
reviewer: code-reviewer
model: null
round: 3
verdict: block
scope_checked: [hooks/lib/bash-rules.mjs, skills/project-kickstarter/templates/hooks/guard-bash.mjs, tests/unit/review-round3.test.mjs, reports/reviews/TASK-002-code.round-2.md]
not_checked: [byte-for-byte template parity, test execution (no shell), hooks/lib/common.mjs access mapping, SEC-* items beyond overlap]
findings:
  - id: CR-1
    severity: high
    title: "stripHeredocs swallows a same-line redirect, so 'cat <<EOF > reports/reviews/X.md' is not seen as a write (F1 bypass)"
    location: "hooks/lib/bash-rules.mjs:92"
    confidence: 85
    status: fixed
    verified: true
    acceptance_ref: null
  - id: CR-2
    severity: medium
    title: "Output-redirect rule ignores '1>', '&>' and '>|' forms"
    location: "hooks/lib/bash-rules.mjs:61"
    confidence: 80
    status: fixed
    verified: true
    acceptance_ref: null
  - id: CR-3
    severity: medium
    title: "Command-word WRITES rules anchored at segment start miss then/do/xargs/env/bash -c wrapped commands"
    location: "hooks/lib/bash-rules.mjs:153"
    confidence: 75
    status: fixed
    verified: true
    acceptance_ref: null
  - id: CR-4
    severity: medium
    title: "SECRET_FILE tested on unblanked segment, so quoted prose mentioning .env triggers ask"
    location: "hooks/lib/bash-rules.mjs:253"
    confidence: 75
    status: fixed
    verified: true
    acceptance_ref: null
  - id: CR-5
    severity: high
    title: "Heredoc body of a framework script call (node reports.mjs save ... <<'EOF') is treated as interpreter code, so legitimate handoff/review saves can be denied"
    location: "hooks/lib/bash-rules.mjs:218"
    confidence: 85
    status: open
    verified: false
    acceptance_ref: null
---

## Findings

CR-1 to CR-4 remain fixed after re-tracing.

CR-5 (new, high) is caused by INTERPRETER_CMD, which matches `node …/reports.mjs save …` heredocs. The body is stdin data, but it gets tested with INTERPRETER_WRITE, which matches plain words such as rename, unlink and writeFile.
- An implementer handoff that mentions such a word plus a protected path is denied.
- A reviewer review that mentions such a word is denied by the read-only branch.

Fix: skip bodies when the consuming command is a framework script call or has a script-file argument. Treat only bare stdin forms (`node`, `node -`, `python -`) as code. Add regression tests. The main session confirmed the reproduction for both cases.

## Coverage statement

Static reading only. Template checked by grep, not diffed. Independent session (feature-dev:code-reviewer agent type).
