// Export the framework layer (agents, commands, runtime scripts, guards) to
// IDEs that are not Claude Code: Cursor, Codex and GitHub Copilot.
//
// Model: the scripts are IDE-independent, so they are vendored into the
// target project (.agent-framework/runtime) and every exported text points
// at that folder. Agents and commands become each IDE's native files.
// Output is deterministic, tracked in a manifest with content hashes, and
// customized files are never overwritten (a proposal is written instead).
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { pluginFile, readJson } from "./project.mjs";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.mjs";
import { loadRegistry, readAgents } from "./registry.mjs";

export const TARGETS = ["cursor", "codex", "copilot"];
export const RUNTIME_REL = ".agent-framework/runtime";
export const EXPORT_MANIFEST_REL = ".agent-framework/export-manifest.json";
export const GENERATOR = "project-kickstarter export-ide";
export const IDE_MARKERS = ["<!-- project-kickstarter:ide:start -->", "<!-- project-kickstarter:ide:end -->"];

const TARGET_META = {
  cursor: { label: "Cursor", agentRef: (n) => `/agent-${n}`, cmdRef: (c) => `/cmd-${c}` },
  codex: { label: "Codex", agentRef: (n) => `$agent-${n}`, cmdRef: (c) => `$cmd-${c}` },
  copilot: { label: "GitHub Copilot", agentRef: (n) => `the \`${n}\` agent`, cmdRef: (c) => `/${c}` },
};

// What is copied into the project. `to` is relative to the runtime folder.
const VENDOR = [
  { dir: "scripts", exclude: new Set(["validate.mjs", "run-tests.mjs", "sync-hook-template.mjs", "export-ide.mjs", "lib/export-ide.mjs"]) },
  { dir: "hooks", exclude: new Set(["hooks.json"]) },
  { dir: "config" },
  { dir: "schemas" },
  { dir: "templates" },
  { dir: "agents" },
  { dir: "skills", skipTop: new Set(["project-kickstarter"]) },
  { dir: "docs/architecture", to: "docs/architecture" },
  { dir: "docs/ide", to: "docs" },
];

// ------------------------------------------------------------------ helpers
export function sha(text) {
  return createHash("sha256").update(String(text).replace(/\r\n?/g, "\n")).digest("hex").slice(0, 16);
}

function listFiles(abs, base = abs) {
  const out = [];
  for (const name of readdirSync(abs).sort()) {
    const p = join(abs, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, base));
    else out.push(p.slice(base.length + 1).replace(/\\/g, "/"));
  }
  return out;
}

const BOM = new RegExp("^" + String.fromCharCode(0xfeff));
const norm = (t) => t.replace(BOM, "").replace(/\r\n?/g, "\n");
const firstSentence = (s, max = 110) => {
  const one = String(s ?? "").replace(/\s+/g, " ").trim();
  const cut = one.split(/(?<=\.)\s/)[0];
  return cut.length > max ? `${cut.slice(0, max - 1).trimEnd()}…` : cut;
};

/** Insert a blockquote right after the frontmatter (or at the top when there is none). */
function withNote(text, note) {
  const m = /^---\n[\s\S]*?\n---\n/.exec(text);
  const quoted = note.split("\n").map((l) => `> ${l}`.trimEnd()).join("\n");
  return m ? `${m[0]}\n${quoted}\n\n${text.slice(m[0].length).replace(/^\n+/, "")}` : `${quoted}\n\n${text.replace(/^\n+/, "")}`;
}

// ---------------------------------------------------------- text rewriting
/** Replace Claude Code specific references with ones that exist in `target`. */
export function rewrite(text, target) {
  const { cmdRef } = TARGET_META[target];
  return norm(text)
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, RUNTIME_REL)
    .replace(/<plugin-root>/g, RUNTIME_REL)
    .replace(/\/project-kickstarter:([a-z][a-z-]*)/g, (_, c) => cmdRef(c))
    .replace(/claude --agent [\w:-]+/g, "start a new chat as this role")
    .replace(/project-kickstarter:([a-z][a-z-]*)/g, "$1");
}

