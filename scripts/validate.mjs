#!/usr/bin/env node
// Repository validator for the project-kickstarter plugin itself.
// `claude plugin validate` checks manifests; it does NOT check agent/skill
// frontmatter content (verified with Claude Code 2.1.300), so this script
// checks everything that the framework relies on:
//   manifests, YAML frontmatter (strict), names/IDs uniqueness, tool and
//   model values, registry <-> agent files <-> routing consistency, access
//   levels (least privilege), skill/command references and markdown links,
//   hooks.json shape and script paths, hook opt-in guards, JSON configs and
//   schemas, templates against schemas, protected-path coverage, hook
//   template sync, and (if present) the repo's own tasks.
//   node scripts/validate.mjs [--json]
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { PLUGIN_ROOT, readJson, loadSchema, parseArgs } from "./lib/project.mjs";
import { parseFrontmatter } from "./lib/frontmatter.mjs";
import { validate as validateSchema } from "./lib/schema.mjs";
import { loadRegistry, readAgents, readSkills } from "./lib/registry.mjs";
import { checkRouting, effectiveRouting, isAllowedModel } from "./lib/routing.mjs";
import { matchesAny } from "./lib/glob.mjs";
import { validateTaskSet } from "./lib/tasks.mjs";
import { renderTemplate, TEMPLATE_PATH } from "./sync-hook-template.mjs";

const args = parseArgs(process.argv.slice(2));
const R = PLUGIN_ROOT;
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
const relp = (p) => relative(R, p).replace(/\\/g, "/");

const KNOWN_TOOLS = new Set(["Agent", "Task", "Bash", "BashOutput", "KillShell", "Read", "Write", "Edit", "MultiEdit", "NotebookEdit", "NotebookRead", "Grep", "Glob", "LS", "WebFetch", "WebSearch", "TodoWrite", "Skill", "SlashCommand"]);
const HOOK_EVENTS = new Set(["SessionStart", "Setup", "UserPromptSubmit", "UserPromptExpansion", "PreToolUse", "PermissionRequest", "PermissionDenied", "PostToolUse", "PostToolUseFailure", "PostToolBatch", "Notification", "MessageDisplay", "SubagentStart", "SubagentStop", "TaskCreated", "TaskCompleted", "Stop", "StopFailure", "TeammateIdle", "InstructionsLoaded", "ConfigChange", "CwdChanged", "DirectoryAdded", "FileChanged", "WorktreeCreate", "WorktreeRemove", "PreCompact", "PostCompact", "PreModelSwitch", "PostModelSwitch", "Elicitation", "ElicitationResult", "SessionEnd"]);
const AGENT_FIELDS = new Set(["name", "description", "tools", "disallowedTools", "model", "permissionMode", "maxTurns", "autoCompactWindow", "skills", "mcpServers", "hooks", "memory", "background", "omitClaudeMd", "effort", "isolation", "color", "initialPrompt", "experimental"]);
const SKILL_FIELDS = new Set(["name", "description", "when_to_use", "argument-hint", "arguments", "disable-model-invocation", "user-invocable", "allowed-tools", "disallowed-tools", "model", "effort", "context", "agent", "background", "hooks", "paths", "shell", "metadata", "license", "compatibility"]);
const COLORS = new Set(["red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan"]);

function list(v) {
  if (v == null) return null;
  return (Array.isArray(v) ? v : String(v).split(",")).map((s) => String(s).trim().replace(/\(.*\)$/, "")).filter(Boolean);
}

function readFm(file) {
  try {
    const r = parseFrontmatter(readFileSync(file, "utf8"));
    if (!r.hasFrontmatter) { err(relp(file), "missing YAML frontmatter"); return null; }
    return r;
  } catch (e) {
    err(relp(file), `invalid frontmatter: ${e.message}`);
    return null;
  }
}

