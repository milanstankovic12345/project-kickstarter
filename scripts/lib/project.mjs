// Shared project/plugin context: locating roots, loading merged config,
// resolving framework paths, appending metric events, CLI arg parsing.
import { existsSync, readFileSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PROJECT_CONFIG_REL = ".claude/agent-framework.json";
export const MANIFEST_REL = ".claude/agent-framework/manifest.json";

export function readJson(path) {
  const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in ${path}: ${e.message}`);
  }
}

export function pluginFile(...parts) {
  return join(PLUGIN_ROOT, ...parts);
}

export function loadSchema(name) {
  return readJson(pluginFile("schemas", `${name}.schema.json`));
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) return override === undefined ? base : override;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) out[k] = k in base ? deepMerge(base[k], v) : v;
  return out;
}

/** Walk up from `start` to find a directory containing the framework config or a .git dir. */
export function findProjectRoot(start = process.cwd()) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, PROJECT_CONFIG_REL)) || existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

export function isFrameworkEnabled(root) {
  return existsSync(join(root, PROJECT_CONFIG_REL));
}

/** Defaults from the plugin merged with the project's .claude/agent-framework.json. */
export function loadConfig(root) {
  const defaults = readJson(pluginFile("config", "defaults.json"));
  const projectPath = join(root, PROJECT_CONFIG_REL);
  const project = existsSync(projectPath) ? readJson(projectPath) : {};
  return deepMerge(defaults, project);
}

export function frameworkPaths(root, config = loadConfig(root)) {
  const p = config.paths;
  const abs = (rel) => join(root, rel);
  return {
    root,
    tasks: abs(p.tasks),
    handoffs: abs(p.handoffs),
    reviews: abs(p.reviews),
    metrics: abs(p.metrics),
    progress: abs(p.progress),
    profile: abs(p.profile),
    riskAcceptances: abs(p.risk_acceptances),
    improvements: abs(p.improvements),
  };
}

export function rel(root, path) {
  return relative(root, path).replace(/\\/g, "/");
}

export function appendEvent(root, event, config) {
  try {
    const paths = frameworkPaths(root, config);
    mkdirSync(dirname(paths.metrics), { recursive: true });
    appendFileSync(paths.metrics, JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n");
  } catch {
    // Metrics must never break a workflow.
  }
}

/** Parse argv into { _: positional[], flags: {} }. Supports --k v, --k=v, --flag. */
export function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) out.flags[a.slice(2, eq)] = a.slice(eq + 1);
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) out.flags[a.slice(2)] = argv[++i];
      else out.flags[a.slice(2)] = true;
    } else out._.push(a);
  }
  return out;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Print result as JSON (--json) or via a human formatter, and exit with code. */
export function finish(result, { json, human, code = 0 }) {
  if (json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  else if (human) process.stdout.write(human(result) + "\n");
  process.exitCode = code;
}
