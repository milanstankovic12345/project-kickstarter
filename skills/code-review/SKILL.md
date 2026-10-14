---
name: code-review
description: Independent, evidence-based review of a change for correctness, edge cases, regressions, API compatibility, test coverage, performance, security smells and maintainability, with severity-classified findings (Critical/High/Medium/Low/Info), confidence scores, locations, reproduction scenarios and fixes. Use for task reviews in the agent framework, PR reviews, or /project-kickstarter:review.
---

# Independent code review

Treat the implementation handoff as **claims to verify**, not facts. You
were not part of the implementation, and that independence is what makes
the review worth having.

## Procedure

1. **Scope.** Read the task file (objective, acceptance criteria, scope).
   Get the change with `git diff <base> -- <files>`, or `git diff` and
   `git status` when there is no base. Read whole functions and their
   callers, not just the changed lines.
2. **Re-run the evidence.** Run the task's validation commands yourself.
   If your results differ from the handoff, that is a finding in itself.
3. **Hunt.** Work through
   [references/review-checklist.md](references/review-checklist.md) in
   order. Correctness and regressions come first; style comes last and
   only when it affects maintainability.
4. **Score each candidate** for confidence from 0 to 100:
   - 90–100: you reproduced it, or it follows directly from the code.
   - 70–89: strong evidence, but you didn't execute it.
   - Below 70: speculative. Don't report it as a defect. At most, list it
     under "Questions" in the body.

   Pre-existing problems outside the diff belong under `info`. They don't
   count against the task unless the change makes them worse.
5. **Classify severity:**

| Severity | Meaning | Gate |
|---|---|---|
| critical | Data loss or corruption, security breach, crash on the main path, broken build or deploy | blocks |
| high | Wrong behaviour in a realistic case, regression of existing behaviour, a missing authz or validation check, an acceptance criterion not met | blocks |
| medium | Edge-case bug, a missing test for important behaviour, notable performance or maintainability debt | reported |
| low | Minor clarity or robustness issue | reported |
| info | Observation, pre-existing issue, suggestion | reported |

6. **Write the review** using `${CLAUDE_PLUGIN_ROOT}/templates/review.md`.
   Each finding needs an id (`CR-n`), severity, title, `file:line`
   location, confidence and status `open`. The body gives impact, a
   concrete reproduction (input or state → wrong result) and the smallest
   correct fix.
7. **Verdict.** Use `block` if any critical or high finding is open,
   `approve_with_notes` if only medium or lower, and `approve` if there is
   nothing actionable.
8. **Save** with
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/reports.mjs" save review <ID> code`.
   If it prints `REJECTED`, fix the frontmatter and save again.

## Re-review rounds

Re-check every earlier finding against the new code and record its status:

- fixed and you confirmed the fix: `status: fixed`, `verified: true`
- not fixed: keep `open`
- the fix introduced something new: add a new finding

Increment `round`. Don't re-raise findings that are already fixed, and
don't pile on new low-value nits in later rounds.

## Coverage statement (mandatory)

The review body ends with what you inspected, what you ran, and what you
did **not** check. Absence of findings doesn't prove the code is correct.