/** Check `<plugin-root>/…` and `${CLAUDE_PLUGIN_ROOT}/…` references and relative markdown links. */
function checkRefs(file, text) {
  for (const m of text.matchAll(/(?:<plugin-root>|\$\{CLAUDE_PLUGIN_ROOT\})\/([A-Za-z0-9_.\/-]+[A-Za-z0-9_-])/g)) {
    const target = m[1].replace(/\/$/, "");
    if (!existsSync(join(R, target))) err(relp(file), `references missing plugin path ${target}`);
  }
  for (const m of text.matchAll(/\]\((?!https?:|#|mailto:)([^)\s#]+)(#[^)]*)?\)/g)) {
    const target = resolve(dirname(file), decodeURIComponent(m[1]));
    if (!existsSync(target)) err(relp(file), `broken link ${m[1]}`);
  }
}

// ---- manifests -------------------------------------------------------------
const pluginJson = (() => { try { return readJson(join(R, ".claude-plugin/plugin.json")); } catch (e) { err(".claude-plugin/plugin.json", e.message); return {}; } })();
const marketplace = (() => { try { return readJson(join(R, ".claude-plugin/marketplace.json")); } catch (e) { err(".claude-plugin/marketplace.json", e.message); return {}; } })();
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(pluginJson.name ?? "")) err("plugin.json", "name must be kebab-case");
for (const k of ["version", "description", "author"]) if (!pluginJson[k]) warn("plugin.json", `missing ${k}`);
if (!marketplace.name || !marketplace.owner || !Array.isArray(marketplace.plugins)) err("marketplace.json", "requires name, owner and plugins[]");
for (const p of marketplace.plugins ?? []) {
  if (!p.name || !p.source) err("marketplace.json", "each plugin needs name and source");
  if (typeof p.source === "string" && !existsSync(join(R, p.source))) err("marketplace.json", `plugin source ${p.source} does not exist`);
  if (p.name === pluginJson.name && p.version && p.version !== pluginJson.version) err("marketplace.json", `version ${p.version} != plugin.json ${pluginJson.version}`);
}
try {
  const pkg = readJson(join(R, "package.json"));
  if (pkg.version !== pluginJson.version) err("package.json", `version ${pkg.version} != plugin.json ${pluginJson.version}`);
} catch { /* optional */ }

// ---- configs & schemas ----------------------------------------------------
const schemaDir = join(R, "schemas");
for (const f of readdirSync(schemaDir)) {
  try { const s = readJson(join(schemaDir, f)); if (!s.type && !s.$ref) err(`schemas/${f}`, "schema has no type"); } catch (e) { err(`schemas/${f}`, e.message); }
}
const registry = loadRegistry();
const routing = effectiveRouting(null);
for (const e of checkRouting(routing, registry)) err("config/model-routing.json", e);
const defaults = readJson(join(R, "config/defaults.json"));
for (const e of validateSchema(loadSchema("framework-config"), defaults)) err("config/defaults.json", e);
for (const [kind, agent] of Object.entries(defaults.review_agents ?? {})) if (!registry.agents[agent]) err("config/defaults.json", `review_agents.${kind} -> unknown agent ${agent}`);
const cmap = readJson(join(R, "config/capability-map.json"));
const ruleIds = new Set();
for (const r of [...cmap.agent_rules, ...cmap.specialist_rules, ...cmap.gap_rules]) {
  if (ruleIds.has(r.id)) err("config/capability-map.json", `duplicate rule id ${r.id}`);
  ruleIds.add(r.id);
}
for (const r of cmap.agent_rules) for (const a of r.enable) if (!registry.agents[a]) err("config/capability-map.json", `rule ${r.id} enables unknown agent ${a}`);
for (const g of cmap.gap_rules) {
  if (!registry.agents[g.agent]) err("config/capability-map.json", `gap ${g.id} assigns unknown agent ${g.agent}`);
  if (!g.validation_key && !g.validation_cmd) err("config/capability-map.json", `gap ${g.id} has no validation`);
}
for (const s of cmap.specialist_rules) {
  if (registry.agents[s.name]) err("config/capability-map.json", `specialist ${s.name} collides with a framework agent`);
  if (!routing.tiers[s.tier]) err("config/capability-map.json", `specialist ${s.name} has unknown tier ${s.tier}`);
}
for (const [from, to] of Object.entries(cmap.equivalents ?? {})) if (!registry.agents[to]) err("config/capability-map.json", `equivalent ${from} -> unknown agent ${to}`);
const protectedPaths = readJson(join(R, "config/protected-paths.json"));
for (const must of ["config/protected-paths.json", "config/model-routing.json", "config/agent-registry.json", "hooks/hooks.json", "hooks/guard-bash.mjs", "skills/security-review/SKILL.md", "skills/handoff-protocol/SKILL.md", "project-context/risk-acceptances.md", ".claude/settings.json"]) {
  if (!protectedPaths.ask.some((r) => matchesAny(must, [r.glob]) || matchesAny(`x/${must}`, [r.glob]))) err("config/protected-paths.json", `security-critical path ${must} is not protected`);
}

// ---- agents ----------------------------------------------------------------
const agents = readAgents(join(R, "agents"));
const agentNames = new Set();
for (const a of agents) {
  const where = relp(a.file);
  if (a.error) { err(where, `invalid frontmatter: ${a.error}`); continue; }
  const d = a.data;
  const base = a.file.replace(/\\/g, "/").split("/").pop().replace(/\.md$/, "");
  if (d.name !== base) err(where, `name "${d.name}" must equal file name "${base}"`);
  if (agentNames.has(d.name)) err(where, `duplicate agent name ${d.name}`);
  agentNames.add(d.name);
  if (!d.description || String(d.description).length < 20) err(where, "description missing or too short");
  if (String(d.description ?? "").length > 400) warn(where, "description over 400 chars costs context in every session");
  for (const k of Object.keys(d)) if (!AGENT_FIELDS.has(k)) err(where, `unknown frontmatter field "${k}"`);
  for (const k of ["hooks", "mcpServers", "permissionMode"]) if (k in d) err(where, `"${k}" is ignored for plugin agents; enforce via tools/disallowedTools or plugin hooks`);
  if (!isAllowedModel(d.model)) err(where, `model "${d.model}" not allowed`);
  if (d.color && !COLORS.has(d.color)) err(where, `color "${d.color}" not supported`);
  const tools = list(d.tools);
  const disallowed = list(d.disallowedTools) ?? [];
  for (const t of [...(tools ?? []), ...disallowed]) if (!KNOWN_TOOLS.has(t) && !t.startsWith("mcp__")) err(where, `unknown tool "${t}"`);
  const meta = registry.agents[d.name];
  if (!meta) { err(where, "agent not in config/agent-registry.json"); continue; }
  const level = registry.access_levels[meta.access];
  const has = (t) => (tools ? tools.includes(t) : true) && !disallowed.includes(t);
  for (const t of level.must_include) if (!has(t)) err(where, `access "${meta.access}" requires tool ${t}`);
  for (const t of level.must_exclude) if (has(t)) err(where, `access "${meta.access}" must not have tool ${t} (least privilege)`);
  if (has("Agent") && meta.access !== "orchestrate") err(where, "only the orchestrator may delegate (Agent tool)");
  if (meta.access !== "orchestrate" && !/handoff-protocol/.test(a.body)) err(where, "worker agents must reference the handoff protocol");
  for (const section of ["## Activation", "## Inputs", "## Outputs", "## Procedure", "## Acceptance criteria", "## Blockers and failure"]) if (!a.body.includes(section)) err(where, `missing section "${section}"`);
  checkRefs(a.file, a.body);
}
for (const name of Object.keys(registry.agents)) if (!agentNames.has(name)) err("config/agent-registry.json", `agent ${name} has no agents/${name}.md`);

// ---- skills ----------------------------------------------------------------
const skills = readSkills(join(R, "skills"));
const skillNames = new Set();
for (const s of skills) {
  const where = relp(s.file);
  if (s.error) { err(where, `invalid frontmatter: ${s.error}`); continue; }
  const d = s.data;
  if (d.name !== s.folder) err(where, `name "${d.name}" must equal folder "${s.folder}"`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.name ?? "")) err(where, "skill name must be lowercase kebab-case");
  if (skillNames.has(d.name)) err(where, `duplicate skill ${d.name}`);
  skillNames.add(d.name);
  const descLen = String(d.description ?? "").length + String(d.when_to_use ?? "").length;
  if (!d.description) err(where, "description required");
  if (descLen > 1536) err(where, `description+when_to_use is ${descLen} chars (> 1536 truncation limit)`);
  for (const k of Object.keys(d)) if (!SKILL_FIELDS.has(k)) warn(where, `unrecognized frontmatter field "${k}" (ignored by Claude Code)`);
  const lines = s.body.split("\n").length;
  if (lines > 500) warn(where, `SKILL.md body is ${lines} lines (> 500); move detail to references/`);
  checkRefs(s.file, s.body);
  const refDir = join(s.dir, "references");
  if (existsSync(refDir)) for (const f of readdirSync(refDir)) {
    const p = join(refDir, f);
    checkRefs(p, readFileSync(p, "utf8"));
    if (!s.body.includes(`references/${f}`)) warn(where, `reference ${f} is never linked from SKILL.md (dead weight?)`);
  }
}

