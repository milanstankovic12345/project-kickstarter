---
task: TASK-002
kind: security
reviewer: security-reviewer
model: null
round: 3
verdict: block
scope_checked: [reports/reviews/TASK-002-security.round-2.md, reports/handoffs/TASK-002.md, hooks/lib/bash-rules.mjs, hooks/guard-bash.mjs, scripts/reports.mjs, scripts/lib/gate.mjs, docs/architecture/security-model.md, "node scripts/run-tests.mjs (88/88 pass)", "~120 classify() probes"]
not_checked: [end-to-end stdin hook runs, hooks/guard-paths.mjs, template parity beyond tests, "deliberate obfuscation (documented out of scope)", PowerShell write forms beyond the WRITES list]
findings:
  - id: SEC-1
    severity: high
    title: "Implementer can save a forged review by putting a flag before the action or quoting the kind, then self-transition to done"
    location: "hooks/lib/bash-rules.mjs:132"
    confidence: 90
    status: fixed
    verified: true
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
    status: fixed
    verified: true
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
    status: fixed
    verified: true
    acceptance_ref: null
  - id: SEC-7
    severity: low
    title: "Searching for the string .env (rg/grep pattern) triggers the secret-file ask"
    location: "hooks/lib/bash-rules.mjs:194"
    confidence: 80
    status: fixed
    verified: true
    acceptance_ref: null
  - id: SEC-8
    severity: low
    title: "Residual wrapper variants: xargs -n1/-I{}, find -exec /bin/rm, git -P"
    location: "hooks/lib/bash-rules.mjs:116"
    confidence: 75
    status: fixed
    verified: true
    acceptance_ref: null
  - id: SEC-9
    severity: high
    title: "Protected-path check requires the literal path in the segment; cd/pushd plus a relative write (or path.join) lets an implementer forge a review or set its task to done"
    location: "hooks/lib/bash-rules.mjs:264"
    confidence: 85
    status: open
    verified: false
    acceptance_ref: null
  - id: SEC-10
    severity: low
    title: "Interpreter-heredoc rule treats framework-script stdin as code and denies legitimate review/handoff saves"
    location: "hooks/lib/bash-rules.mjs:218"
    confidence: 95
    status: open
    verified: false
    acceptance_ref: null
---

## Findings

SEC-1, SEC-3, SEC-6, SEC-7 and SEC-8 were verified fixed by about 120 probes. SEC-2, SEC-4 and SEC-5 remain fixed.

**SEC-9 (high, open).** These forms are allowed for the implementer:
- `cd reports/reviews && cat > TASK-002-code.md <<'EOF'`
- `pushd reports/reviews && cp /tmp/r.md TASK-002-code.md`
- `cd tasks; sed -i 's/^status: .*/status: done/' TASK-002-x.md`
- `node -e` with `path.join('reports','reviews',…)`

The gate only checks that the reviewer is not the implementer, so a forged file passes. Suggested fixes:
- Track `cd`/`pushd` into protected directories.
- Treat path tokens in interpreter writes as protected.
- Have the gate cross-check reviews against `review_saved` events. Bash is not a capability boundary.

**SEC-10 (low, open).** This is the same issue as code-review CR-5. Review and handoff saves whose prose quotes write sinks or protected paths are denied.

## Coverage statement

Probed classify() directly and read reports.mjs and gate.mjs. No end-to-end hook runs. 88/88 tests pass. The Bash classifier is a pattern-based safety net, not a capability boundary. This review does not claim the system is secure.
