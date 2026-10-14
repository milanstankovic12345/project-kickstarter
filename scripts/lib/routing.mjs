// Model routing: logical tier -> model alias, with project overrides,
// fallbacks for unavailable models, and escalation on retries.
import { deepMerge, loadConfig } from "./project.mjs";
import { loadRegistry, loadRouting } from "./registry.mjs";

export function effectiveRouting(root) {
  const base = loadRouting();
  const project = root ? (loadConfig(root).routing ?? {}) : {};
  return {
    ...base,
    tiers: deepMerge(base.tiers, project.tiers ?? {}),
    agentTiers: project.agents ?? {},
    escalate_after_attempts: project.escalate_after_attempts ?? base.escalate_after_attempts,
  };
}

export function isAllowedModel(model, routing = loadRouting()) {
  if (typeof model !== "string") return false;
  return routing.allowed_models.includes(model) || new RegExp(routing.allowed_model_id_pattern).test(model);
}

/** Static check of a routing table. Returns array of error strings. */
export function checkRouting(routing, registry = loadRegistry()) {
  const errors = [];
  const tiers = routing.tiers ?? {};
  const required = ["reasoning", "coding", "fast", "review", "security", "ui"];
  for (const t of required) if (!tiers[t]) errors.push(`tier "${t}" is not defined`);
  for (const [name, t] of Object.entries(tiers)) {
    if (!isAllowedModel(t.model, routing)) errors.push(`tier ${name}: model "${t.model}" is not an allowed alias or model id`);
    for (const f of t.fallbacks ?? []) if (!isAllowedModel(f, routing)) errors.push(`tier ${name}: fallback "${f}" is not allowed`);
    if ((t.fallbacks ?? []).includes(t.model)) errors.push(`tier ${name}: fallback repeats primary model`);
    if (t.effort != null && !["low", "medium", "high", "xhigh", "max"].includes(t.effort)) errors.push(`tier ${name}: invalid effort "${t.effort}"`);
  }
  for (const [agent, a] of Object.entries(registry.agents)) if (!tiers[a.tier]) errors.push(`agent ${agent}: unknown tier "${a.tier}"`);
  for (const [agent, tier] of Object.entries(routing.agentTiers ?? {})) if (!tiers[tier]) errors.push(`override for ${agent}: unknown tier "${tier}"`);
  if (tiers.review && tiers.coding && tiers.review.model === tiers.coding.model) {
    errors.push("review tier uses the same model as coding tier; independent review should use a different model (set a different model or accept by documenting it)");
  }
  return errors;
}

function strength(model, order) {
  const base = String(model).replace(/\[.*\]$/, "");
  const i = order.indexOf(base);
  return i === -1 ? -1 : i;
}

/**
 * Resolve the model for a dispatch.
 *  agent: registry name (or project specialist with tier in config.specialists)
 *  opts.taskTier: model_tier from the task (overrides agent tier)
 *  opts.attempt: current attempt number (0-based); escalates after threshold
 *  opts.unavailable: models known to be unavailable (skip to fallbacks)
 */
export function resolveModel(agent, { root, taskTier, attempt = 0, unavailable = [] } = {}) {
  const routing = effectiveRouting(root);
  const registry = loadRegistry();
  const short = agent.includes(":") ? agent.split(":").pop() : agent;
  const specialists = root ? (loadConfig(root).specialists ?? []) : [];
  const spec = specialists.find((s) => s.name === short);
  let tier = taskTier ?? routing.agentTiers[short] ?? registry.agents[short]?.tier ?? spec?.tier;
  let source = taskTier ? "task.model_tier" : routing.agentTiers[short] ? "project override" : registry.agents[short] ? "registry" : spec ? "specialist" : null;
  if (!tier) { tier = "coding"; source = "default (unknown agent)"; }
  const t = routing.tiers[tier];
  if (!t) throw new Error(`Unknown tier "${tier}"`);
  const candidates = [t.model, ...(t.fallbacks ?? [])].filter((m) => !unavailable.includes(m));
  if (candidates.length === 0) throw new Error(`No available model for tier ${tier} (all of ${[t.model, ...(t.fallbacks ?? [])].join(", ")} unavailable)`);
  let model = candidates[0];
  let escalated = false;
  if (attempt >= routing.escalate_after_attempts) {
    const stronger = candidates.filter((m) => strength(m, routing.strength_order) > strength(model, routing.strength_order))
      .sort((a, b) => strength(a, routing.strength_order) - strength(b, routing.strength_order));
    if (stronger.length) { model = stronger[0]; escalated = true; }
  }
  return { agent: short, tier, model, fallbacks: candidates.filter((m) => m !== model), effort: t.effort ?? null, source, escalated };
}
