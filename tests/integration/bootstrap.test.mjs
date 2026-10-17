import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { copyFixture, cleanup, run } from "../helpers.mjs";
import { plan, apply, validateProject } from "../../scripts/lib/bootstrap.mjs";
import { discover } from "../../scripts/lib/discover.mjs";
import { validateTaskSet } from "../../scripts/lib/tasks.mjs";
import { knownAgentNames, subagentType, loadRegistry } from "../../scripts/lib/registry.mjs";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";

const names = (p) => p.capabilities.enabled.map((a) => a.name);

function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      if (n === ".git") continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(dir, p).replace(/\\/g, "/")] = createHash("sha256").update(readFileSync(p)).digest("hex");
    }
  };
  walk(dir);
  return out;
}

function allText(dir) {
  return Object.keys(snapshot(dir)).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
}

test("frontend project: UI agents enabled, backend/data/devops agents omitted", (t) => {
  const root = copyFixture("frontend-react");
  t.after(() => cleanup(root));
  const p = plan(root);
  for (const a of ["frontend-engineer", "ui-director", "accessibility-auditor", "visual-qa", "orchestrator", "code-reviewer", "security-reviewer"]) assert.ok(names(p).includes(a), a);
  for (const a of ["backend-engineer", "database-engineer", "devops-engineer", "threat-modeler"]) assert.ok(!names(p).includes(a), a);
  assert.ok(names(p).length < Object.keys(loadRegistry().agents).length, "never enables every agent");
  assert.deepEqual(p.capabilities.gaps.map((g) => g.id).sort(), ["no-ci", "no-design-direction"]);
  assert.deepEqual(p.capabilities.specialists, []);
});

test("backend project: no UI agents; data, delivery and security agents enabled", (t) => {
  const root = copyFixture("backend-express");
  t.after(() => cleanup(root));
  const p = plan(root);
  for (const a of ["backend-engineer", "database-engineer", "devops-engineer", "threat-modeler", "security-tester", "dependency-auditor"]) assert.ok(names(p).includes(a), a);
  for (const a of ["frontend-engineer", "ui-director", "accessibility-auditor", "visual-qa"]) assert.ok(!names(p).includes(a), a);
  assert.deepEqual(p.capabilities.gaps.map((g) => g.id), ["no-threat-model"]);
});

test("full-stack project: both sides, payments specialist, gap tasks are valid drafts", (t) => {
  const root = copyFixture("fullstack-next");
  t.after(() => cleanup(root));
  const res = apply(root);
  for (const a of ["frontend-engineer", "backend-engineer", "database-engineer", "threat-modeler"]) assert.ok(names(res).includes(a), a);
  assert.deepEqual(res.capabilities.specialists.map((s) => s.name), ["payments-specialist"]);
  assert.ok(existsSync(join(root, ".claude/agents/payments-specialist.md")));
  const spec = parseFrontmatter(readFileSync(join(root, ".claude/agents/payments-specialist.md"), "utf8")).data;
  assert.equal(spec.model, "opus", "security-tier specialist gets the routed model");
  const gaps = res.capabilities.gaps.map((g) => g.id).sort();
  assert.deepEqual(gaps, ["env-not-ignored", "no-ci", "no-design-direction", "no-tests", "no-threat-model"]);
  const v = validateTaskSet(root, { knownAgents: knownAgentNames(root) });
  assert.deepEqual(v.errors, [], JSON.stringify(v.errors));
  assert.equal(validateProject(root).errors.length, 0, JSON.stringify(validateProject(root).errors));
});

test("idempotency: second apply changes nothing", (t) => {
  const root = copyFixture("fullstack-next");
  t.after(() => cleanup(root));
  apply(root);
  const before = snapshot(root);
  const second = apply(root);
  assert.equal(second.actions.filter((a) => ["create", "update", "conflict"].includes(a.action)).length, 0, JSON.stringify(second.actions.filter((a) => a.action !== "unchanged" && a.action !== "skip")));
  const after = snapshot(root);
  delete before["reports/bootstrap-report.md"];
  delete after["reports/bootstrap-report.md"];
  assert.deepEqual(after, before);
});

test("pre-existing kickstarter project: reuses agents, aliases roles, preserves user files", (t) => {
  const root = copyFixture("existing-plugin");
  t.after(() => cleanup(root));
  const res = apply(root);
  const reused = Object.fromEntries(res.capabilities.reused.map((r) => [r.name, r.covers]));
  assert.equal(reused["backend-engineer"], "backend-engineer");
  assert.equal(reused["qa-engineer"], "test-engineer");
  assert.equal(reused["tech-lead"], "planner");
  assert.ok("fx-api-conventions" in reused);
  assert.equal(subagentType("test-engineer", root), "qa-engineer");
  assert.equal(subagentType("backend-engineer", root), "backend-engineer", "project override wins over plugin agent");
  assert.equal(subagentType("code-reviewer", root), "project-kickstarter:code-reviewer");
  // user content preserved, section appended once
  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.match(readme, /User README content that bootstrap must not rewrite/);
  assert.equal(readme.match(/project-kickstarter:start/g).length, 1);
  const claude = readFileSync(join(root, "CLAUDE.md"), "utf8");
  assert.match(claude, /User-written project instructions/);
  assert.equal(readFileSync(join(root, ".claude/agents/qa-engineer.md"), "utf8").includes("User-customized agent body"), true);
  apply(root);
  assert.equal(readFileSync(join(root, "README.md"), "utf8").match(/project-kickstarter:start/g).length, 1, "no duplicate sections on rerun");
});

