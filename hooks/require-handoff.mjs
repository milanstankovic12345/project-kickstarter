#!/usr/bin/env node
// SubagentStop: framework agents must end with the standardized HANDOFF
// block so the orchestrator (and the next session) can continue without the
// conversation. Blocks once with instructions; never loops
// (stop_hook_active). Also records a metrics event. Opt-in.
import { readInput, frameworkRoot, shortAgent, emit } from "./lib/common.mjs";
import { readJson, pluginFile, loadConfig, appendEvent } from "../scripts/lib/project.mjs";

const input = await readInput();
const root = frameworkRoot(input);
if (!root) process.exit(0);
const agent = shortAgent(input.agent_type);
if (!agent) process.exit(0);

let isFramework = false;
try {
  const reg = readJson(pluginFile("config", "agent-registry.json"));
  const config = loadConfig(root);
  isFramework = Boolean(reg.agents[agent]) || (config.specialists ?? []).some((s) => s.name === agent);
} catch { /* not a framework agent */ }
if (!isFramework || agent === "orchestrator") process.exit(0);

const msg = String(input.last_assistant_message ?? "");
const hasHandoff = /^\s*HANDOFF\s*$/m.test(msg) && /^\s*status:\s*(done|done_with_concerns|blocked|failed)\b/m.test(msg);
appendEvent(root, { type: "subagent_stop", agent, has_handoff: hasHandoff, retry: Boolean(input.stop_hook_active) });

if (!hasHandoff && !input.stop_hook_active) {
  emit({
    decision: "block",
    reason: "End your work with the standardized HANDOFF block (see handoff-protocol skill):\nHANDOFF\ntask: TASK-NNN (or AUDIT-... / none)\nstatus: done | done_with_concerns | blocked | failed\nhandoff: <path of the saved handoff or review>\ntests: <n passed / n failed, or not run: reason>\nnext: <one line>\nIf you have not saved the handoff/review via scripts/reports.mjs yet, do that first.",
  });
}
process.exit(0);
