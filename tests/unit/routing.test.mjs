import { test } from "node:test";
import assert from "node:assert/strict";
import { tempProject, cleanup, writeTask, run } from "../helpers.mjs";
import { resolveModel, checkRouting, isAllowedModel, effectiveRouting } from "../../scripts/lib/routing.mjs";
import { loadRegistry, loadRouting } from "../../scripts/lib/registry.mjs";

test("shipped routing table is valid", () => {
  assert.deepEqual(checkRouting(effectiveRouting(null), loadRegistry()), []);
});

test("allowed models: verified aliases and full ids only", () => {
  for (const m of ["opus", "sonnet", "haiku", "inherit", "claude-opus-5-5", "sonnet[1m]"]) assert.ok(isAllowedModel(m), m);
  for (const m of ["gpt-4o", "opus-latest", "", null, "Claude Opus"]) assert.ok(!isAllowedModel(m), String(m));
});

test("checkRouting catches bad tables", () => {
  const routing = { ...loadRouting(), tiers: { ...loadRouting().tiers, coding: { model: "gpt-5", fallbacks: ["gpt-5"] } } };
  const errs = checkRouting(routing, loadRegistry()).join("\n");
  assert.match(errs, /model "gpt-5" is not an allowed/);
  assert.match(errs, /fallback repeats primary/);
  const same = { ...loadRouting(), tiers: { ...loadRouting().tiers, review: { model: "sonnet", fallbacks: [] } } };
  assert.match(checkRouting(same, loadRegistry()).join(), /independent review should use a different model/);
});

test("resolve: registry tier, task override, fallback, escalation", () => {
  assert.equal(resolveModel("backend-engineer").model, "sonnet");
  assert.equal(resolveModel("project-kickstarter:security-reviewer").model, "opus");
  assert.equal(resolveModel("code-reviewer").tier, "review");
  assert.equal(resolveModel("implementer", { taskTier: "fast" }).model, "haiku");
  const fb = resolveModel("security-reviewer", { unavailable: ["opus"] });
  assert.equal(fb.model, "sonnet");
  const esc = resolveModel("implementer", { attempt: 2 });
  assert.equal(esc.model, "opus");
  assert.equal(esc.escalated, true);
  assert.equal(resolveModel("implementer", { attempt: 1 }).escalated, false);
  assert.throws(() => resolveModel("security-reviewer", { unavailable: ["opus", "sonnet"] }), /No available model/);
});

test("resolve: project overrides win and CLI reads task tier/attempts", (t) => {
  const root = tempProject({
    ".claude/agent-framework.json": JSON.stringify({ routing: { tiers: { coding: { model: "opus", fallbacks: ["sonnet"] } }, agents: { "docs-writer": "coding" } }, specialists: [{ name: "payments-expert", tier: "security" }] }),
  });
  t.after(() => cleanup(root));
  assert.equal(resolveModel("backend-engineer", { root }).model, "opus");
  assert.equal(resolveModel("docs-writer", { root }).source, "project override");
  assert.equal(resolveModel("payments-expert", { root }).model, "opus");
  writeTask(root, { id: "TASK-001", model_tier: "fast", attempts: 0 });
  const r = run("scripts/routing.mjs", ["resolve", "implementer", "--task", "TASK-001", "--root", root, "--json"]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).model, "haiku");
});
