// Agent/skill registry: what exists in the plugin and in a project.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { pluginFile, readJson, loadConfig } from "./project.mjs";

export function loadRegistry() {
  return readJson(pluginFile("config", "agent-registry.json"));
}

export function loadRouting() {
  return readJson(pluginFile("config", "model-routing.json"));
}

function listAgentFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith(".md")).map((n) => join(dir, n));
}

/** Read agent definitions (frontmatter) from a directory. */
export function readAgents(dir) {
  const out = [];
  for (const file of listAgentFiles(dir)) {
    try {
      const { data, body } = parseFrontmatter(readFileSync(file, "utf8"));
      out.push({ file, name: data.name, data, body });
    } catch (e) {
      out.push({ file, name: null, data: {}, body: "", error: e.message });
    }
  }
  return out;
}

export function readSkills(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const file = join(dir, name, "SKILL.md");
    if (!existsSync(file)) continue;
    try {
      const { data, body } = parseFrontmatter(readFileSync(file, "utf8"));
      out.push({ dir: join(dir, name), file, folder: name, name: data.name, data, body });
    } catch (e) {
      out.push({ dir: join(dir, name), file, folder: name, name: null, data: {}, body: "", error: e.message });
    }
  }
  return out;
}

/** Agent names a task may reference in a project. */
export function knownAgentNames(root) {
  const reg = loadRegistry();
  const ns = reg.plugin_namespace;
  const names = new Set();
  for (const n of Object.keys(reg.agents)) { names.add(n); names.add(`${ns}:${n}`); }
  for (const a of readAgents(join(root, ".claude", "agents"))) if (a.name) names.add(a.name);
  const config = loadConfig(root);
  for (const s of config.specialists ?? []) if (s?.name) names.add(s.name);
  return names;
}

export function knownSkillNames(root) {
  const reg = loadRegistry();
  const ns = reg.plugin_namespace;
  const names = new Set();
  for (const s of readSkills(pluginFile("skills"))) if (s.name) { names.add(s.name); names.add(`${ns}:${s.name}`); }
  for (const s of readSkills(join(root, ".claude", "skills"))) if (s.name) names.add(s.name);
  return names;
}

/** Map a task's agent name to the subagent_type to pass to the Agent tool. */
export function subagentType(agentName, root) {
  const reg = loadRegistry();
  if (agentName.includes(":")) return agentName;
  const alias = root ? loadConfig(root).agent_aliases?.[agentName] : undefined;
  if (alias) return alias; // existing project agent covering this role
  if (reg.agents[agentName]) {
    // Prefer a project-level override with the same name if one exists.
    const local = readAgents(join(root, ".claude", "agents")).find((a) => a.name === agentName);
    return local ? agentName : `${reg.plugin_namespace}:${agentName}`;
  }
  return agentName; // project specialist in .claude/agents/
}
