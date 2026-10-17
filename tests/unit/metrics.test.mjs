import { test } from "node:test";
import assert from "node:assert/strict";
import { tempProject, cleanup, write, run } from "../helpers.mjs";
import { summarize, signals, listProposals } from "../../scripts/lib/metrics.mjs";

const ev = (o) => JSON.stringify({ ts: "2026-10-14T10:00:00Z", ...o });

test("summary aggregates recorded events and never invents cost data", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  write(root, "reports/metrics/events.jsonl", [
    ev({ type: "transition", task: "TASK-001", from: "review", to: "done", agent: "implementer" }),
    ev({ type: "transition", task: "TASK-002", from: "review", to: "in_progress", agent: "implementer" }),
    ev({ type: "handoff_rejected", task: "TASK-002", errors: ['validation command not run: "npm run lint"'] }),
    ev({ type: "handoff_rejected", task: "TASK-003", errors: ['validation command not run: "npm test"', 'scope violation: "x" is outside files_allowed'] }),
    ev({ type: "review_saved", task: "TASK-001", kind: "security", verdict: "block", findings: { critical: 1, high: 0, medium: 2, low: 0, info: 0 } }),
    ev({ type: "subagent_stop", agent: "implementer", has_handoff: false }),
    "not json",
  ].join("\n") + "\n");
  const s = summarize(root);
  assert.equal(s.tasks_done, 1);
  assert.equal(s.fix_loops, 1);
  assert.equal(s.handoffs.rejected, 2);
  assert.deepEqual(s.handoffs.rejection_reasons, { validation_not_run: 2, scope_violation: 1 });
  assert.equal(s.reviews.findings.critical, 1);
  assert.equal(s.malformed_lines, 1);
  assert.ok(s.not_tracked.includes("token usage") && s.not_tracked.includes("cost"));
  assert.deepEqual(signals(s).map((x) => x.id), ["validation-skipped"]);
});

test("no evidence → no signals", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  assert.deepEqual(signals(summarize(root)), []);
});

test("proposals are schema-validated", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  write(root, "reports/improvements/PROP-001-good.md", `---
id: PROP-001
title: Clarify lint evidence
status: proposed
targets: [skills/handoff-protocol/SKILL.md]
evidence: ["metrics: 2 handoffs rejected with validation_not_run"]
hypothesis: Agents skip lint because it is listed last.
baseline:
  scenario: cli handoff tests
  command: node scripts/run-tests.mjs
  result: 60/60 pass
success_metric: validation_not_run = 0 over 10 handoffs
sensitive: true
approved_by: null
version_bump: patch
rollback: git revert the commit
created: 2026-10-14
---
body
`);
  write(root, "reports/improvements/PROP-002-bad.md", "---\nid: PROP-002\ntitle: No evidence\nstatus: proposed\n---\n");
  const p = listProposals(root);
  assert.deepEqual(p[0].errors, []);
  assert.ok(p[1].errors.some((e) => /evidence/.test(e)));
  const r = run("scripts/metrics.mjs", ["proposals", "--root", root]);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /INVALID PROP-002-bad\.md/);
});
