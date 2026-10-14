// Task system core: load, validate, batch, transition.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseFrontmatter, setFrontmatterScalars, headings } from "./frontmatter.mjs";
import { validate as validateSchema } from "./schema.mjs";
import { setsMayOverlap } from "./glob.mjs";
import { findCycle } from "./graph.mjs";
import { loadSchema, loadConfig, frameworkPaths, appendEvent, today, rel } from "./project.mjs";
import { validateHandoffForTask, handoffPath } from "./handoff.mjs";
import { evaluateGate, requiredReviewKinds } from "./gate.mjs";
export { requiredReviewKinds };

export const STATES = ["draft", "ready", "in_progress", "review", "done", "blocked", "failed", "cancelled"];
export const TERMINAL = new Set(["done", "cancelled"]);
export const REQUIRED_SECTIONS = ["Objective", "Context", "Steps", "Blockers", "Deliverables"];

// from -> allowed targets
export const TRANSITIONS = {
  draft: ["ready", "cancelled"],
  ready: ["in_progress", "blocked", "draft", "cancelled"],
  in_progress: ["review", "blocked", "failed", "ready"],
  review: ["done", "in_progress", "blocked", "failed"],
  blocked: ["ready", "cancelled"],
  failed: ["ready", "cancelled"],
  done: [],
  cancelled: [],
};

const BROAD_GLOBS = new Set(["**", "**/*", "*", ".", "./", "/"]);
const PRIORITY_RANK = { p0: 0, p1: 1, p2: 2, p3: 3 };

export function loadTasks(root, config = loadConfig(root)) {
  const dir = frameworkPaths(root, config).tasks;
  if (!existsSync(dir)) return { tasks: [], parseErrors: [] };
  const tasks = [];
  const parseErrors = [];
  for (const name of readdirSync(dir).sort()) {
    if (!/^TASK-\d{3,}.*\.md$/.test(name)) continue;
    const file = join(dir, name);
    const text = readFileSync(file, "utf8");
    try {
      const { hasFrontmatter, data, body } = parseFrontmatter(text);
      if (!hasFrontmatter) {
        parseErrors.push({ file: rel(root, file), error: "missing YAML frontmatter" });
        continue;
      }
      tasks.push({ file, relFile: rel(root, file), name, data, body, text });
    } catch (e) {
      parseErrors.push({ file: rel(root, file), error: e.message });
    }
  }
  return { tasks, parseErrors };
}

function countSteps(body) {
  const m = /^##\s+Steps\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/m.exec(body);
  if (!m) return 0;
  return (m[1].match(/^\s*(\d+\.|[-*])\s+/gm) ?? []).length;
}

/**
 * Validate a whole task set. Returns { errors: [{task, file, message}], warnings: [...] }.
 * options.knownAgents / options.knownSkills (Sets) enable reference checks.
 */