// ---- commands --------------------------------------------------------------
const cmdDir = join(R, "commands");
const commandNames = new Set();
if (existsSync(cmdDir)) for (const f of readdirSync(cmdDir).filter((n) => n.endsWith(".md"))) {
  const file = join(cmdDir, f);
  const fm = readFm(file);
  if (!fm) continue;
  const name = f.replace(/\.md$/, "");
  commandNames.add(name);
  if (!fm.data.description) err(relp(file), "description required");
  if (skillNames.has(name)) err(relp(file), `command name collides with skill ${name}`);
  for (const m of fm.body.matchAll(/project-kickstarter:([a-z0-9-]+)/g)) {
    if (!skillNames.has(m[1]) && !agentNames.has(m[1]) && !commandNames.has(m[1]) && !existsSync(join(cmdDir, `${m[1]}.md`))) err(relp(file), `references unknown skill/agent/command project-kickstarter:${m[1]}`);
  }
  checkRefs(file, fm.body);
}
for (const s of skills) for (const m of s.body.matchAll(/\/project-kickstarter:([a-z0-9-]+)/g)) {
  if (!commandNames.has(m[1]) && !skillNames.has(m[1])) err(relp(s.file), `references unknown command /project-kickstarter:${m[1]}`);
}

// ---- hooks -----------------------------------------------------------------
const hooksPath = join(R, "hooks/hooks.json");
if (existsSync(hooksPath)) {
  const hj = readJson(hooksPath);
  if (!hj.hooks || typeof hj.hooks !== "object") err("hooks/hooks.json", 'must wrap events in a top-level "hooks" key');
  for (const [event, groups] of Object.entries(hj.hooks ?? {})) {
    if (!HOOK_EVENTS.has(event)) err("hooks/hooks.json", `unknown event ${event}`);
    for (const g of groups) for (const h of g.hooks ?? []) {
      if (!["command", "http", "mcp_tool", "prompt", "agent"].includes(h.type)) err("hooks/hooks.json", `${event}: unknown hook type ${h.type}`);
      const m = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)/.exec(h.command ?? "");
      if (h.type === "command" && !m) err("hooks/hooks.json", `${event}: command must reference a script under \${CLAUDE_PLUGIN_ROOT}`);
      if (m) {
        const script = join(R, m[1]);
        if (!existsSync(script)) err("hooks/hooks.json", `${event}: missing script ${m[1]}`);
        else if (!/frameworkRoot\(/.test(readFileSync(script, "utf8"))) err(m[1], "hook must be opt-in (call frameworkRoot and exit when the framework is not enabled)");
      }
    }
  }
}
try {
  if (readFileSync(TEMPLATE_PATH, "utf8").replace(/\r\n?/g, "\n") !== renderTemplate()) err(relp(TEMPLATE_PATH), "out of sync with hooks/lib/bash-rules.mjs (run node scripts/sync-hook-template.mjs)");
} catch (e) { err(relp(TEMPLATE_PATH), e.message); }

