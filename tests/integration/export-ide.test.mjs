import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tempProject, copyFixture, cleanup, write, run } from "../helpers.mjs";
import { installPreCommit, HOOK_MARKER } from "../../scripts/install-git-hooks.mjs";

const exportTo = (dir, target, extra = []) => run("scripts/export-ide.mjs", [target, "--project", dir, "--json", ...extra]);
const counts = (stdout) => {
  const c = {};
  for (const a of JSON.parse(stdout).actions) c[a.action] = (c[a.action] ?? 0) + 1;
  return c;
};
const node = (dir, rel, args = [], input) => spawnSync(process.execPath, [join(dir, rel), ...args], { cwd: dir, encoding: "utf8", input });

function allFiles(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === ".git") continue;
    if (statSync(p).isDirectory()) out.push(...allFiles(p));
    else out.push(p);
  }
  return out;
}

for (const target of ["cursor", "codex", "copilot"]) {
  test(`export ${target}: creates files, second run changes nothing`, (t) => {
    const dir = tempProject({}, { framework: false });
    t.after(() => cleanup(dir));
    let r = exportTo(dir, target);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const first = counts(r.stdout);
    assert.ok(first.create > 100, JSON.stringify(first));
    assert.equal(first.conflict, undefined);
    assert.ok(existsSync(join(dir, ".agent-framework/runtime/scripts/tasks.mjs")));
    assert.ok(existsSync(join(dir, ".agent-framework/export-manifest.json")));
    r = exportTo(dir, target);
    assert.equal(r.code, 0);
    const second = counts(r.stdout);
    assert.deepEqual(Object.keys(second), ["unchanged"], JSON.stringify(second));
  });
}

test("--dry-run writes nothing; unknown target exits 2", (t) => {
  const dir = tempProject({}, { framework: false });
  t.after(() => cleanup(dir));
  const r = exportTo(dir, "codex", ["--dry-run"]);
  assert.equal(r.code, 0);
  assert.ok(counts(r.stdout).create > 0);
  assert.ok(!existsSync(join(dir, ".agent-framework")));
  assert.ok(!existsSync(join(dir, "AGENTS.md")));
  assert.equal(run("scripts/export-ide.mjs", ["vim", "--project", dir]).code, 2);
});

