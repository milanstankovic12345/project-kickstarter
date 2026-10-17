import { test } from "node:test";
import assert from "node:assert/strict";
import { tempProject, cleanup, writeTask, write, handoffDoc, reviewDoc } from "../helpers.mjs";
import { loadTasks } from "../../scripts/lib/tasks.mjs";
import { validateHandoffForTask } from "../../scripts/lib/handoff.mjs";
import { evaluateGate, parseRiskAcceptances, requiredReviewKinds } from "../../scripts/lib/gate.mjs";
import { loadConfig } from "../../scripts/lib/project.mjs";

function setup(t, taskOverrides = {}) {
  const root = tempProject();
  t.after(() => cleanup(root));
  writeTask(root, { id: "TASK-001", status: "review", ...taskOverrides });
  const task = () => loadTasks(root).tasks[0];
  return { root, task };
}

test("handoff: evidence rules", (t) => {
  const { root, task } = setup(t, { validation: [{ cmd: "npm test", expect: "exit 0" }, { cmd: "npm run lint", expect: "exit 0" }] });
  write(root, "reports/handoffs/TASK-001.md", handoffDoc({ tests: [] }));
  assert.match(validateHandoffForTask(root, task()).errors.join(), /requires at least one executed/);
  write(root, "reports/handoffs/TASK-001.md", handoffDoc({ tests: [{ cmd: "npm test", exit_code: 1, summary: "1 failed" }] }));
  assert.match(validateHandoffForTask(root, task()).errors.join(), /exited non-zero/);
  write(root, "reports/handoffs/TASK-001.md", handoffDoc());
  assert.match(validateHandoffForTask(root, task()).errors.join(), /validation command not run: "npm run lint"/);
  write(root, "reports/handoffs/TASK-001.md", handoffDoc({ tests: [{ cmd: "npm test", exit_code: 0, summary: "ok" }, { cmd: "npm  run lint", exit_code: 0, summary: "ok" }] }));
  assert.deepEqual(validateHandoffForTask(root, task()).errors, []);
});

test("handoff: blocked needs blocker, concerns need risks, excluded files rejected", (t) => {
  const { root, task } = setup(t, { files_excluded: ["src/a/generated/**"] });
  write(root, "reports/handoffs/TASK-001.md", handoffDoc({ status: "blocked", tests: [] }));
  assert.match(validateHandoffForTask(root, task()).errors.join(), /requires a "blocker"/);
  write(root, "reports/handoffs/TASK-001.md", handoffDoc({ status: "done_with_concerns" }));
  assert.match(validateHandoffForTask(root, task()).errors.join(), /must list the concerns/);
  write(root, "reports/handoffs/TASK-001.md", handoffDoc({ files_modified: ["src/a/generated/x.ts"] }));
  assert.match(validateHandoffForTask(root, task()).errors.join(), /matches files_excluded/);
  write(root, "reports/handoffs/TASK-001.md", handoffDoc({ files_modified: ["src/a/x.ts", "reports/handoffs/TASK-001.md"] }));
  assert.deepEqual(validateHandoffForTask(root, task()).errors, [], "own report files are always in scope");
});

test("gate: severity blocking, verification, independence", (t) => {
  const { root, task } = setup(t);
  const finding = { id: "CR-1", severity: "high", title: "Null deref", location: "src/a/x.ts:3", status: "open" };
  write(root, "reports/reviews/TASK-001-code.md", reviewDoc({ findings: [finding] }));
  assert.match(evaluateGate(root, task()).reasons.join(), /high finding CR-1 is open/);
  write(root, "reports/reviews/TASK-001-code.md", reviewDoc({ findings: [{ ...finding, status: "fixed" }] }));
  assert.match(evaluateGate(root, task()).reasons.join(), /not re-verified/);
  write(root, "reports/reviews/TASK-001-code.md", reviewDoc({ findings: [{ ...finding, status: "fixed", verified: true }] }));
  assert.equal(evaluateGate(root, task()).pass, true);
  write(root, "reports/reviews/TASK-001-code.md", reviewDoc({ findings: [{ ...finding, severity: "medium" }] }));
  assert.equal(evaluateGate(root, task()).pass, true, "medium findings do not block");
  write(root, "reports/reviews/TASK-001-code.md", reviewDoc({ findings: [{ ...finding, status: "wont_fix" }] }));
  assert.match(evaluateGate(root, task()).reasons.join(), /wont_fix/);
  write(root, "reports/reviews/TASK-001-code.md", reviewDoc({ reviewer: "implementer" }));
  assert.match(evaluateGate(root, task()).reasons.join(), /performed by the implementing agent/);
  write(root, "reports/reviews/TASK-001-code.md", reviewDoc({ verdict: "block" }));
  assert.match(evaluateGate(root, task()).reasons.join(), /verdict is "block"/);
});

test("gate: risk acceptance must be human, matching, unexpired", (t) => {
  const { root, task } = setup(t);
  const finding = { id: "SEC-1", severity: "critical", title: "Weak hash", location: "src/a/h.ts:1", status: "accepted", acceptance_ref: "RA-001" };
  write(root, "reports/reviews/TASK-001-code.md", reviewDoc({ findings: [finding] }));
  assert.match(evaluateGate(root, task()).reasons.join(), /not found in risk acceptances/);
  const ra = (fields) => `# Risk acceptances\n\n## RA-001\n${Object.entries(fields).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n`;
  const base = { task: "TASK-001", finding: "SEC-1", approved_by: "Jane Doe", date: "2026-10-14", rationale: "legacy system, isolated network" };
  write(root, "project-context/risk-acceptances.md", ra({ ...base, approved_by: "claude agent" }));
  assert.match(evaluateGate(root, task()).reasons.join(), /named human/);
  write(root, "project-context/risk-acceptances.md", ra({ ...base, finding: "SEC-2" }));
  assert.match(evaluateGate(root, task()).reasons.join(), /not SEC-1/);
  write(root, "project-context/risk-acceptances.md", ra({ ...base, expires: "2020-01-01" }));
  assert.match(evaluateGate(root, task()).reasons.join(), /expired/);
  write(root, "project-context/risk-acceptances.md", ra(base));
  assert.equal(evaluateGate(root, task()).pass, true);
  assert.equal(parseRiskAcceptances(ra(base)).get("RA-001").approved_by, "Jane Doe");
});

test("gate: security review auto-required for sensitive scopes", (t) => {
  const { root, task } = setup(t, { files_allowed: ["src/auth/**"] });
  assert.deepEqual(requiredReviewKinds(task(), loadConfig(root)), ["code", "security"]);
  write(root, "reports/reviews/TASK-001-code.md", reviewDoc());
  assert.match(evaluateGate(root, task()).reasons.join(), /required security review missing/);
  write(root, "reports/reviews/TASK-001-security.md", reviewDoc({ kind: "security", reviewer: "security-reviewer" }));
  assert.equal(evaluateGate(root, task()).pass, true);
});

test("gate: config can make reviews optional only via explicit config", (t) => {
  const root = tempProject({ ".claude/agent-framework.json": JSON.stringify({ gates: { required_reviews: [] } }) });
  t.after(() => cleanup(root));
  writeTask(root, { id: "TASK-001", status: "review", review: [], files_allowed: ["docs/guide.md"] });
  assert.equal(evaluateGate(root, loadTasks(root).tasks[0]).pass, true);
});
