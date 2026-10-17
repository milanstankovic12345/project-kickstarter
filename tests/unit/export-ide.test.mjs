import { test } from "node:test";
import assert from "node:assert/strict";
import { TARGETS, RUNTIME_REL, buildDesired, rewrite, copilotTools } from "../../scripts/lib/export-ide.mjs";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";
import { toClaude, fromClaude, handle } from "../../hooks/adapters/cursor.mjs";

test("rewrite points plugin-root references at the vendored runtime", () => {
  const text = 'node "${CLAUDE_PLUGIN_ROOT}/scripts/tasks.mjs"; see <plugin-root>/skills/x/SKILL.md';
  const out = rewrite(text, "cursor");
  assert.equal(out, `node "${RUNTIME_REL}/scripts/tasks.mjs"; see ${RUNTIME_REL}/skills/x/SKILL.md`);
});

test("rewrite maps slash commands per IDE and strips the plugin namespace", () => {
  const text = "Run `/project-kickstarter:run-task` or dispatch `project-kickstarter:code-reviewer`; claude --agent project-kickstarter:orchestrator";
  assert.match(rewrite(text, "cursor"), /`\/cmd-run-task`/);
  assert.match(rewrite(text, "codex"), /`\$cmd-run-task`/);
  assert.match(rewrite(text, "copilot"), /`\/run-task`/);
  for (const t of TARGETS) {
    const out = rewrite(text, t);
    assert.doesNotMatch(out, /project-kickstarter:/);
    assert.doesNotMatch(out, /claude --agent/);
    assert.match(out, /`code-reviewer`/);
  }
});

test("copilotTools maps Claude tool names to Copilot aliases", () => {
  assert.deepEqual(copilotTools("Read, Grep, Glob, Write, Edit, Bash"), ["read", "search", "edit", "execute"]);
  assert.deepEqual(copilotTools(["Agent", "Bash", "Read", "Unknown"]), ["agent", "execute", "read"]);
  assert.deepEqual(copilotTools(undefined), []);
});

for (const target of TARGETS) {
  test(`buildDesired(${target}): complete, parseable, no Claude-only references`, () => {
    const files = buildDesired(target);
    const paths = files.map((f) => f.path);
    assert.equal(new Set(paths).size, paths.length, "paths must be unique");
    for (const f of files) {
      assert.equal(typeof f.content, "string");
      if (f.kind === "runtime" && !f.path.endsWith(".md")) continue;
      if (f.path.endsWith(".md") || f.path.endsWith(".mdc")) {
        assert.doesNotMatch(f.content, /\$\{CLAUDE_PLUGIN_ROOT\}|<plugin-root>/, f.path);
        assert.doesNotMatch(f.content, /project-kickstarter:[a-z]/, f.path);
      }
    }
    // Runtime templates carry placeholder frontmatter on purpose; everything the IDE reads must parse.
    for (const f of files.filter((x) => x.kind !== "runtime" && /\.(md|mdc)$/.test(x.path) && x.content.startsWith("---\n"))) {
      assert.doesNotThrow(() => parseFrontmatter(f.content), f.path);
    }
    assert.ok(paths.includes(`${RUNTIME_REL}/scripts/tasks.mjs`));
    assert.ok(paths.includes(`${RUNTIME_REL}/docs/sequential-mode.md`));
    assert.ok(!paths.some((p) => p.includes("/skills/project-kickstarter/")), "interview skill is not vendored");
    assert.ok(!paths.some((p) => p.endsWith("scripts/export-ide.mjs") || p.endsWith("hooks/hooks.json")));
  });
}

test("cursor and codex agents/commands are skills whose name matches the folder", () => {
  for (const target of ["cursor", "codex"]) {
    const skills = buildDesired(target).filter((f) => f.path.startsWith(".agents/skills/"));
    assert.ok(skills.length >= 30);
    for (const f of skills) {
      const folder = f.path.split("/")[2];
      const { data } = parseFrontmatter(f.content);
      assert.equal(data.name, folder);
      assert.match(data.name, /^(agent|cmd)-[a-z0-9-]+$/);
      assert.ok(data.description && data.description.length <= 1024, f.path);
      assert.equal(data["disable-model-invocation"], true);
    }
  }
});

