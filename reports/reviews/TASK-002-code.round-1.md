---
task: TASK-002
kind: code
reviewer: code-reviewer
model: null
round: 1
verdict: block
scope_checked: [hooks/lib/bash-rules.mjs, hooks/guard-bash.mjs, hooks/guard-paths.mjs, config/protected-paths.json, scripts/lib/tasks.mjs, scripts/lib/gate.mjs, scripts/lib/handoff.mjs, scripts/lib/glob.mjs, scripts/lib/frontmatter.mjs, scripts/reports.mjs, scripts/validate.mjs]
not_checked: [tests/unit/review-findings.test.mjs and other updated tests, template parity, scripts/lib/project.mjs, git diff against b862d53 (no shell)]
findings:
  - id: CR-1
    severity: high
    title: "stripHeredocs swallows a same-line redirect, so 'cat <<EOF > reports/reviews/X.md' is not seen as a write (F1 bypass)"
    location: "hooks/lib/bash-rules.mjs:81"
    confidence: 85
    status: open
    verified: false
    acceptance_ref: null
  - id: CR-2
    severity: medium
    title: "Output-redirect rule ignores '1>', '&>' and '>|' forms"
    location: "hooks/lib/bash-rules.mjs:59"
    confidence: 80
    status: open
    verified: false
    acceptance_ref: null
  - id: CR-3
    severity: medium
    title: "Command-word WRITES rules anchored at segment start miss then/do/xargs/env/bash -c wrapped commands"
    location: "hooks/lib/bash-rules.mjs:62"
    confidence: 75
    status: open
    verified: false
    acceptance_ref: null
  - id: CR-4
    severity: medium
    title: "SECRET_FILE tested on unblanked segment, so quoted prose mentioning .env triggers ask"
    location: "hooks/lib/bash-rules.mjs:131"
    confidence: 75
    status: open
    verified: false
    acceptance_ref: null
---

## Findings

CR-1 (high): the heredoc-opener regex consumes the rest of the opener line, so `cat <<'EOF' > reports/reviews/TASK-002-code.md` becomes `cat <<HEREDOC`. Fix: keep the opener tail. Add tests for both orders, `<<-` and quoted delimiters.

CR-2 (medium): the exclusion before `>` also excludes `1>`, `&>`, `2>file`, and `>|` is split as a pipe. Fix: parse the fd prefix explicitly and add `>|`.

CR-3 (medium): `then cp`, `do mv`, `xargs cp`, `env cp`, `find -delete` and `bash -c "..."` are missed. Fix: strip shell keywords and wrappers, recurse into `-c` bodies, or scan the whole command for a protected target plus a write verb for subagents.

CR-4 (medium): `git commit -m "fix .env loading"` asks. Fix: test the blanked segment, and handle quoted file arguments separately.

## Coverage statement

F2, F5, F6/F7, F8, F11, F12, F4 fixes judged correct, and legitimate workflows are not blocked. Independent session (feature-dev:code-reviewer agent type); no commands executed.