export function validateTaskSet(root, { config = loadConfig(root), knownAgents, knownSkills } = {}) {
  const { tasks, parseErrors } = loadTasks(root, config);
  const schema = loadSchema("task");
  const errors = parseErrors.map((p) => ({ task: null, file: p.file, message: p.error }));
  const warnings = [];
  const err = (t, message) => errors.push({ task: t.data?.id ?? null, file: t.relFile, message });
  const warn = (t, message) => warnings.push({ task: t.data?.id ?? null, file: t.relFile, message });
  const byId = new Map();
  const titles = new Map();
  const limits = config.task_limits;

  for (const t of tasks) {
    const d = t.data;
    for (const e of validateSchema(schema, d)) err(t, `schema ${e}`);
    if (typeof d.id === "string") {
      if (!t.name.startsWith(d.id + "-") && t.name !== `${d.id}.md`) err(t, `file name must start with "${d.id}-"`);
      if (byId.has(d.id)) err(t, `duplicate task id ${d.id} (also in ${byId.get(d.id).relFile})`);
      else byId.set(d.id, t);
    }
    const missing = REQUIRED_SECTIONS.filter((s) => !headings(t.body).includes(s));
    if (missing.length) err(t, `missing body section(s): ${missing.map((s) => "## " + s).join(", ")}`);
    if (Number.isInteger(d.max_retries) && d.max_retries > config.retries.hard_cap) err(t, `max_retries ${d.max_retries} exceeds hard cap ${config.retries.hard_cap}`);
    if (Number.isInteger(d.attempts) && Number.isInteger(d.max_retries) && d.attempts > d.max_retries) err(t, `attempts (${d.attempts}) exceed max_retries (${d.max_retries})`);
    if (Array.isArray(d.depends_on) && d.depends_on.includes(d.id)) err(t, "task depends on itself");
    if (Array.isArray(d.files_allowed)) {
      if (d.files_allowed.length > limits.max_scope_globs) warn(t, `scope has ${d.files_allowed.length} globs (> ${limits.max_scope_globs}); consider splitting the task`);
      for (const g of d.files_allowed) if (BROAD_GLOBS.has(String(g).trim())) warn(t, `files_allowed "${g}" is repo-wide; tasks with unbounded scope cannot run in parallel and are hard to review`);
    }
    if (Array.isArray(d.acceptance) && d.acceptance.length > limits.max_acceptance) warn(t, `${d.acceptance.length} acceptance criteria (> ${limits.max_acceptance}); consider splitting`);
    const steps = countSteps(t.body);
    if (steps > limits.max_steps) warn(t, `${steps} steps (> ${limits.max_steps}); task may not fit one agent session — split it`);
    if (d.status === "blocked" && !d.blocked_reason) err(t, "status blocked requires blocked_reason");
    if (knownAgents && typeof d.agent === "string" && !knownAgents.has(d.agent)) err(t, `unknown agent "${d.agent}"`);
    if (knownSkills && Array.isArray(d.skills)) for (const s of d.skills) if (!knownSkills.has(s)) warn(t, `unknown skill "${s}"`);
    if (typeof d.title === "string") {
      const key = d.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (titles.has(key)) warn(t, `possible duplicate of ${titles.get(key)} (same title)`);
      else titles.set(key, d.id);
    }
  }

  // Dependency references and ordering.
  const deps = {};
  for (const t of tasks) {
    const d = t.data;
    if (typeof d.id !== "string") continue;
    deps[d.id] = Array.isArray(d.depends_on) ? d.depends_on : [];
    for (const dep of deps[d.id]) {
      if (!byId.has(dep)) err(t, `depends on missing task ${dep}`);
      else if (["in_progress", "review", "done"].includes(d.status) && byId.get(dep).data.status !== "done") {
        err(t, `status "${d.status}" but dependency ${dep} is "${byId.get(dep).data.status}"`);
      }
    }
  }
  const cycle = findCycle(deps);
  if (cycle) errors.push({ task: cycle[0], file: null, message: `dependency cycle: ${cycle.join(" -> ")}` });

  // Conflicting concurrent edits.
  const active = tasks.filter((t) => t.data.status === "in_progress" && Array.isArray(t.data.files_allowed));
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
    if (setsMayOverlap(active[i].data.files_allowed, active[j].data.files_allowed)) {
      err(active[j], `in_progress concurrently with ${active[i].data.id} and file scopes overlap`);
    }
  }
  return { tasks, errors, warnings };
}

function depsDone(task, byId) {
  return (task.data.depends_on ?? []).every((d) => byId.get(d)?.data.status === "done");
}

/**
 * Compute what can run now. Returns { batch, deferred, waiting, active }.
 * batch: ready tasks that can run in parallel right now (disjoint scopes,
 * no overlap with in_progress tasks, capped at max_parallel).
 */
export function computeBatches(root, { config = loadConfig(root), maxParallel } = {}) {
  const { tasks } = loadTasks(root, config);
  const byId = new Map(tasks.map((t) => [t.data.id, t]));
  const cap = Math.max(1, Number(maxParallel ?? config.concurrency.max_parallel) || 1);
  const active = tasks.filter((t) => t.data.status === "in_progress");
  const ready = tasks
    .filter((t) => t.data.status === "ready")
    .sort((a, b) => (PRIORITY_RANK[a.data.priority] ?? 2) - (PRIORITY_RANK[b.data.priority] ?? 2) || a.data.id.localeCompare(b.data.id));
  const batch = [];
  const deferred = [];
  const waiting = [];
  for (const t of ready) {
    if (!depsDone(t, byId)) {
      waiting.push({ id: t.data.id, waiting_on: (t.data.depends_on ?? []).filter((d) => byId.get(d)?.data.status !== "done") });
      continue;
    }
    const scope = t.data.files_allowed ?? ["**"];
    const clash = [...active, ...batch].find((o) => setsMayOverlap(scope, o.data.files_allowed ?? ["**"]));
    if (clash) deferred.push({ id: t.data.id, reason: `scope overlaps ${clash.data.id}` });
    else if (batch.length >= cap) deferred.push({ id: t.data.id, reason: `concurrency cap ${cap}` });
    else batch.push(t);
  }
  return {
    batch: batch.map((t) => ({ id: t.data.id, title: t.data.title, agent: t.data.agent, model_tier: t.data.model_tier ?? null, file: t.relFile })),
    deferred,
    waiting,
    active: active.map((t) => t.data.id),
  };
}

/**
 * Apply a lifecycle transition with all guards. Returns { ok, errors, from, to, task }.
 */
