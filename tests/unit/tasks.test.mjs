import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tempProject, cleanup, writeTask, write, handoffDoc, reviewDoc, BODY } from "../helpers.mjs";
import { validateTaskSet, computeBatches, transition, nextTaskId, loadTasks } from "../../scripts/lib/tasks.mjs";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";

const status = (root, id) => loadTasks(root).tasks.find((t) => t.data.id === id).data.status;

test("valid task set has no errors", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  writeTask(root, { id: "TASK-001" });
  writeTask(root, { id: "TASK-002", depends_on: ["TASK-001"], files_allowed: ["src/b/**"], status: "draft" });
  const res = validateTaskSet(root, { knownAgents: new Set(["implementer"]) });
  assert.deepEqual(res.errors, []);
});

test("detects schema errors, missing sections, duplicates, missing deps, cycles, unknown agents", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  writeTask(root, { id: "TASK-001", depends_on: ["TASK-003"] });
  writeTask(root, { id: "TASK-003", depends_on: ["TASK-001"], files_allowed: ["x/**"] });
  writeTask(root, { id: "TASK-004", depends_on: ["TASK-999"], agent: "ghost", files_allowed: ["y/**"] });
  write(root, "tasks/TASK-005-dup.md", readFileSync(join(root, "tasks/TASK-004-example.md"), "utf8"));
  writeTask(root, { id: "TASK-006", status: "weird", validation: [] }, "\n## Objective\nx\n");
  write(root, "tasks/TASK-007-nofm.md", "# no frontmatter");
  const res = validateTaskSet(root, { knownAgents: new Set(["implementer"]) });
  const msgs = res.errors.map((e) => `${e.task}: ${e.message}`).join("\n");
  assert.match(msgs, /dependency cycle: TASK-001 -> TASK-003 -> TASK-001/);
  assert.match(msgs, /depends on missing task TASK-999/);
  assert.match(msgs, /unknown agent "ghost"/);
  assert.match(msgs, /duplicate task id TASK-004/);
  assert.match(msgs, /file name must start with "TASK-004-"/);
  assert.match(msgs, /status: must be one of/);
  assert.match(msgs, /validation: must have at least 1/);
  assert.match(msgs, /missing body section\(s\): ## Context/);
  assert.match(msgs, /missing YAML frontmatter/);
});

test("warns on oversized and repo-wide tasks", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  const manySteps = BODY.replace("1. Write test.\n2. Implement.", Array.from({ length: 20 }, (_, i) => `${i + 1}. step`).join("\n"));
  writeTask(root, { id: "TASK-001", files_allowed: ["**"] }, manySteps);
  const res = validateTaskSet(root);
  const w = res.warnings.map((x) => x.message).join("\n");
  assert.match(w, /repo-wide/);
  assert.match(w, /20 steps/);
});

test("batches: only dependency-ready, disjoint scopes, capped", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  writeTask(root, { id: "TASK-001", status: "done" });
  writeTask(root, { id: "TASK-002", depends_on: ["TASK-001"], files_allowed: ["src/b/**"] });
  writeTask(root, { id: "TASK-003", files_allowed: ["src/b/x.ts"] }); // overlaps 002
  writeTask(root, { id: "TASK-004", files_allowed: ["src/c/**"], priority: "p0" });
  writeTask(root, { id: "TASK-005", files_allowed: ["src/d/**"], depends_on: ["TASK-002"] });
  writeTask(root, { id: "TASK-006", files_allowed: ["src/e/**"] });
  const res = computeBatches(root, { maxParallel: 2 });
  assert.deepEqual(res.batch.map((b) => b.id), ["TASK-004", "TASK-002"]);
  assert.deepEqual(res.deferred.map((d) => d.id), ["TASK-003", "TASK-006"]);
  assert.match(res.deferred[0].reason, /overlaps TASK-002/);
  assert.match(res.deferred[1].reason, /concurrency cap/);
  assert.deepEqual(res.waiting, [{ id: "TASK-005", waiting_on: ["TASK-002"] }]);
});