const SEQUENTIAL = `${RUNTIME_REL}/docs/sequential-mode.md`;
const DISPATCH_NOTE = (label) => [
  `**${label}:** this IDE does not give the framework isolated, parallel subagents.`,
  `Wherever the text below says to dispatch or call a subagent, take that role yourself, one at a time,`,
  `following \`${SEQUENTIAL}\`. Run reviews in a fresh chat so they stay independent.`,
].join("\n");

const ACCESS_NOTE = {
  orchestrate: "Controller role: select, run scripts and report. Never edit source files, write tests or review code yourself.",
  review: "Read-only role: never edit source files. Your only writes are review files saved through `reports.mjs save review`.",
  audit: "Read-only role: never edit source files. Your only writes are report files saved through `reports.mjs`.",
  analyze: "Analysis role: read and report. Do not change source files.",
  plan: "Planning role: write only task files in `tasks/`.",
  profile: "Profiling role: write only `project-context/`.",
  docs: "Design role: write only documentation and design artifacts, not application source.",
  write: "Implementation role: change only files inside the task's `files_allowed`.",
};

function roleNote(name, access, target) {
  const lines = [
    `**Role \`${name}\`** (access: ${access}). ${ACCESS_NOTE[access] ?? ""}`.trim(),
    `Framework scripts run as \`node ${RUNTIME_REL}/scripts/<script>.mjs\`.`,
  ];
  return lines.join("\n");
}

// ------------------------------------------------------------- source data
function readCommands() {
  const dir = pluginFile("commands");
  return readdirSync(dir).filter((n) => n.endsWith(".md")).sort().map((n) => {
    const { data, body } = parseFrontmatter(readFileSync(join(dir, n), "utf8"));
    return { name: n.slice(0, -3), data, body };
  });
}

function toolNames(tools) {
  if (Array.isArray(tools)) return tools.map(String);
  if (typeof tools === "string") return tools.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

const COPILOT_TOOLS = { Read: "read", NotebookRead: "read", Grep: "search", Glob: "search", Edit: "edit", MultiEdit: "edit", Write: "edit", NotebookEdit: "edit", Bash: "execute", Agent: "agent", WebFetch: "web", WebSearch: "web" };
export function copilotTools(tools) {
  return [...new Set(toolNames(tools).map((t) => COPILOT_TOOLS[t]).filter(Boolean))];
}

// -------------------------------------------------------- generated content
function overview(target, agents, commands) {
  const t = TARGET_META[target];
  return [
    "## Agent framework (project-kickstarter)",
    "",
    "Work in this project is task-driven. Tasks, handoffs and reviews are files; scripts enforce the rules (state machine, file scope, handoffs, review gate).",
    "",
    `**Set up once:** \`node ${RUNTIME_REL}/scripts/bootstrap.mjs apply\` creates \`.claude/agent-framework.json\` (the opt-in marker), the project profile and starter tasks.`,
    "",
    "**Commands**",
    "",
    ...commands.map((c) => `- ${t.cmdRef(c.name)}${c.data["argument-hint"] ? ` ${c.data["argument-hint"]}` : ""}: ${firstSentence(c.data.description)}`),
    "",
    `**Roles:** ${agents.map((a) => `\`${a.name}\``).join(", ")}. Invoke one with ${t.agentRef(agents[0].name)} (same pattern for the others). ${t.label} runs one role at a time; see \`${SEQUENTIAL}\`.`,
    "",
    "**Rules**",
    "",
    `- Change task state only with \`node ${RUNTIME_REL}/scripts/tasks.mjs transition\`; never edit a task's \`status\` by hand.`,
    `- Save handoffs and reviews only with \`node ${RUNTIME_REL}/scripts/reports.mjs save ...\`.`,
    "- Edit only files inside the active task's `files_allowed`. Stop with a blocked handoff if the scope must widen.",
    "- Reviewers never fix code. Implementers never review their own task. Review in a fresh chat.",
    "- Never read, print or commit secret files (`.env*`, keys, credentials).",
    `- Before committing run \`node ${RUNTIME_REL}/scripts/ci-check.mjs\`.`,
    "",
    "**Limits here:** no parallel batches and no automatic model routing" + (target === "cursor" ? "; guard hooks are experimental" : "; no guard hooks (enforcement is rules, the git pre-commit hook and CI)") + ".",
  ].join("\n");
}

