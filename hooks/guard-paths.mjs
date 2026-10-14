#!/usr/bin/env node
// PreToolUse(Edit|Write|MultiEdit|NotebookEdit): protect secrets, security
// policy, permissions, hooks and risk acceptances (ask a human); keep
// subagents inside the project, inside in-progress task scopes, and away
// from task-state files. Opt-in via .claude/agent-framework.json.
import { relative, resolve, isAbsolute } from "node:path";
import { readInput, frameworkRoot, agentAccess, shortAgent, READ_ONLY_ACCESS, emitPreToolUse } from "./lib/common.mjs";
import { matchesAny as matchGlob, CASE_INSENSITIVE_FS } from "../scripts/lib/glob.mjs";
// Policy matching follows the file system: case-insensitive on Windows/macOS.
const matchesAny = (p, globs) => matchGlob(p, globs, { nocase: CASE_INSENSITIVE_FS });
import { readJson, pluginFile, loadConfig } from "../scripts/lib/project.mjs";
import { loadTasks } from "../scripts/lib/tasks.mjs";

const input = await readInput();
const root = frameworkRoot(input);
if (!root) process.exit(0);

const raw = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
if (!raw) process.exit(0);
const abs = isAbsolute(raw) ? raw : resolve(input.cwd ?? root, raw);
const relPath = relative(root, abs).replace(/\\/g, "/");
const outside = relPath.startsWith("..") || isAbsolute(relPath);
const agent = shortAgent(input.agent_type);
const access = agentAccess(input.agent_type);

function decide(decision, reason) {
  emitPreToolUse(decision, `project-kickstarter guard: ${reason}`);
  process.exit(0);
}

try {
  const policy = readJson(pluginFile("config", "protected-paths.json"));

  if (agent) {
    if (outside) decide("deny", `subagent ${agent} may not write outside the project (${raw})`);
    if (READ_ONLY_ACCESS.has(access) || access === "orchestrate") decide("deny", `${agent} is a read-only/orchestrating agent and must not edit files (${relPath})`);
    for (const rule of policy.subagent_deny) {
      if (matchesAny(relPath, [rule.glob]) && !rule.agents_allowed.includes(agent)) decide("deny", `${relPath}: ${rule.reason}`);
    }
  }

  if (!outside) {
    for (const rule of policy.ask) {
      if (matchesAny(relPath, [rule.glob]) && !matchesAny(relPath, rule.except ?? [])) decide("ask", `${relPath} is protected (${rule.reason}); a human must approve this edit`);
    }
  }

  // Scope enforcement for implementing subagents: must stay within the union
  // of in-progress task scopes (plus their own report files).
  if (agent && access === "write" && !outside) {
    const config = loadConfig(root);
    const active = loadTasks(root, config).tasks.filter((t) => t.data.status === "in_progress");
    if (active.length) {
      const allowed = [...active.flatMap((t) => t.data.files_allowed ?? []), `${config.paths.handoffs}/**`, `${config.paths.reviews}/**`];
      const excluded = active.flatMap((t) => t.data.files_excluded ?? []);
      if (!matchesAny(relPath, allowed) || matchesAny(relPath, excluded)) {
        decide("ask", `${relPath} is outside the files_allowed of the in-progress task(s) ${active.map((t) => t.data.id).join(", ")}; widening scope needs human approval`);
      }
    }
  }
} catch {
  // Fail open on internal errors; guard-bash and permissions still apply.
}
process.exit(0);
