// Regression tests for the independent review of gate/handoff/guard code
// (TASK-002, findings F1-F12). Each test fails on the pre-fix code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tempProject, cleanup, writeTask, write, handoffDoc, reviewDoc, run } from "../helpers.mjs";
import { classify } from "../../hooks/lib/bash-rules.mjs";
import { matchesAny, toPosix } from "../../scripts/lib/glob.mjs";
import { loadTasks, transition } from "../../scripts/lib/tasks.mjs";
import { validateHandoffForTask } from "../../scripts/lib/handoff.mjs";
import { evaluateGate } from "../../scripts/lib/gate.mjs";

const d = (cmd, opts) => classify(cmd, opts).decision;
const SUB = { subagent: true, canSaveReviews: false };
const REVIEWER = { subagent: true, readOnly: true, canSaveReviews: true };

test("F1: implementers cannot forge reviews, task state or risk acceptances via Bash", () => {
  assert.equal(d("node /p/scripts/reports.mjs save review TASK-001 code <<'EOF'\nx\nEOF", SUB), "deny");
  assert.equal(d("node /p/scripts/reports.mjs save audit AUDIT-20261014 security", SUB), "deny");
  assert.equal(d("node /p/scripts/reports.mjs save review TASK-001 code <<'EOF'\nx\nEOF", REVIEWER), "allow");
  assert.equal(d("node /p/scripts/reports.mjs save handoff TASK-001 <<'EOF'\nx\nEOF", SUB), "allow");
  assert.equal(d("sed -i s/status: review/status: done/ tasks/TASK-001-x.md", SUB), "deny");
  assert.equal(d("echo '## RA-001' >> project-context/risk-acceptances.md", SUB), "deny");
  assert.equal(d("cat > reports/reviews/TASK-001-code.md", SUB), "deny");
  assert.equal(d("echo '## RA-001' >> project-context/risk-acceptances.md"), "ask", "main thread: human approves");
  assert.equal(d("cat tasks/TASK-001-x.md", SUB), "allow", "reading task files is fine");
});

test("F2: path traversal in files_modified cannot satisfy or bypass scope", (t) => {
  assert.equal(toPosix("src/../.env"), ".env");
  assert.equal(matchesAny("src/../.env", ["src/**"]), false);
  const root = tempProject();
  t.after(() => cleanup(root));
  writeTask(root, { id: "TASK-001", files_allowed: ["src/**"], files_excluded: ["src/secrets/**"] });
  const task = loadTasks(root).tasks[0];
  for (const f of ["src/../.env", "../outside.txt", "src/a/../secrets/k.ts"]) {
    write(root, "reports/handoffs/TASK-001.md", handoffDoc({ files_modified: [f] }));
    assert.match(validateHandoffForTask(root, task).errors.join(), /scope violation/, f);
  }
});

test("F3: read-only agents may run ordinary read commands", () => {
  for (const c of ['grep "=>" src/a.js', 'rg "a -> b" src', "rg install src", "grep -rn mkdir scripts", "git merge-base main HEAD", "git tag --list", "git tag", "git stash list", "git stash show -p", "black --check .", "ruff format --check .", "git log --oneline -5", "git diff HEAD~1 -- src | head -50"]) {
    assert.equal(d(c, REVIEWER), "allow", c);
  }
  for (const c of ["git stash", "git tag v1.0", "git merge main", "black .", "npm install x", "touch src/x"]) assert.equal(d(c, REVIEWER), "deny", c);
});

test("F4: rm long options are covered", () => {
  assert.equal(d("rm --recursive --force /"), "deny");
  assert.equal(d("rm --recursive ~"), "deny");
  assert.equal(d("rm --recursive --force build"), "ask");
  assert.equal(d("rm --force file.txt"), "ask");
  assert.equal(d("rm file.txt"), "allow");
});

test("F5: reviewer independence ignores namespace and case", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  writeTask(root, { id: "TASK-001", status: "review", agent: "backend-engineer" });
  for (const reviewer of ["project-kickstarter:backend-engineer", "Backend-Engineer", " backend-engineer "]) {
    write(root, "reports/reviews/TASK-001-code.md", reviewDoc({ reviewer }));
    assert.match(evaluateGate(root, loadTasks(root).tasks[0]).reasons.join(), /implementing agent/, reviewer);
  }
  const r = run("scripts/reports.mjs", ["save", "review", "TASK-001", "code", "--root", root], { input: reviewDoc({ reviewer: "project-kickstarter:backend-engineer" }) });
  assert.equal(r.code, 1);
});

