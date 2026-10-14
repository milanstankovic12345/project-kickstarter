import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { REPO, cleanup } from "../helpers.mjs";

function copyRepo() {
  const dir = mkdtempSync(join(tmpdir(), "pk-repo-"));
  cpSync(REPO, dir, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules|fixtures|reports|tasks|project-context)([\\/]|$)/.test(src.slice(REPO.length)) });
  return dir;
}
function validate(dir) {
  const r = spawnSync(process.execPath, [join(dir, "scripts/validate.mjs"), "--json"], { encoding: "utf8" });
  return { code: r.status, ...JSON.parse(r.stdout) };
}
const edit = (dir, rel, fn) => writeFileSync(join(dir, rel), fn(readFileSync(join(dir, rel), "utf8")));

test("validator detects injected misconfigurations", (t) => {
  const dir = copyRepo();
  t.after(() => cleanup(dir));
  edit(dir, "agents/docs-writer.md", (s) => s.replace(/^description: .*$/m, "description: Writes docs: README and guides"));
  edit(dir, "agents/implementer.md", (s) => s.replace(/^model: .*$/m, "model: gpt-4"));
  edit(dir, "agents/code-reviewer.md", (s) => s.replace(/^tools: .*$/m, "tools: Read, Grep, Glob, Bash, Edit"));
  edit(dir, "agents/planner.md", (s) => s.replace(/^tools: .*$/m, "tools: Read, Write, Edit, Bash, Agent"));
  unlinkSync(join(dir, "agents/visual-qa.md"));
  edit(dir, "skills/testing-tdd/SKILL.md", (s) => s.replace(/^description: .*$/m, `description: ${"x".repeat(1600)}`));
  edit(dir, "hooks/hooks.json", (s) => s.replace('"SubagentStop"', '"SubagentStopp"'));
  edit(dir, "config/capability-map.json", (s) => {
    const m = JSON.parse(s);
    m.agent_rules.find((r) => r.id === "data").enable = ["dba-wizard"];
    return JSON.stringify(m, null, 2);
  });
  edit(dir, "skills/project-kickstarter/templates/hooks/guard-bash.mjs", (s) => s + "\n// drift\n");
  edit(dir, "config/protected-paths.json", (s) => s.replace('{ "glob": "**/config/model-routing.json", "reason": "model routing policy" },', ""));
  edit(dir, "commands/review.md", (s) => s + "\nUse project-kickstarter:nonexistent-skill.\n");
  const r = validate(dir);
  assert.equal(r.code, 1);
  const all = r.errors.join("\n");
  for (const re of [
    /agents\/docs-writer\.md: invalid frontmatter: .*quote the value/,
    /agents\/implementer\.md: model "gpt-4" not allowed/,
    /agents\/code-reviewer\.md: access "review" must not have tool Edit/,
    /agents\/planner\.md: .*only the orchestrator may delegate/,
    /agent visual-qa has no agents\/visual-qa\.md/,
    /testing-tdd\/SKILL\.md: description\+when_to_use is \d+ chars/,
    /unknown event SubagentStopp/,
    /rule data enables unknown agent dba-wizard/,
    /guard-bash\.mjs: out of sync/,
    /security-critical path config\/model-routing\.json is not protected/,
    /references unknown skill\/agent\/command project-kickstarter:nonexistent-skill/,
  ]) assert.match(all, re);
});

test("validator passes on an unmodified copy of the repository", (t) => {
  const dir = copyRepo();
  t.after(() => cleanup(dir));
  const r = validate(dir);
  assert.deepEqual(r.errors, []);
  assert.equal(r.code, 0);
  assert.equal(r.counts.agents, 24);
});