export function transition(root, id, to, { reason, humanApproved = false, config = loadConfig(root), dryRun = false } = {}) {
  const errors = [];
  if (!STATES.includes(to)) return { ok: false, errors: [`unknown state "${to}"`] };
  const { tasks, errors: setErrors } = validateTaskSet(root, { config });
  const task = tasks.find((t) => t.data.id === id);
  if (!task) return { ok: false, errors: [`task ${id} not found`] };
  const from = task.data.status;
  const byId = new Map(tasks.map((t) => [t.data.id, t]));
  const taskErrors = setErrors.filter((e) => e.task === id || (e.file === null && e.message.includes(id)));

  if (!(TRANSITIONS[from] ?? []).includes(to)) errors.push(`illegal transition ${from} -> ${to} (allowed: ${(TRANSITIONS[from] ?? []).join(", ") || "none, terminal state"})`);
  const updates = { status: to, updated: today() };

  if (to === "ready" && taskErrors.length) errors.push(...taskErrors.map((e) => `task invalid: ${e.message}`));
  if (to === "ready" && from === "failed") {
    if (!humanApproved) errors.push("reopening a failed task requires --human-approved (a person must review why it failed)");
    else updates.attempts = 0;
  }
  if (to === "in_progress") {
    if (!depsDone(task, byId)) errors.push(`dependencies not done: ${(task.data.depends_on ?? []).filter((d) => byId.get(d)?.data.status !== "done").join(", ")}`);
    const clash = tasks.find((o) => o !== task && o.data.status === "in_progress" && setsMayOverlap(task.data.files_allowed ?? ["**"], o.data.files_allowed ?? ["**"]));
    if (clash) errors.push(`file scope overlaps in_progress task ${clash.data.id}; wait or narrow scopes`);
    if (from === "review") {
      const next = (task.data.attempts ?? 0) + 1;
      if (next > (task.data.max_retries ?? config.retries.default_max)) {
        errors.push(`retry budget exhausted (${task.data.attempts}/${task.data.max_retries}); transition to failed and escalate to a human`);
      } else updates.attempts = next;
    }
  }
  if (to === "blocked" || to === "failed") {
    if (!reason) errors.push(`transition to ${to} requires --reason`);
    else updates.blocked_reason = reason;
  }
  if (to === "ready" && from === "blocked") updates.blocked_reason = null;
  if (to === "review" || to === "done") {
    const h = validateHandoffForTask(root, task, { config });
    if (!h.exists) errors.push(`handoff missing: ${rel(root, handoffPath(root, id, config))}`);
    errors.push(...h.errors.map((e) => `handoff: ${e}`));
    if (h.exists && h.data && !["done", "done_with_concerns"].includes(h.data.status)) errors.push(`handoff status is "${h.data.status}"; only done/done_with_concerns can enter ${to}`);
  }
  if (to === "done") {
    const gate = evaluateGate(root, task, { config });
    if (!gate.pass) errors.push(...gate.reasons.map((r) => `gate: ${r}`));
  }

  if (errors.length) {
    appendEvent(root, { type: "transition_rejected", task: id, from, to, errors }, config);
    return { ok: false, errors, from, to };
  }
  if (!dryRun) {
    writeFileSync(task.file, setFrontmatterScalars(task.text, updates));
    appendEvent(root, { type: "transition", task: id, from, to, agent: task.data.agent, attempts: updates.attempts ?? task.data.attempts ?? 0, reason: reason ?? null }, config);
  }
  return { ok: true, errors: [], from, to };
}

export function nextTaskId(root, config = loadConfig(root)) {
  const { tasks } = loadTasks(root, config);
  const dir = frameworkPaths(root, config).tasks;
  const names = existsSync(dir) ? readdirSync(dir) : [];
  const nums = [...tasks.map((t) => t.data.id), ...names.map((n) => basename(n))]
    .map((s) => /^TASK-(\d+)/.exec(String(s))?.[1]).filter(Boolean).map(Number);
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `TASK-${String(n).padStart(3, "0")}`;
}

export function statusSummary(root, config = loadConfig(root)) {
  const { tasks } = loadTasks(root, config);
  const counts = Object.fromEntries(STATES.map((s) => [s, 0]));
  for (const t of tasks) if (counts[t.data.status] !== undefined) counts[t.data.status]++;
  return {
    total: tasks.length,
    counts,
    tasks: tasks.map((t) => ({ id: t.data.id, status: t.data.status, agent: t.data.agent, title: t.data.title, attempts: t.data.attempts ?? 0, max_retries: t.data.max_retries, blocked_reason: t.data.blocked_reason ?? null })),
  };
}