test("F6/F7: detours through blocked/ready still consume retry budget and archive evidence", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  writeTask(root, { id: "TASK-001", status: "review", max_retries: 1 });
  write(root, "reports/handoffs/TASK-001.md", handoffDoc());
  write(root, "reports/reviews/TASK-001-code.md", reviewDoc({ findings: [{ id: "CR-1", severity: "high", title: "bug here", location: "a:1", status: "open" }] }));
  assert.equal(transition(root, "TASK-001", "blocked", { reason: "detour" }).ok, true);
  assert.equal(transition(root, "TASK-001", "ready").ok, true);
  assert.equal(transition(root, "TASK-001", "in_progress").ok, true);
  assert.equal(loadTasks(root).tasks[0].data.attempts, 1, "re-entry after a round counts as a retry");
  assert.ok(existsSync(join(root, "reports/reviews/TASK-001-code.round-1.md")), "stale review archived");
  assert.ok(!existsSync(join(root, "reports/reviews/TASK-001-code.md")));
  write(root, "reports/handoffs/TASK-001.md", handoffDoc());
  assert.equal(transition(root, "TASK-001", "review").ok, true);
  assert.equal(transition(root, "TASK-001", "blocked", { reason: "again" }).ok, true);
  assert.equal(transition(root, "TASK-001", "ready").ok, true);
  assert.match(transition(root, "TASK-001", "in_progress").errors.join(), /retry budget exhausted/);
});

test("F8/F12: BOM and CRLF task files survive transitions", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  const file = writeTask(root, { id: "TASK-001", status: "ready" });
  const crlf = "\uFEFF" + readFileSync(file, "utf8").replace(/\n/g, "\r\n");
  write(root, "tasks/TASK-001-example.md", crlf);
  assert.deepEqual(transition(root, "TASK-001", "in_progress").errors, []);
  const after = readFileSync(file, "utf8");
  assert.ok(after.includes("\r\n## Objective\r\n"), "line endings preserved");
  assert.ok(!/(^|[^\r])\n/.test(after), "no mixed line endings");
});

test("F9: secret files referenced by any command need approval; ignore checks do not", () => {
  for (const c of ["grep API_KEY .env", "sed -n p .env", "source .env", "cp .env /tmp/x", "rg . config/.env.production", "node -e \"require('dotenv').config({path:'.env'})\"", "cat ~/.ssh/id_rsa", "base64 server.key"]) assert.equal(d(c), "ask", c);
  for (const c of ["git check-ignore -q .env", "cat .env.example", "ls src", "test -f .env"]) assert.equal(d(c), "allow", c);
});

test("F10: framework-script exemption cannot be smuggled through comments or redirects", () => {
  assert.equal(d("echo x > src/a.ts # reports.mjs save", REVIEWER), "deny");
  assert.equal(d("node /p/scripts/tasks.mjs status > src/a.ts", REVIEWER), "deny");
  assert.equal(d("node /p/scripts/tasks.mjs status --json", REVIEWER), "allow");
});

test("F11: braces with ** and case-insensitive matching", () => {
  assert.ok(matchesAny("secrets/a/b.txt", ["{secrets/**,x}"]));
  assert.ok(matchesAny(".ENV", ["**/.env"], { nocase: true }));
  assert.ok(!matchesAny(".ENV", ["**/.env"]));
});

test("F12: approver names and env rule without false positives", (t) => {
  assert.equal(d("python -m venv env"), "allow");
  assert.equal(d("printenv"), "ask");
  assert.equal(d("env | grep X"), "ask");
  const root = tempProject();
  t.after(() => cleanup(root));
  writeTask(root, { id: "TASK-001", status: "review" });
  write(root, "reports/reviews/TASK-001-code.md", reviewDoc({ findings: [{ id: "SEC-1", severity: "high", title: "weak hash", location: "a:1", status: "accepted", acceptance_ref: "RA-001" }] }));
  const ra = (who) => write(root, "project-context/risk-acceptances.md", `## RA-001\n- task: TASK-001\n- finding: SEC-1\n- approved_by: ${who}\n- rationale: isolated legacy system\n`);
  for (const ok of ["Ann Abbott", "Kim Talbot", "Pieter Botha"]) { ra(ok); assert.equal(evaluateGate(root, loadTasks(root).tasks[0]).pass, true, ok); }
  for (const bad of ["claude", "AI assistant", "code-reviewer", "automated"]) { ra(bad); assert.match(evaluateGate(root, loadTasks(root).tasks[0]).reasons.join(), /named human/, bad); }
});
