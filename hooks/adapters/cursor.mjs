#!/usr/bin/env node
// Cursor hook adapter (experimental). Translates Cursor hook payloads into
// the Claude-style payloads the framework guards understand, runs the
// unchanged guard script, and translates its answer back.
//   node hooks/adapters/cursor.mjs <shell|pre-edit|post-edit|session>
// shell      beforeShellExecution -> guard-bash.mjs
// pre-edit   preToolUse (Write|Delete) -> guard-paths.mjs
// post-edit  postToolUse (Write) -> validate-artifact.mjs
// session    sessionStart -> session-status.mjs
// Cursor treats invalid JSON from a permission hook as a block, so every
// failure path here answers "allow" (fail open, like the Claude hooks).
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readInput } from "../lib/common.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const GUARDS = {
  shell: "guard-bash.mjs",
  "pre-edit": "guard-paths.mjs",
  "post-edit": "validate-artifact.mjs",
  session: "session-status.mjs",
};

function cwdOf(input) {
  return input.cwd ?? input.workspace_roots?.[0] ?? process.cwd();
}

function editedPath(input) {
  const ti = input.tool_input ?? {};
  return ti.file_path ?? ti.path ?? ti.target_file ?? input.file_path ?? null;
}

/** Cursor payload -> Claude-style payload (null = nothing to check). */
export function toClaude(kind, input) {
  const cwd = cwdOf(input);
  switch (kind) {
    case "shell":
      return input.command ? { tool_name: "Bash", tool_input: { command: input.command }, cwd } : null;
    case "pre-edit":
    case "post-edit": {
      const file_path = editedPath(input);
      return file_path ? { tool_name: "Write", tool_input: { file_path }, cwd } : null;
    }
    case "session":
      return { cwd };
    default:
      return null;
  }
}

/** Claude-style guard output -> Cursor hook output. */
export function fromClaude(kind, out) {
  const h = out?.hookSpecificOutput ?? {};
  switch (kind) {
    case "shell": {
      const reason = h.permissionDecisionReason;
      if (h.permissionDecision === "deny" || h.permissionDecision === "ask") {
        return { permission: h.permissionDecision, user_message: reason, agent_message: reason };
      }
      return { permission: "allow" };
    }
    case "pre-edit": {
      const reason = h.permissionDecisionReason;
      // preToolUse cannot ask, so an edit that needs human approval is denied
      // and the reason tells the agent to hand it to a human.
      if (h.permissionDecision === "deny" || h.permissionDecision === "ask") {
        return { permission: "deny", user_message: reason, agent_message: `${reason}; ask the user to make this edit.` };
      }
      return { permission: "allow" };
    }
    case "post-edit":
      return out?.decision === "block" && out.reason ? { additional_context: out.reason } : {};
    case "session":
      return h.additionalContext ? { additional_context: h.additionalContext.replace(/\/project-kickstarter:([a-z][a-z-]*)/g, "/cmd-$1") } : {};
    default:
      return {};
  }
}

const FAIL_OPEN = { shell: { permission: "allow" }, "pre-edit": { permission: "allow" } };

/** Run the guard for `kind` on a Cursor payload and return the Cursor output. */
export function handle(kind, input, { runner = defaultRunner } = {}) {
  const payload = toClaude(kind, input);
  if (!payload || !GUARDS[kind]) return FAIL_OPEN[kind] ?? {};
  try {
    return fromClaude(kind, runner(join(HERE, "..", GUARDS[kind]), payload));
  } catch {
    return FAIL_OPEN[kind] ?? {};
  }
}

function defaultRunner(script, payload) {
  const env = { ...process.env };
  if (!env.CLAUDE_PROJECT_DIR && env.CURSOR_PROJECT_DIR) env.CLAUDE_PROJECT_DIR = env.CURSOR_PROJECT_DIR;
  const res = spawnSync(process.execPath, [script], { input: JSON.stringify(payload), encoding: "utf8", env, timeout: 20000 });
  const line = (res.stdout ?? "").split("\n").find((l) => l.trim().startsWith("{"));
  return line ? JSON.parse(line) : {};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const kind = process.argv[2];
  const input = await readInput();
  process.stdout.write(JSON.stringify(handle(kind, input)) + "\n");
  process.exit(0);
}
