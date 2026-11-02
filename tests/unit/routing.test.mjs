import { test } from "node:test";
import assert from "node:assert/strict";
import { tempProject, cleanup, writeTask, run } from "../helpers.mjs";
import { resolveModel, checkRouting, isAllowedModel, effectiveRouting, RoutingBlockedError } from "../../scripts/lib/routing.mjs";
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

test("unknown agent: blocked, not a silent coding-tier default", () => {
  assert.throws(() => resolveModel("totally-unregistered-agent"), RoutingBlockedError);
  assert.throws(() => resolveModel("totally-unregistered-agent"), /unknown agent "totally-unregistered-agent"/);
  // An explicit, caller-approved compatibility tier is the only way around it.
  const r = resolveModel("totally-unregistered-agent", { compatTier: "fast" });
  assert.equal(r.tier, "fast");
  assert.equal(r.model, "haiku");
  assert.match(r.source, /explicit compatibility override/);
});

test("unavailable model: BLOCKED with a clear reason, not a crash", () => {
  try {
    resolveModel("security-reviewer", { unavailable: ["opus", "sonnet"] });
    assert.fail("expected throw");
  } catch (e) {
    assert.ok(e instanceof RoutingBlockedError);
    assert.equal(e.blocked, true);
    assert.match(e.reason, /No available model for tier security/);
  }
});

test("escalation that would land review on the implementer's model instead switches to a distinct fallback", () => {
  // Default routing: coding escalates sonnet -> opus after 2 attempts; review
  // tier is opus by default too, so a review dispatched after the
  // implementer has escalated would otherwise silently share its model.
  // review.fallbacks includes "sonnet", so independence is preserved by
  // switching rather than blocking.
  const impl = resolveModel("implementer", { attempt: 2 });
  assert.equal(impl.model, "opus");
  const review = resolveModel("code-reviewer", { peerModel: impl.model });
  assert.equal(review.tier, "review");
  assert.notEqual(review.model, impl.model);
  assert.equal(review.model, "sonnet");
});

test("review independence: BLOCKED (not a silent same-model review) when no distinct fallback exists", () => {
  const root = tempProject({
    ".claude/agent-framework.json": JSON.stringify({
      routing: { tiers: { review: { model: "opus", fallbacks: [] } } },
    }),
  });
  try {
    assert.throws(() => resolveModel("code-reviewer", { root, peerModel: "opus" }), RoutingBlockedError);
    try {
      resolveModel("code-reviewer", { root, peerModel: "opus" });
    } catch (e) {
      assert.match(e.reason, /no model distinct from the implementer/);
    }
  } finally {
    cleanup(root);
  }
});

test("review independence can be disabled per project (documented opt-out)", () => {
  const root = tempProject({
    ".claude/agent-framework.json": JSON.stringify({ gates: { require_independent_review_model: false } }),
  });
  try {
    const r = resolveModel("code-reviewer", { root, peerModel: "opus" });
    assert.equal(r.model, "opus");
  } finally {
    cleanup(root);
  }
});

test("routing.mjs CLI: unknown agent and exhausted fallbacks surface as BLOCKED, not a stack trace", () => {
  const r1 = run("scripts/routing.mjs", ["resolve", "no-such-agent", "--json"]);
  assert.equal(r1.code, 3, r1.stderr);
  assert.match(JSON.parse(r1.stdout).reason, /unknown agent "no-such-agent"/);

  const r2 = run("scripts/routing.mjs", ["resolve", "security-reviewer", "--unavailable", "opus,sonnet"]);
  assert.equal(r2.code, 3);
  assert.match(r2.stderr, /^BLOCKED: No available model/);

  const r3 = run("scripts/routing.mjs", ["resolve", "no-such-agent", "--compat-tier", "fast"]);
  assert.equal(r3.code, 0, r3.stderr);
  assert.equal(r3.stdout.trim(), "haiku");
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