function agentSkill(a, access, target) {
  const body = withNote(rewrite(a.body, target), DISPATCH_NOTE(TARGET_META[target].label));
  const fm = {
    name: `agent-${a.name}`,
    description: `${a.data.description} (Framework role "${a.name}"; invoke it explicitly.)`,
    "disable-model-invocation": true,
  };
  return serializeFrontmatter(fm, `# ${a.name.replace(/-/g, " ")}\n\n> ${roleNote(a.name, access, target).split("\n").join("\n> ")}\n\n${body}`);
}

function commandSkill(c, target) {
  const hint = c.data["argument-hint"];
  const fm = {
    name: `cmd-${c.name}`,
    description: `${c.data.description}${hint ? ` Arguments: ${hint}.` : ""}`,
    "disable-model-invocation": true,
  };
  return serializeFrontmatter(fm, commandBody(c, target));
}

function commandBody(c, target) {
  const text = rewrite(c.body, target).replace(/\$ARGUMENTS/g, "<arguments>");
  const note = `${DISPATCH_NOTE(TARGET_META[target].label)}\n\`<arguments>\` is the text typed after the command name (may be empty).`;
  return withNote(text, note);
}

function copilotAgent(a, access) {
  const tools = copilotTools(a.data.tools);
  const fm = { name: a.name, description: a.data.description };
  if (tools.length) fm.tools = tools;
  const body = withNote(rewrite(a.body, "copilot"), DISPATCH_NOTE(TARGET_META.copilot.label));
  return serializeFrontmatter(fm, `# ${a.name.replace(/-/g, " ")}\n\n> ${roleNote(a.name, access, "copilot").split("\n").join("\n> ")}\n\n${body}`);
}

function copilotPrompt(c) {
  const fm = { description: c.data.description, agent: "agent" };
  if (c.data["argument-hint"]) fm["argument-hint"] = c.data["argument-hint"];
  return serializeFrontmatter(fm, commandBody(c, "copilot"));
}

function cursorHooks() {
  const run = (kind) => `node ${RUNTIME_REL}/hooks/adapters/cursor.mjs ${kind}`;
  return JSON.stringify({
    version: 1,
    hooks: {
      sessionStart: [{ command: run("session"), timeout: 20 }],
      beforeShellExecution: [{ command: run("shell"), timeout: 20 }],
      preToolUse: [{ command: run("pre-edit"), matcher: "Write|Delete", timeout: 20 }],
      postToolUse: [{ command: run("post-edit"), matcher: "Write", timeout: 20 }],
    },
  }, null, 2) + "\n";
}

const CI_WORKFLOW = `name: agent-framework
on:
  push:
  pull_request:
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Validate tasks and re-check gates of done tasks
        run: node ${RUNTIME_REL}/scripts/ci-check.mjs
`;