test("a customized file is not overwritten: proposal written, exit 3; --force keeps a backup", (t) => {
  const dir = tempProject({}, { framework: false });
  t.after(() => cleanup(dir));
  exportTo(dir, "copilot");
  const file = join(dir, ".github/agents/planner.agent.md");
  writeFileSync(file, readFileSync(file, "utf8") + "\nMy own rule.\n");
  // A newer export would differ from the manifest hash only if the source changed; simulate it.
  const manifestPath = join(dir, ".agent-framework/export-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.files[".github/agents/planner.agent.md"].hash = "0000000000000000";
  writeFileSync(manifestPath, JSON.stringify(manifest));
  let r = exportTo(dir, "copilot");
  assert.equal(r.code, 3, r.stdout);
  assert.equal(counts(r.stdout).conflict, 1);
  assert.match(readFileSync(file, "utf8"), /My own rule/);
  assert.ok(existsSync(join(dir, ".agent-framework/proposed/.github/agents/planner.agent.md")));
  r = exportTo(dir, "copilot", ["--force"]);
  assert.equal(r.code, 0, r.stdout);
  assert.doesNotMatch(readFileSync(file, "utf8"), /My own rule/);
  assert.ok(allFiles(join(dir, ".agent-framework/backup")).some((p) => p.includes("planner.agent.md")));
});

test("an existing unmanaged file is a conflict, never overwritten", (t) => {
  const dir = tempProject({ ".cursor/hooks.json": '{"version":1,"hooks":{"stop":[{"command":"mine"}]}}' }, { framework: false });
  t.after(() => cleanup(dir));
  const r = exportTo(dir, "cursor");
  assert.equal(r.code, 3);
  assert.match(readFileSync(join(dir, ".cursor/hooks.json"), "utf8"), /"mine"/);
  assert.ok(existsSync(join(dir, ".agent-framework/proposed/.cursor/hooks.json")));
});

test("AGENTS.md keeps existing content; only the marked section is managed", (t) => {
  const dir = tempProject({ "AGENTS.md": "# Team rules\n\nUse tabs.\n" }, { framework: false });
  t.after(() => cleanup(dir));
  assert.equal(exportTo(dir, "codex").code, 0);
  let text = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.match(text, /^# Team rules\n\nUse tabs\./);
  assert.match(text, /project-kickstarter:ide:start/);
  assert.equal(counts(exportTo(dir, "codex").stdout).update, undefined);
  writeFileSync(join(dir, "AGENTS.md"), text.replace("Use tabs.", "Use spaces."));
  assert.equal(exportTo(dir, "codex").code, 0);
  text = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.match(text, /Use spaces\./);
  assert.equal((text.match(/project-kickstarter:ide:start/g) ?? []).length, 1);
});

test("secret values in the project never reach exported files", (t) => {
  const secret = "sk-live-SUPER-SECRET-VALUE-123";
  const dir = tempProject({ ".env": `API_KEY=${secret}\n` }, { framework: false });
  t.after(() => cleanup(dir));
  for (const target of ["cursor", "codex", "copilot"]) {
    const r = exportTo(dir, target);
    assert.ok([0, 3].includes(r.code), r.stdout + r.stderr);
  }
  for (const f of allFiles(dir)) {
    if (f === join(dir, ".env")) continue;
    assert.ok(!readFileSync(f, "utf8").includes(secret), f);
  }
});

test("the exported runtime works standalone: bootstrap, validate, ci-check, routing", (t) => {
  const dir = copyFixture("backend-express");
  t.after(() => cleanup(dir));
  assert.equal(exportTo(dir, "codex").code, 0);
  let r = node(dir, ".agent-framework/runtime/scripts/bootstrap.mjs", ["apply"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(join(dir, ".claude/agent-framework.json")));
  r = node(dir, ".agent-framework/runtime/scripts/tasks.mjs", ["validate"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = node(dir, ".agent-framework/runtime/scripts/ci-check.mjs");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^OK/);
  r = node(dir, ".agent-framework/runtime/scripts/routing.mjs", ["check"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  // Re-exporting after bootstrap must not disturb bootstrap's own files.
  assert.deepEqual(Object.keys(counts(exportTo(dir, "codex").stdout)), ["unchanged"]);
});

test("ci-check flags a done task whose gate is blocked, and is a no-op when the framework is off", (t) => {
  const dir = tempProject({}, { framework: false });
  t.after(() => cleanup(dir));
  exportTo(dir, "copilot");
  let r = node(dir, ".agent-framework/runtime/scripts/ci-check.mjs");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /not enabled/);
  write(dir, ".claude/agent-framework.json", JSON.stringify({ version: 1 }));
  const task = node(dir, ".agent-framework/runtime/scripts/tasks.mjs", ["new", "--title", "Do it", "--agent", "implementer", "--scope", "src/**", "--validation", "npm test", "--acceptance", "works"]);
  assert.equal(task.status, 0, task.stdout + task.stderr);
  const file = readdirSync(join(dir, "tasks")).find((n) => n.startsWith("TASK-001"));
  const p = join(dir, "tasks", file);
  writeFileSync(p, readFileSync(p, "utf8").replace(/^status: .*$/m, "status: done"));
  r = node(dir, ".agent-framework/runtime/scripts/ci-check.mjs");
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /TASK-001/);
});

test("cursor hook adapter runs the unchanged guards as a process", (t) => {
  const dir = tempProject({}, { framework: true });
  t.after(() => cleanup(dir));
  exportTo(dir, "cursor");
  const hook = (kind, payload) => {
    const r = node(dir, ".agent-framework/runtime/hooks/adapters/cursor.mjs", [kind], JSON.stringify({ cwd: dir, ...payload }));
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  assert.equal(hook("shell", { command: "rm -rf /" }).permission, "deny");
  assert.equal(hook("shell", { command: "ls -la" }).permission, "allow");
  const env = hook("pre-edit", { tool_name: "Write", tool_input: { file_path: ".env" } });
  assert.equal(env.permission, "deny");
  assert.match(env.agent_message, /ask the user/);
  assert.equal(hook("pre-edit", { tool_name: "Write", tool_input: { file_path: "src/app.js" } }).permission, "allow");
  assert.match(hook("session", {}).additional_context, /framework is active/);
  assert.deepEqual(hook("post-edit", { tool_input: { file_path: "src/app.js" } }), {});
  // Garbage in, answer out: a permission hook must always emit valid JSON.
  const r = node(dir, ".agent-framework/runtime/hooks/adapters/cursor.mjs", ["shell"], "not json");
  assert.deepEqual(JSON.parse(r.stdout), { permission: "allow" });
});

test("git pre-commit installer: installs, is idempotent, never replaces a foreign hook without --force", (t) => {
  const dir = tempProject({}, { framework: false });
  t.after(() => cleanup(dir));
  mkdirSync(join(dir, ".git/hooks"), { recursive: true });
  let res = installPreCommit(dir);
  assert.equal(res.status, "installed");
  assert.match(readFileSync(res.path, "utf8"), new RegExp(HOOK_MARKER));
  assert.match(readFileSync(res.path, "utf8"), /ci-check\.mjs/);
  assert.equal(installPreCommit(dir).status, "unchanged");
  writeFileSync(res.path, "#!/bin/sh\necho mine\n");
  assert.equal(installPreCommit(dir).status, "conflict");
  assert.match(readFileSync(res.path, "utf8"), /echo mine/);
  res = installPreCommit(dir, { force: true });
  assert.equal(res.status, "replaced");
  assert.match(readFileSync(res.backup, "utf8"), /echo mine/);
  const noGit = tempProject({}, { framework: false });
  t.after(() => cleanup(noGit));
  cleanup(join(noGit, ".git"));
  assert.equal(installPreCommit(noGit).status, "no-git");
});
