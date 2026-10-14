// Quality gate: independent reviews must exist and Critical/High findings
// must be fixed+verified or accepted by a human (risk-acceptances file).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { validate as validateSchema } from "./schema.mjs";
import { loadSchema, loadConfig, frameworkPaths } from "./project.mjs";
import { matchesAny, staticPrefix } from "./glob.mjs";

/** Agent identity ignoring plugin namespace, case and whitespace ("pk:Backend-Dev" == "backend-dev"). */
export function sameAgent(a, b) {
  const n = (x) => String(x ?? "").split(":").pop().trim().toLowerCase();
  return n(a) !== "" && n(a) === n(b);
}

export function reviewPath(root, id, kind, config = loadConfig(root)) {
  return join(frameworkPaths(root, config).reviews, `${id}-${kind}.md`);
}

/**
 * Parse risk acceptances:
 *   ## RA-001
 *   - task: TASK-003
 *   - finding: SEC-2
 *   - approved_by: Jane Doe
 *   - date: 2026-10-14
 *   - rationale: ...
 *   - expires: 2027-01-01   (optional)
 */
export function parseRiskAcceptances(text) {
  const out = new Map();
  const normalized = text.replace(/\r\n?/g, "\n");
  const sections = normalized.split(/^##\s+/m).slice(1);
  for (const s of sections) {
    const [head, ...rest] = s.split("\n");
    const id = head.trim().split(/\s+/)[0];
    if (!/^RA-\d{3,}$/.test(id)) continue;
    const fields = {};
    for (const line of rest) {
      const m = /^\s*[-*]\s*([a-z_]+)\s*:\s*(.+?)\s*$/.exec(line);
      if (m) fields[m[1]] = m[2];
    }
    out.set(id, fields);
  }
  return out;
}

export function loadRiskAcceptances(root, config = loadConfig(root)) {
  const p = frameworkPaths(root, config).riskAcceptances;
  return existsSync(p) ? parseRiskAcceptances(readFileSync(p, "utf8")) : new Map();
}

function acceptanceProblem(ra, taskId, findingId, todayStr) {
  if (!ra) return "acceptance_ref not found in risk acceptances";
  if (ra.task !== taskId) return `acceptance is for ${ra.task}, not ${taskId}`;
  if (ra.finding !== findingId) return `acceptance is for finding ${ra.finding}, not ${findingId}`;
  if (!ra.approved_by || /\b(agent|claude|bot|automated|ai|assistant|llm)\b/i.test(ra.approved_by) || /^[a-z0-9]+(-[a-z0-9]+)+$/.test(ra.approved_by.trim())) return "acceptance must be approved_by a named human";
  if (!ra.rationale) return "acceptance needs a rationale";
  if (ra.expires && ra.expires < todayStr) return `acceptance expired on ${ra.expires}`;
  return null;
}

/**
 * Evaluate the gate for a loaded task. Returns
 * { pass, required: [...kinds], reasons: [...], reviews: {kind: {verdict, open: n}} }.
 */
export function evaluateGate(root, task, { config = loadConfig(root), requiredKinds, todayStr = new Date().toISOString().slice(0, 10) } = {}) {
  const kinds = requiredKinds ?? requiredReviewKinds(task, config);
  const reasons = [];
  const reviews = {};
  const schema = loadSchema("review");
  const blockSev = new Set(config.gates.block_severities);
  const acceptances = loadRiskAcceptances(root, config);
  const id = task.data.id;

  for (const kind of kinds) {
    const p = reviewPath(root, id, kind, config);
    if (!existsSync(p)) {
      reasons.push(`required ${kind} review missing (${kind} review file reports/reviews/${id}-${kind}.md)`);
      continue;
    }
    let parsed;
    try {
      parsed = parseFrontmatter(readFileSync(p, "utf8"));
    } catch (e) {
      reasons.push(`${kind} review unparseable: ${e.message}`);
      continue;
    }
    const r = parsed.data;
    const schemaErrors = validateSchema(schema, r);
    if (schemaErrors.length) {
      reasons.push(...schemaErrors.map((e) => `${kind} review schema ${e}`));
      continue;
    }
    if (r.task !== id) reasons.push(`${kind} review is for ${r.task}, not ${id}`);
    if (r.kind !== kind) reasons.push(`${kind} review file declares kind "${r.kind}"`);
    if (sameAgent(r.reviewer, task.data.agent)) reasons.push(`${kind} review was performed by the implementing agent (${r.reviewer}); reviews must be independent`);
    let blocking = 0;
    for (const f of r.findings) {
      if (!blockSev.has(f.severity)) continue;
      if (f.status === "open") { blocking++; reasons.push(`${kind} ${f.severity} finding ${f.id} is open: ${f.title}`); }
      else if (f.status === "wont_fix") { blocking++; reasons.push(`${kind} ${f.severity} finding ${f.id} marked wont_fix; ${f.severity} findings must be fixed or accepted by a human`); }
      else if (f.status === "fixed" && config.gates.require_verified_fix && f.verified !== true) { blocking++; reasons.push(`${kind} ${f.severity} finding ${f.id} fixed but not re-verified by the reviewer (verified: true)`); }
      else if (f.status === "accepted") {
        const problem = f.acceptance_ref ? acceptanceProblem(acceptances.get(f.acceptance_ref), id, f.id, todayStr) : "accepted without acceptance_ref";
        if (problem) { blocking++; reasons.push(`${kind} ${f.severity} finding ${f.id}: ${problem}`); }
      }
    }
    if (r.verdict === "block" && blocking === 0) reasons.push(`${kind} review verdict is "block"; reviewer must re-review and change the verdict`);
    reviews[kind] = { verdict: r.verdict, blocking, findings: r.findings.length };
  }
  return { pass: reasons.length === 0, required: kinds, reasons, reviews };
}

const BROAD_GLOBS = new Set(["**", "**/*", "*", ".", "./", "/"]);
// Top-level directories that hold no executable application code.
const NON_CODE_DIRS = new Set(["docs", "doc", "documentation", "assets", "images", "img", "public", "static", "design", "project-context", "reports", "tasks"]);

/**
 * A task scope is security-sensitive when (a) any scope glob, read as a
 * path, matches a sensitive glob (e.g. "src/auth/**" vs "**\/auth/**"), or
 * (b) the scope is broad — repo-wide or a top-level "dir/**" — because it
 * could reach sensitive code. Broad scopes err towards requiring review.
 */
export function touchesSensitive(scope, sensitive) {
  return scope.some((g) => {
    const p = String(g).replace(/\\/g, "/").trim();
    if (BROAD_GLOBS.has(p)) return true;
    const top = /^([^/*?{]+)\/\*\*(\/\*)?$/.exec(p); // e.g. "src/**"
    if (top && !NON_CODE_DIRS.has(top[1].toLowerCase())) return true;
    // Also test the literal directory prefix ("src/login/**" -> "src/login")
    // so directory-named patterns like "**/login*" apply to whole folders.
    const prefix = staticPrefix(p).replace(/\/+$/, "");
    return matchesAny(p, sensitive) || (prefix !== "" && matchesAny(prefix, sensitive));
  });
}

/** Review kinds a task must pass: config defaults + task.review + security on sensitive scope. */
export function requiredReviewKinds(task, config) {
  const kinds = new Set([...(config.gates.required_reviews ?? []), ...(task.data.review ?? [])]);
  if (config.gates.security_review_on_sensitive_paths && touchesSensitive(task.data.files_allowed ?? [], config.security_sensitive_paths ?? [])) {
    kinds.add("security");
  }
  return [...kinds].sort();
}