test("cursor gets an always-on .mdc rule and hooks; codex gets an AGENTS.md section; neither gets the other's files", () => {
  const cursor = buildDesired("cursor");
  const rule = cursor.find((f) => f.path === ".cursor/rules/agent-framework.mdc");
  assert.equal(parseFrontmatter(rule.content).data.alwaysApply, true);
  assert.ok(cursor.some((f) => f.path === ".cursor/hooks.json"));
  assert.ok(!cursor.some((f) => f.path === "AGENTS.md"));
  assert.ok(!buildDesired("cursor", { hooks: false }).some((f) => f.path === ".cursor/hooks.json"));
  const codex = buildDesired("codex");
  const agentsMd = codex.find((f) => f.path === "AGENTS.md");
  assert.ok(agentsMd.section, "AGENTS.md is a marker section, never overwritten");
  assert.ok(!codex.some((f) => f.path.startsWith(".cursor/") || f.path.startsWith(".github/agents")));
});

test("copilot gets agents with mapped tools, prompts, instructions and scoped instructions", () => {
  const files = buildDesired("copilot");
  const reviewer = files.find((f) => f.path === ".github/agents/code-reviewer.agent.md");
  const { data, body } = parseFrontmatter(reviewer.content);
  assert.equal(data.name, "code-reviewer");
  assert.deepEqual(data.tools, ["read", "search", "execute"], "read-only reviewer has no edit tool");
  assert.equal("model" in data, false, "tier model names are not Copilot models");
  assert.match(body, /Read-only role/);
  const impl = parseFrontmatter(files.find((f) => f.path === ".github/agents/implementer.agent.md").content).data;
  assert.ok(impl.tools.includes("edit"));
  const prompt = parseFrontmatter(files.find((f) => f.path === ".github/prompts/run-task.prompt.md").content).data;
  assert.equal(prompt.agent, "agent");
  assert.ok(files.find((f) => f.path === ".github/copilot-instructions.md").section);
  assert.match(parseFrontmatter(files.find((f) => f.path.endsWith("agent-framework-artifacts.instructions.md")).content).data.applyTo, /tasks\/\*\*/);
});

test("--no-ci drops the workflow", () => {
  assert.ok(buildDesired("codex").some((f) => f.path === ".github/workflows/agent-framework.yml"));
  assert.ok(!buildDesired("codex", { ci: false }).some((f) => f.path.startsWith(".github/workflows/")));
});

test("output is deterministic", () => {
  for (const t of TARGETS) assert.deepEqual(buildDesired(t), buildDesired(t));
});

test("cursor adapter translates payloads in both directions", () => {
  assert.deepEqual(toClaude("shell", { command: "ls", cwd: "/p" }), { tool_name: "Bash", tool_input: { command: "ls" }, cwd: "/p" });
  assert.equal(toClaude("shell", {}), null);
  assert.deepEqual(toClaude("pre-edit", { tool_name: "Write", tool_input: { path: "a.txt" }, workspace_roots: ["/w"] }), { tool_name: "Write", tool_input: { file_path: "a.txt" }, cwd: "/w" });

  const deny = { hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: "nope" } };
  const ask = { hookSpecificOutput: { permissionDecision: "ask", permissionDecisionReason: "sure?" } };
  assert.equal(fromClaude("shell", deny).permission, "deny");
  assert.equal(fromClaude("shell", ask).permission, "ask");
  assert.equal(fromClaude("shell", {}).permission, "allow");
  assert.equal(fromClaude("pre-edit", ask).permission, "deny", "preToolUse cannot ask, so it denies");
  assert.deepEqual(fromClaude("post-edit", { decision: "block", reason: "bad task file" }), { additional_context: "bad task file" });
  assert.deepEqual(fromClaude("post-edit", {}), {});
  assert.match(fromClaude("session", { hookSpecificOutput: { additionalContext: "run /project-kickstarter:status" } }).additional_context, /\/cmd-status/);
});

test("cursor adapter fails open when the guard crashes or there is nothing to check", () => {
  const boom = () => { throw new Error("guard crashed"); };
  assert.deepEqual(handle("shell", { command: "ls" }, { runner: boom }), { permission: "allow" });
  assert.deepEqual(handle("pre-edit", { tool_input: { file_path: "a" } }, { runner: boom }), { permission: "allow" });
  assert.deepEqual(handle("shell", {}, { runner: boom }), { permission: "allow" });
  assert.deepEqual(handle("post-edit", { tool_input: { file_path: "a" } }, { runner: boom }), {});
});
