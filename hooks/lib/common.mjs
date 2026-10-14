// Shared hook utilities. Hooks must be fast, never throw, and fail open on
// malformed input (a broken hook must not brick the session) — except where
// a rule explicitly decides to deny or ask.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { findProjectRoot, PROJECT_CONFIG_REL, readJson, pluginFile } from "../../scripts/lib/project.mjs";

export async function readInput() {
  try {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Project root for this hook invocation, or null when the framework is not enabled (opt-in). */
export function frameworkRoot(input) {
  const start = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const root = findProjectRoot(resolve(start));
  return existsSync(join(root, PROJECT_CONFIG_REL)) ? root : null;
}

export function shortAgent(agentType) {
  if (!agentType || typeof agentType !== "string") return null;
  return agentType.split(":").pop();
}

let registryCache;
export function agentAccess(agentType) {
  const name = shortAgent(agentType);
  if (!name) return null; // main thread
  try {
    registryCache ??= readJson(pluginFile("config", "agent-registry.json"));
    return registryCache.agents[name]?.access ?? "write"; // project specialists default to write
  } catch {
    return "write";
  }
}

export const READ_ONLY_ACCESS = new Set(["review", "audit"]);

export function emitPreToolUse(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: reason },
  }) + "\n");
}

export function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