// ------------------------------------------------------------ desired state
/** Everything an export writes, without touching the file system. */
export function buildDesired(target, { ci = true, hooks = true } = {}) {
  if (!TARGETS.includes(target)) throw new Error(`unknown target "${target}" (expected ${TARGETS.join(", ")})`);
  const registry = loadRegistry();
  const agents = readAgents(pluginFile("agents")).filter((a) => a.name && !a.error).sort((a, b) => a.name.localeCompare(b.name));
  const commands = readCommands();
  const accessOf = (n) => registry.agents[n]?.access ?? "write";
  const files = [];
  const add = (path, content, kind, extra = {}) => files.push({ path, content, kind, ...extra });

  // Runtime
  for (const v of VENDOR) {
    const abs = pluginFile(...v.dir.split("/"));
    for (const rel of listFiles(abs)) {
      if (v.exclude?.has(rel)) continue;
      if (v.skipTop?.has(rel.split("/")[0])) continue;
      const to = [RUNTIME_REL, v.to ?? v.dir, rel].filter(Boolean).join("/");
      let text = readFileSync(join(abs, ...rel.split("/")), "utf8");
      if (rel.endsWith(".md")) {
        text = rewrite(text, target);
        if (v.dir === "skills" && rel === "orchestration/SKILL.md") text = withNote(text, DISPATCH_NOTE(TARGET_META[target].label));
        if (v.dir === "agents" && rel === "orchestrator.md") text = withNote(text, DISPATCH_NOTE(TARGET_META[target].label));
      }
      add(to, text, "runtime");
    }
  }
  add(`${RUNTIME_REL}/.claude-plugin/plugin.json`, readFileSync(pluginFile(".claude-plugin", "plugin.json"), "utf8"), "runtime");

  const body = overview(target, agents, commands);
  if (target === "cursor") {
    add(".cursor/rules/agent-framework.mdc", serializeFrontmatter({ description: "Task-driven multi-agent framework: workflow, rules and role invocation", alwaysApply: true }, `\n${body}\n`), "rule");
  } else if (target === "codex") {
    add("AGENTS.md", body, "instructions", { section: IDE_MARKERS });
  } else {
    add(".github/copilot-instructions.md", body, "instructions", { section: IDE_MARKERS });
    add(".github/instructions/agent-framework-artifacts.instructions.md", serializeFrontmatter({
      description: "Rules for framework task, handoff, review and report files",
      applyTo: "tasks/**,reports/**,project-context/**",
    }, [
      "",
      "These files are produced and checked by scripts. Do not hand-edit them to force a state.",
      "",
      `- Change task state with \`node ${RUNTIME_REL}/scripts/tasks.mjs transition <ID> <state>\`.`,
      `- Save handoffs with \`node ${RUNTIME_REL}/scripts/reports.mjs save handoff <ID>\` and reviews with \`... save review <ID> <kind>\` (document on stdin).`,
      `- Validate with \`node ${RUNTIME_REL}/scripts/tasks.mjs validate\`.`,
      "",
    ].join("\n")), "instructions");
  }

  if (target === "cursor" || target === "codex") {
    for (const a of agents) add(`.agents/skills/agent-${a.name}/SKILL.md`, agentSkill(a, accessOf(a.name), target), "agent");
    for (const c of commands) add(`.agents/skills/cmd-${c.name}/SKILL.md`, commandSkill(c, target), "command");
  } else {
    for (const a of agents) add(`.github/agents/${a.name}.agent.md`, copilotAgent(a, accessOf(a.name)), "agent");
    for (const c of commands) add(`.github/prompts/${c.name}.prompt.md`, copilotPrompt(c), "command");
  }

  if (target === "cursor" && hooks) add(".cursor/hooks.json", cursorHooks(), "hooks");
  if (ci) add(".github/workflows/agent-framework.yml", CI_WORKFLOW, "ci");
  return files;
}

// -------------------------------------------------------------- diff + apply
function readManifest(root) {
  const p = join(root, EXPORT_MANIFEST_REL);
  if (!existsSync(p)) return { version: 1, files: {} };
  try { return readJson(p); } catch { return { version: 1, files: {}, corrupt: true }; }
}

function extractSection(text, m) {
  const s = text.indexOf(m[0]);
  const e = text.indexOf(m[1]);
  if (s === -1 || e === -1 || e < s) return null;
  return text.slice(s + m[0].length, e).replace(/^\n/, "").replace(/\n$/, "");
}
function replaceSection(text, m, content) {
  const s = text.indexOf(m[0]);
  const e = text.indexOf(m[1]);
  return `${text.slice(0, s)}${m[0]}\n${content}\n${text.slice(e)}`;
}

