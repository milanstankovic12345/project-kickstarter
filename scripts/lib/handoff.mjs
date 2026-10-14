// Handoff contract validation (reports/handoffs/TASK-NNN.md).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { validate as validateSchema } from "./schema.mjs";
import { matchesAny, toPosix } from "./glob.mjs";
import { loadSchema, loadConfig, frameworkPaths } from "./project.mjs";

export function handoffPath(root, id, config = loadConfig(root)) {
  return join(frameworkPaths(root, config).handoffs, `${id}.md`);
}

function normCmd(c) {
  return String(c).trim().replace(/\s+/g, " ");
}

/** Paths an agent may always touch regardless of task scope (its own reports). */
function frameworkReportGlobs(config) {
  return [`${config.paths.handoffs}/**`, `${config.paths.reviews}/**`];
}

/**
 * Validate a handoff against its task. `task` is a loaded task ({ data }).
 * Returns { exists, data, errors, warnings }.
 */
export function validateHandoffForTask(root, task, { config = loadConfig(root), file } = {}) {
  const id = task.data.id;
  const path = file ?? handoffPath(root, id, config);
  const result = { exists: existsSync(path), data: null, errors: [], warnings: [] };
  if (!result.exists) return result;
  let parsed;
  try {
    parsed = parseFrontmatter(readFileSync(path, "utf8"));
  } catch (e) {
    result.errors.push(`unparseable frontmatter: ${e.message}`);
    return result;
  }
  if (!parsed.hasFrontmatter) {
    result.errors.push("missing YAML frontmatter");
    return result;
  }
  const h = parsed.data;
  result.data = h;
  result.errors.push(...validateSchema(loadSchema("handoff"), h).map((e) => `schema ${e}`));
  if (h.task !== id) result.errors.push(`handoff task "${h.task}" does not match ${id}`);

  // Scope: every modified file must be inside files_allowed and outside files_excluded.
  const allowed = [...(task.data.files_allowed ?? []), ...frameworkReportGlobs(config)];
  const excluded = task.data.files_excluded ?? [];
  for (const f of h.files_modified ?? []) {
    const p = toPosix(f);
    if (!matchesAny(p, allowed)) result.errors.push(`scope violation: "${p}" is outside files_allowed`);
    else if (matchesAny(p, excluded)) result.errors.push(`scope violation: "${p}" matches files_excluded`);
  }

  // Evidence: completion claims need executed commands with exit codes.
  const tests = Array.isArray(h.tests) ? h.tests : [];
  if (["done", "done_with_concerns"].includes(h.status)) {
    if (tests.length === 0) result.errors.push(`status "${h.status}" requires at least one executed test/validation command`);
    const failing = tests.filter((t) => t.exit_code !== 0);
    if (failing.length) result.errors.push(`status "${h.status}" but ${failing.length} command(s) exited non-zero: ${failing.map((t) => t.cmd).join("; ")}`);
    const ran = new Set(tests.map((t) => normCmd(t.cmd)));
    for (const v of task.data.validation ?? []) {
      if (!ran.has(normCmd(v.cmd))) result.errors.push(`validation command not run: "${v.cmd}"`);
    }
    if (h.status === "done_with_concerns" && !(h.risks?.length || h.unresolved?.length)) {
      result.errors.push("done_with_concerns must list the concerns under risks or unresolved");
    }
  }
  if (h.status === "blocked" && !h.blocker) result.errors.push('status "blocked" requires a "blocker" description');
  if (h.status === "failed" && !(h.unresolved?.length)) result.warnings.push('status "failed" should list what is unresolved');
  if (!/^##\s+/m.test(parsed.body)) result.warnings.push("handoff body has no sections; include details for the next session");
  return result;
}