// ---- templates against schemas ----------------------------------------------
const fill = (t) => t.replace(/\{\{id\}\}/g, "TASK-001").replace(/\{\{agent\}\}/g, "implementer").replace(/\{\{kind\}\}/g, "code").replace(/\{\{reviewer\}\}/g, "code-reviewer")
  .replace(/\{\{title\}\}/g, "Template title").replace(/\{\{scope_glob\}\}/g, "src/**").replace(/\{\{validation_cmd\}\}/g, "npm test").replace(/\{\{acceptance_criterion\}\}/g, "criterion holds").replace(/\{\{date\}\}/g, "2026-10-14");
for (const [file, schema] of [["templates/task.md", "task"], ["templates/handoff.md", "handoff"], ["templates/review.md", "review"]]) {
  try {
    const { data } = parseFrontmatter(fill(readFileSync(join(R, file), "utf8")));
    for (const e of validateSchema(loadSchema(schema), data)) err(file, `template does not satisfy ${schema} schema: ${e}`);
  } catch (e) { err(file, e.message); }
}

// ---- docs links --------------------------------------------------------------
for (const f of ["README.md", ...(existsSync(join(R, "docs")) ? walkMd(join(R, "docs")) : [])]) {
  const p = f.startsWith(R) ? f : join(R, f);
  if (existsSync(p)) checkRefs(p, readFileSync(p, "utf8"));
}
function walkMd(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walkMd(p));
    else if (n.endsWith(".md")) out.push(p);
  }
  return out;
}

// ---- this repo's own (dogfood) tasks ----------------------------------------
if (existsSync(join(R, "tasks"))) {
  const t = validateTaskSet(R, {});
  for (const e of t.errors) err(e.file ?? "tasks", e.message);
}

const result = { errors, warnings, counts: { agents: agents.length, skills: skills.length, commands: commandNames.size } };
if (args.flags.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
else {
  process.stdout.write([
    ...errors.map((e) => `ERROR ${e}`),
    ...warnings.map((w) => `WARN  ${w}`),
    `${errors.length ? "FAILED" : "OK"}: ${agents.length} agents, ${skills.length} skills, ${commandNames.size} commands checked; ${errors.length} error(s), ${warnings.length} warning(s)`,
  ].join("\n") + "\n");
}
process.exitCode = errors.length ? 1 : 0;