/** Pure: compute per-file actions (create | update | unchanged | conflict | stale). */
export function planExport(root, target, opts = {}) {
  const desired = buildDesired(target, opts);
  const manifest = readManifest(root);
  const read = (rel) => (existsSync(join(root, rel)) ? norm(readFileSync(join(root, rel), "utf8")) : null);
  const actions = [];

  for (const d of desired) {
    const entry = manifest.files[d.path];
    const current = read(d.path);
    const want = sha(d.content);
    const base = { path: d.path, kind: d.kind, hash: want, section: Boolean(d.section) };
    if (!d.section) {
      const content = norm(d.content);
      if (current === null) actions.push({ ...base, action: "create", content });
      else if (sha(current) === want) actions.push({ ...base, action: "unchanged" });
      else if (entry && entry.hash === sha(current)) actions.push({ ...base, action: "update", content });
      else actions.push({ ...base, action: "conflict", content, reason: entry ? "modified since it was exported (user customization)" : "file exists and was not created by the exporter" });
      continue;
    }
    const m = d.section;
    const body = norm(d.content);
    if (current === null) { actions.push({ ...base, action: "create", content: `${m[0]}\n${body}\n${m[1]}\n` }); continue; }
    const existing = extractSection(current, m);
    if (existing === null) { actions.push({ ...base, action: "update", content: `${current.replace(/\n*$/, "\n")}\n${m[0]}\n${body}\n${m[1]}\n`, reason: "append section" }); continue; }
    const cur = sha(existing);
    if (cur === want) actions.push({ ...base, action: "unchanged" });
    else if (entry && entry.hash === cur) actions.push({ ...base, action: "update", content: replaceSection(current, m, body) });
    else actions.push({ ...base, action: "conflict", content: replaceSection(current, m, body), reason: "generated section was edited by a user" });
  }
  const wanted = new Set(desired.map((d) => d.path));
  for (const p of Object.keys(manifest.files)) if (!wanted.has(p)) actions.push({ action: "stale", path: p, kind: manifest.files[p].kind, reason: "exported earlier, not produced by this target/options; left in place" });
  return { target, actions, manifest_corrupt: Boolean(manifest.corrupt) };
}

export function applyExport(root, target, { force = false, ...opts } = {}) {
  const p = planExport(root, target, opts);
  const manifest = readManifest(root);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const written = [];
  for (const a of p.actions) {
    if (a.action === "stale" || a.action === "unchanged") {
      if (a.action === "unchanged" && !manifest.files[a.path]) manifest.files[a.path] = { hash: a.hash, kind: a.kind, section: a.section };
      continue;
    }
    const abs = join(root, a.path);
    if (a.action === "conflict" && !force) {
      const proposal = `.agent-framework/proposed/${a.path}`;
      mkdirSync(dirname(join(root, proposal)), { recursive: true });
      writeFileSync(join(root, proposal), a.content);
      a.proposal = proposal;
      continue;
    }
    if (a.action === "conflict") {
      const backup = join(root, ".agent-framework/backup", `${a.path}.${stamp}`);
      mkdirSync(dirname(backup), { recursive: true });
      copyFileSync(abs, backup);
      a.backup = backup;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, a.content);
    manifest.files[a.path] = { hash: a.hash, kind: a.kind, section: a.section };
    written.push(a.path);
    a.applied = true;
  }
  manifest.version = 1;
  manifest.generator = GENERATOR;
  const text = JSON.stringify({ version: 1, generator: GENERATOR, files: Object.fromEntries(Object.entries(manifest.files).sort()) }, null, 2) + "\n";
  const mp = join(root, EXPORT_MANIFEST_REL);
  if (!existsSync(mp) || readFileSync(mp, "utf8") !== text) {
    mkdirSync(dirname(mp), { recursive: true });
    writeFileSync(mp, text);
  }
  return { ...p, written };
}