test("user customizations are never overwritten without --force; --force keeps a backup", (t) => {
  const root = copyFixture("backend-express");
  t.after(() => cleanup(root));
  apply(root);
  const cfgPath = join(root, ".claude/agent-framework.json");
  const customized = readFileSync(cfgPath, "utf8").replace('"max_parallel": 3', '"max_parallel": 1');
  writeFileSync(cfgPath, customized);
  const readmePath = join(root, "README.md");
  writeFileSync(readmePath, readFileSync(readmePath, "utf8").replace("Enabled agents:", "Enabled agents (edited by me):"));
  // force a regeneration need: change sources
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  pkg.dependencies.react = "^18.3.1";
  writeFileSync(join(root, "package.json"), JSON.stringify(pkg, null, 2));
  const res = apply(root);
  const conflicts = res.actions.filter((a) => a.action === "conflict").map((a) => a.path).sort();
  assert.deepEqual(conflicts, [".claude/agent-framework.json", "README.md"]);
  assert.equal(readFileSync(cfgPath, "utf8"), customized, "customized config untouched");
  assert.ok(existsSync(join(root, ".claude/agent-framework/proposed/.claude/agent-framework.json")));
  const forced = apply(root, { force: true });
  assert.ok(forced.actions.filter((a) => a.action === "conflict").every((a) => a.applied && a.backup && existsSync(a.backup)));
  assert.match(readFileSync(cfgPath, "utf8"), /frontend-engineer/, "forced update applied new recommendation");
});

test("profile is versioned: regenerates on source change and preserves Notes", (t) => {
  const root = copyFixture("frontend-react");
  t.after(() => cleanup(root));
  apply(root);
  const path = join(root, "project-context/project-profile.md");
  const v1 = parseFrontmatter(readFileSync(path, "utf8")).data;
  assert.equal(v1.profile_version, 1);
  writeFileSync(path, readFileSync(path, "utf8").replace("Bootstrap never edits this part.", "Bootstrap never edits this part.\n\nOur domain: invoicing."));
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  pkg.dependencies["@mui/material"] = "^6.0.0";
  writeFileSync(join(root, "package.json"), JSON.stringify(pkg, null, 2));
  apply(root);
  const text = readFileSync(path, "utf8");
  assert.equal(parseFrontmatter(text).data.profile_version, 2);
  assert.match(text, /MUI|component libraries: MUI/);
  assert.match(text, /Our domain: invoicing\./);
});

test("cancelled gap tasks are not regenerated (no duplicate work)", (t) => {
  const root = copyFixture("frontend-react");
  t.after(() => cleanup(root));
  apply(root);
  const r = run("scripts/tasks.mjs", ["transition", "TASK-001", "cancelled", "--root", root]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const res = apply(root);
  assert.equal(res.actions.filter((a) => a.kind === "task" && a.action === "create").length, 0);
});

test("secrets: values in .env files never appear in discovery output or generated files", (t) => {
  for (const [fx, secret] of [["backend-express", "FIXTURE_SECRET_VALUE_MUST_NEVER_BE_READ"], ["fullstack-next", "FIXTURE_STRIPE_SECRET_MUST_NEVER_BE_READ"]]) {
    const root = copyFixture(fx);
    t.after(() => cleanup(root));
    const d = discover(root);
    assert.ok(!JSON.stringify(d).includes(secret));
    assert.ok(d.secret_files.length > 0, "secret file names are listed");
    apply(root);
    const generated = ["project-context/project-profile.md", "README.md", ".claude/agent-framework.json", "reports/bootstrap-report.md"].map((f) => readFileSync(join(root, f), "utf8")).join("\n");
    assert.ok(!generated.includes(secret), `${fx}: secret leaked`);
  }
});

test("misconfigured project: precise validation errors and no destructive apply", (t) => {
  const root = copyFixture("misconfigured");
  t.after(() => cleanup(root));
  const v = validateProject(root);
  const msgs = v.errors.join("\n");
  assert.match(msgs, /unknown property "unknown_key"/);
  assert.match(msgs, /enabled agent "ghost-agent" does not exist/);
  assert.match(msgs, /alias target "missing-local-agent"/);
  assert.match(msgs, /model "gpt-4" not allowed/);
  assert.match(msgs, /dependency cycle: TASK-001 -> TASK-002 -> TASK-001/);
  assert.match(msgs, /Plain scalar contains ": "/);
  assert.match(msgs, /manifest package.json is not valid JSON/);
  const cfgBefore = readFileSync(join(root, ".claude/agent-framework.json"), "utf8");
  const res = apply(root);
  assert.equal(readFileSync(join(root, ".claude/agent-framework.json"), "utf8"), cfgBefore, "user config not overwritten");
  const created = res.actions.filter((a) => a.kind === "task" && a.action === "create").map((a) => a.path);
  assert.ok(created.every((p) => !p.startsWith("tasks/TASK-003")), "never collides with an unparseable task file");
  const cli = run("scripts/bootstrap.mjs", ["validate", "--root", root]);
  assert.equal(cli.code, 1);
});

test("CLI: plan exits 3 on conflicts, apply prints report path", (t) => {
  const root = copyFixture("misconfigured");
  t.after(() => cleanup(root));
  const r = run("scripts/bootstrap.mjs", ["plan", "--root", root]);
  assert.equal(r.code, 3);
  assert.match(r.stdout, /conflict\s+\.claude\/agent-framework\.json/);
  const root2 = copyFixture("frontend-react");
  t.after(() => cleanup(root2));
  const a = run("scripts/bootstrap.mjs", ["apply", "--root", root2]);
  assert.equal(a.code, 0, a.stderr);
  assert.match(a.stdout, /Report: reports\/bootstrap-report\.md/);
  assert.match(readFileSync(join(root2, "reports/bootstrap-report.md"), "utf8"), /## Agents/);
});
