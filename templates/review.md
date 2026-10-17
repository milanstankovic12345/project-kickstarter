---
task: {{id}}
kind: {{kind}}
reviewer: {{reviewer}}
model: null
round: 1
verdict: approve
scope_checked:
  - path/or/glob/actually/read
not_checked: []
findings:
  - id: CR-1
    severity: medium
    title: Short statement of the defect
    location: src/file.ts:42
    confidence: 85
    status: open
    verified: false
    acceptance_ref: null
---

## Findings

### CR-1 — Short statement of the defect (Medium, confidence 85)

- **Location:** `src/file.ts:42`
- **Impact:** what breaks, for whom
- **Reproduction:** concrete input/state → wrong output
- **Recommended fix:** the smallest correct change

## Coverage statement

What was inspected, what was not, and why. A review with no findings is not
proof of correctness or security.
