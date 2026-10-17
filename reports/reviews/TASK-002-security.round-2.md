---
task: TASK-002
kind: security
reviewer: security-reviewer
model: null
round: 2
verdict: block
scope_checked: [reports/reviews/TASK-002-security.round-1.md, reports/handoffs/TASK-002.md, hooks/lib/bash-rules.mjs, hooks/guard-bash.mjs, scripts/reports.mjs, scripts/tasks.mjs, "node scripts/run-tests.mjs (83/83 pass)", "~110 classify() probes"]
not_checked: [end-to-end stdin hook runs, hooks/guard-paths.mjs changes, template parity beyond tests, "deliberate obfuscation (out of scope)", PowerShell write forms beyond Set-Content/Remove-Item]
findings:
  - id: SEC-1
    severity: high
    title: "Implementer can save a forged review by putting a flag before the action or quoting the kind, then self-transition to done"
    location: "hooks/lib/bash-rules.mjs:132"
    confidence: 90
    status: open
    verified: false
    acceptance_ref: null
  - id: SEC-2
    severity: medium
    title: "git global options (-C, -c, --no-pager) defeat the anchored git write rules"
    location: "hooks/lib/bash-rules.mjs:117"
    confidence: 85
    status: fixed
    verified: true
    acceptance_ref: null
  - id: SEC-3
    severity: medium
    title: "Interpreter one-liners (node -e, python -c) write reviews/task files or the working tree without detection"
    location: "hooks/lib/bash-rules.mjs:81"
    confidence: 85
    status: open
    verified: false
    acceptance_ref: null
  - id: SEC-4
    severity: low
    title: "Globbed secret reads (cat .env*, cat config/*.env) are not flagged"
    location: "hooks/lib/bash-rules.mjs:51"
    confidence: 85
    status: fixed
    verified: true
    acceptance_ref: null
  - id: SEC-5
    severity: low
    title: "Read-only agents can delete or rewrite files via find -delete, xargs rm, npm run <script> -- --fix"
    location: "hooks/lib/bash-rules.mjs:70"
    confidence: 80
    status: fixed
    verified: true
    acceptance_ref: null
  - id: SEC-6
    severity: low
    title: "PROTECTED_TARGET matches read-only interpreter calls and commit messages (false-positive deny)"
    location: "hooks/lib/bash-rules.mjs:197"
    confidence: 80
    status: open
    verified: false
    acceptance_ref: null
  - id: SEC-7
    severity: low
    title: "Searching for the string .env (rg/grep pattern) triggers the secret-file ask"
    location: "hooks/lib/bash-rules.mjs:194"
    confidence: 80
    status: open
    verified: false
    acceptance_ref: null
  - id: SEC-8
    severity: low
    title: "Residual wrapper variants: xargs -n1/-I{}, find -exec /bin/rm, git -P"
    location: "hooks/lib/bash-rules.mjs:116"
    confidence: 75
    status: open
    verified: false
    acceptance_ref: null
---

## Findings

**SEC-1 (high, open).** These forms still bypass the check:
- `node --no-warnings scripts/reports.mjs save review …`
- `node -r ./x.cjs scripts/tasks.mjs transition …`
- a subshell, as in `(node scripts/tasks.mjs transition TASK-001 done)`
- `bash -lc '…'`

Fix: skip node options, handle subshells and combined `-c` flags, or default-deny when these words appear.

**SEC-3 (open).** `node --input-type=module -e "import {writeFileSync} …"`, `node <<'EOF' … EOF` and `python - <<'EOF'` all write without detection. Fix: allow options before `-e`, and classify interpreter heredoc bodies.

**SEC-6.** Read-only `node -e` reads of protected paths are denied. So are commit messages that mention `reports/reviews`, and `git add` of a handoff.

**SEC-7.** `rg -n "\.env"` asks.

**SEC-8.** `xargs -n1 rm`, `find -exec /bin/rm` and `git -P checkout` are allowed for reviewers.

SEC-2, SEC-4 and SEC-5 were verified fixed by probes. The legitimate workflows for implementer, reviewer, orchestrator, planner and main thread are all allowed.

## Coverage statement

Probed classify() only, with no end-to-end hook runs. 83/83 tests pass. Bash classification is a pattern-based speed bump, not a capability boundary. This review does not claim the system is secure.