test("batches exclude scopes overlapping in-progress work", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  writeTask(root, { id: "TASK-001", status: "in_progress", files_allowed: ["src/**"] });
  writeTask(root, { id: "TASK-002", files_allowed: ["src/x.ts"] });
  const res = computeBatches(root);
  assert.equal(res.batch.length, 0);
  assert.deepEqual(res.active, ["TASK-001"]);
});

test("lifecycle: illegal transitions and dependency guard", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  writeTask(root, { id: "TASK-001", status: "ready" });
  writeTask(root, { id: "TASK-002", status: "ready", depends_on: ["TASK-001"], files_allowed: ["src/b/**"] });
  assert.match(transition(root, "TASK-001", "done").errors.join(), /illegal transition ready -> done/);
  assert.match(transition(root, "TASK-002", "in_progress").errors.join(), /dependencies not done: TASK-001/);
  assert.equal(transition(root, "TASK-001", "in_progress").ok, true);
  assert.equal(status(root, "TASK-001"), "in_progress");
  assert.match(transition(root, "TASK-001", "blocked").errors.join(), /requires --reason/);
  assert.equal(transition(root, "TASK-001", "blocked", { reason: "needs API key" }).ok, true);
  const fm = parseFrontmatter(readFileSync(join(root, "tasks/TASK-001-example.md"), "utf8")).data;
  assert.equal(fm.blocked_reason, "needs API key");
});

test("conflicting edits: cannot start a task overlapping an in-progress task", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  writeTask(root, { id: "TASK-001", status: "in_progress", files_allowed: ["src/**"] });
  writeTask(root, { id: "TASK-002", status: "ready", files_allowed: ["src/a.ts"] });
  assert.match(transition(root, "TASK-002", "in_progress").errors.join(), /overlaps in_progress task TASK-001/);
});

test("review requires valid handoff; done requires gate; fix loop is bounded", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  writeTask(root, { id: "TASK-001", status: "in_progress", max_retries: 1 });
  assert.match(transition(root, "TASK-001", "review").errors.join(), /handoff missing/);
  write(root, "reports/handoffs/TASK-001.md", handoffDoc({ files_modified: ["src/other/x.ts"] }));
  assert.match(transition(root, "TASK-001", "review").errors.join(), /scope violation/);
  write(root, "reports/handoffs/TASK-001.md", handoffDoc());
  assert.equal(transition(root, "TASK-001", "review").ok, true);
  // gate: no review yet
  assert.match(transition(root, "TASK-001", "done").errors.join(), /required code review missing/);
  // fix loop: one retry allowed
  assert.equal(transition(root, "TASK-001", "in_progress").ok, true);
  assert.equal(transition(root, "TASK-001", "review").ok, true);
  assert.match(transition(root, "TASK-001", "in_progress").errors.join(), /retry budget exhausted/);
  assert.equal(transition(root, "TASK-001", "failed", { reason: "could not fix" }).ok, true);
  assert.match(transition(root, "TASK-001", "ready").errors.join(), /--human-approved/);
  assert.equal(transition(root, "TASK-001", "ready", { humanApproved: true }).ok, true);
  const fm = loadTasks(root).tasks[0].data;
  assert.equal(fm.attempts, 0, "human reopen resets the retry budget");
});

test("done passes with an independent approving review", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  writeTask(root, { id: "TASK-001", status: "review" });
  write(root, "reports/handoffs/TASK-001.md", handoffDoc());
  write(root, "reports/reviews/TASK-001-code.md", reviewDoc());
  const res = transition(root, "TASK-001", "done");
  assert.deepEqual(res.errors, []);
  assert.equal(status(root, "TASK-001"), "done");
  const events = readFileSync(join(root, "reports/metrics/events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(events.at(-1).type, "transition");
  assert.equal(events.at(-1).to, "done");
});

test("nextTaskId", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  assert.equal(nextTaskId(root), "TASK-001");
  writeTask(root, { id: "TASK-009" });
  assert.equal(nextTaskId(root), "TASK-010");
});
