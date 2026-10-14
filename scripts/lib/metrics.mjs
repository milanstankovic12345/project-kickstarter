// Metrics from reports/metrics/events.jsonl (written by framework scripts
// and hooks). Only data the framework actually records is reported; token
// and cost usage are NOT available to these scripts and are never estimated.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, frameworkPaths, loadSchema } from "./project.mjs";
import { parseFrontmatter } from "./frontmatter.mjs";
import { validate as validateSchema } from "./schema.mjs";

export function readEvents(root, config = loadConfig(root)) {
  const p = frameworkPaths(root, config).metrics;
  if (!existsSync(p)) return { events: [], malformed: 0 };
  let malformed = 0;
  const events = [];
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { malformed++; }
  }
  return { events, malformed };
}

function inc(obj, key, n = 1) { obj[key] = (obj[key] ?? 0) + n; }

function errorCategory(msg) {
  const m = String(msg);
  if (/scope violation/.test(m)) return "scope_violation";
  if (/validation command not run/.test(m)) return "validation_not_run";
  if (/exited non-zero/.test(m)) return "failing_tests_claimed_done";
  if (/requires at least one executed/.test(m)) return "no_test_evidence";
  if (/schema/.test(m)) return "schema";
  if (/retry budget/.test(m)) return "retry_budget_exhausted";
  if (/gate:/.test(m)) return "gate_blocked";
  if (/dependencies not done/.test(m)) return "dependency_not_done";
  if (/overlaps/.test(m)) return "scope_conflict";
  if (/illegal transition/.test(m)) return "illegal_transition";
  return "other";
}

export function summarize(root, config = loadConfig(root)) {
  const { events, malformed } = readEvents(root, config);
  const s = {
    events: events.length,
    malformed_lines: malformed,
    period: events.length ? { from: events[0].ts, to: events.at(-1).ts } : null,
    transitions: {},
    rejected_transitions: {},
    tasks_done: 0,
    tasks_failed: 0,
    fix_loops: 0,
    handoffs: { saved: 0, rejected: 0, rejection_reasons: {} },
    reviews: { saved: 0, rejected: 0, by_kind: {}, findings: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, verdicts: {} },
    audits: { saved: 0, findings: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } },
    subagent_stops: { total: 0, missing_handoff: 0, by_agent: {} },
    per_agent: {},
    not_tracked: ["token usage", "cost", "latency per dispatch", "model actually used (unless recorded in handoffs)"],
  };
  for (const e of events) {
    switch (e.type) {
      case "transition":
        inc(s.transitions, `${e.from}->${e.to}`);
        if (e.to === "done") { s.tasks_done++; s.per_agent[e.agent] ??= { done: 0, failed: 0, fix_loops: 0 }; s.per_agent[e.agent].done++; }
        if (e.to === "failed") { s.tasks_failed++; s.per_agent[e.agent] ??= { done: 0, failed: 0, fix_loops: 0 }; s.per_agent[e.agent].failed++; }
        if (e.from === "review" && e.to === "in_progress") { s.fix_loops++; s.per_agent[e.agent] ??= { done: 0, failed: 0, fix_loops: 0 }; s.per_agent[e.agent].fix_loops++; }
        break;
      case "transition_rejected":
        for (const err of e.errors ?? []) inc(s.rejected_transitions, errorCategory(err));
        break;
      case "handoff_saved": s.handoffs.saved++; break;
      case "handoff_rejected":
        s.handoffs.rejected++;
        for (const err of e.errors ?? []) inc(s.handoffs.rejection_reasons, errorCategory(err));
        break;
      case "review_saved":
        s.reviews.saved++;
        inc(s.reviews.by_kind, e.kind);
        inc(s.reviews.verdicts, e.verdict);
        for (const [sev, n] of Object.entries(e.findings ?? {})) s.reviews.findings[sev] = (s.reviews.findings[sev] ?? 0) + n;
        break;
      case "review_rejected": s.reviews.rejected++; break;
      case "audit_saved":
        s.audits.saved++;
        for (const [sev, n] of Object.entries(e.findings ?? {})) s.audits.findings[sev] = (s.audits.findings[sev] ?? 0) + n;
        break;
      case "subagent_stop":
        s.subagent_stops.total++;
        inc(s.subagent_stops.by_agent, e.agent);
        if (!e.has_handoff && !e.retry) s.subagent_stops.missing_handoff++;
        break;
      default: break;
    }
  }
  return s;
}

/** Heuristic signals worth investigating, each with its evidence. Proposals still need human review. */
export function signals(s) {
  const out = [];
  const rr = s.handoffs.rejection_reasons;
  if ((rr.validation_not_run ?? 0) >= 2) out.push({ id: "validation-skipped", evidence: `${rr.validation_not_run} handoffs rejected for skipped validation commands`, suggestion: "strengthen the evidence section of handoff-protocol or make validation commands cheaper/clearer in task-planning" });
  if ((rr.scope_violation ?? 0) >= 2) out.push({ id: "scope-too-narrow-or-ignored", evidence: `${rr.scope_violation} scope violations`, suggestion: "review task-planning scope rules (scopes may be too narrow) or implementer scope discipline" });
  if ((rr.failing_tests_claimed_done ?? 0) >= 1) out.push({ id: "false-done-claims", evidence: `${rr.failing_tests_claimed_done} handoffs claimed done with failing commands`, suggestion: "audit the offending agents' prompts; consider escalating their tier" });
  if (s.fix_loops >= 3 && s.tasks_done && s.fix_loops / s.tasks_done > 0.5) out.push({ id: "high-fix-loop-rate", evidence: `${s.fix_loops} fix loops for ${s.tasks_done} completed tasks`, suggestion: "inspect recurring review findings; add them to implementer checklists or testing-tdd" });
  if (s.subagent_stops.total >= 3 && s.subagent_stops.missing_handoff / s.subagent_stops.total > 0.3) out.push({ id: "handoff-block-missing", evidence: `${s.subagent_stops.missing_handoff}/${s.subagent_stops.total} subagent stops without HANDOFF block`, suggestion: "make the final-message contract more prominent in agent bodies" });
  if ((s.rejected_transitions.retry_budget_exhausted ?? 0) >= 1 || s.tasks_failed >= 2) out.push({ id: "tasks-failing", evidence: `${s.tasks_failed} failed tasks, ${s.rejected_transitions.retry_budget_exhausted ?? 0} retry-budget rejections`, suggestion: "check whether failed tasks were oversized (task-planning size rules) or under-specified" });
  for (const [agent, a] of Object.entries(s.per_agent)) if (a.failed >= 2 && a.failed >= a.done) out.push({ id: `agent-${agent}-struggling`, evidence: `${agent}: ${a.failed} failed vs ${a.done} done`, suggestion: `review ${agent}'s instructions or its model tier` });
  return out;
}

export function listProposals(root, config = loadConfig(root)) {
  const dir = frameworkPaths(root, config).improvements;
  if (!existsSync(dir)) return [];
  const schema = loadSchema("proposal");
  return readdirSync(dir).filter((n) => /^PROP-\d{3,}.*\.md$/.test(n)).sort().map((n) => {
    try {
      const { data } = parseFrontmatter(readFileSync(join(dir, n), "utf8"));
      return { file: n, data, errors: validateSchema(schema, data) };
    } catch (e) {
      return { file: n, data: null, errors: [e.message] };
    }
  });
}
