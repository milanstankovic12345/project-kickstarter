import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tempProject, cleanup, writeTask, write, handoffDoc, reviewDoc, run } from "../helpers.mjs";

test("tasks.mjs new → validate → transition flow with exit codes", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  let r = run("scripts/tasks.mjs", ["new", "--root", root, "--title", "Add login form", "--agent", "frontend-engineer", "--scope", "src/login/**", "--validation", "npm test", "--acceptance", "form submits", "--json"]);
  assert.equal(r.code, 0, r.stderr);
  const { id, file } = JSON.parse(r.stdout);
  assert.equal(id, "TASK-001");
  assert.ok(existsSync(join(root, file)));
  r = run("scripts/tasks.mjs", ["validate", "--root", root]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  r = run("scripts/tasks.mjs", ["transition", "TASK-001", "in_progress", "--root", root]);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /illegal transition draft -> in_progress/);
  r = run("scripts/tasks.mjs", ["transition", "TASK-001", "ready", "--root", root]);
  assert.equal(r.code, 0, r.stdout);
  r = run("scripts/tasks.mjs", ["batches", "--root", root, "--json"]);
  assert.deepEqual(JSON.parse(r.stdout).batch.map((b) => b.id), ["TASK-001"]);
  r = run("scripts/tasks.mjs", ["required-reviews", "TASK-001", "--root", root]);
  assert.equal(r.stdout.trim(), "code security", "login scope is security-sensitive");
});

test("tasks.mjs validate exits 1 on errors and reports unknown agents", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  writeTask(root, { id: "TASK-001", agent: "nonexistent-agent" });
  const r = run("scripts/tasks.mjs", ["validate", "--root", root]);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /unknown agent "nonexistent-agent"/);
});

test("reports.mjs save review validates before writing; rejects implementer self-review", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  writeTask(root, { id: "TASK-001", status: "review" });
  let r = run("scripts/reports.mjs", ["save", "review", "TASK-001", "code", "--root", root], { input: reviewDoc({ reviewer: "implementer" }) });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /reviews must be independent/);
  assert.ok(!existsSync(join(root, "reports/reviews/TASK-001-code.md")));
  r = run("scripts/reports.mjs", ["save", "review", "TASK-001", "code", "--root", root], { input: reviewDoc() });
  assert.equal(r.code, 0, r.stdout);
  assert.ok(existsSync(join(root, "reports/reviews/TASK-001-code.md")));
  r = run("scripts/gate.mjs", ["check", "TASK-001", "--root", root]);
  assert.equal(r.code, 0, r.stdout);
  assert.match(r.stdout, /^PASS TASK-001/);
});

test("reports.mjs save handoff keeps rejected candidates for inspection", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  writeTask(root, { id: "TASK-001", status: "in_progress" });
  let r = run("scripts/reports.mjs", ["save", "handoff", "TASK-001", "--root", root], { input: handoffDoc({ tests: [] }) });
  assert.equal(r.code, 1);
  assert.ok(existsSync(join(root, "reports/handoffs/TASK-001.md.rejected")));
  assert.ok(!existsSync(join(root, "reports/handoffs/TASK-001.md")));
  r = run("scripts/reports.mjs", ["save", "handoff", "TASK-001", "--root", root], { input: handoffDoc() });
  assert.equal(r.code, 0, r.stdout);
  r = run("scripts/reports.mjs", ["progress", "TASK-001 dispatched to implementer (sonnet)", "--root", root]);
  assert.equal(r.code, 0);
  assert.match(readFileSync(join(root, "reports/progress.md"), "utf8"), /TASK-001 dispatched to implementer \(sonnet\)/);
  const events = readFileSync(join(root, "reports/metrics/events.jsonl"), "utf8");
  assert.match(events, /handoff_rejected/);
  assert.match(events, /handoff_saved/);
});

test("gate.mjs exits 1 when blocked", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  writeTask(root, { id: "TASK-001", status: "review" });
  write(root, "reports/handoffs/TASK-001.md", handoffDoc());
  const r = run("scripts/gate.mjs", ["check", "TASK-001", "--root", root]);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /BLOCKED TASK-001/);
});
