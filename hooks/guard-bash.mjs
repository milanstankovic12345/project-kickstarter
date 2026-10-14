#!/usr/bin/env node
// PreToolUse(Bash): deny catastrophic commands, ask a human for risky ones,
// and keep read-only agents (reviewers, auditors, orchestrator) from
// modifying the working tree. Opt-in: no-op unless the project has
// .claude/agent-framework.json.
import { readInput, frameworkRoot, agentAccess, READ_ONLY_ACCESS, emitPreToolUse } from "./lib/common.mjs";
import { classify } from "./lib/bash-rules.mjs";

const input = await readInput();
if (input.tool_name && input.tool_name !== "Bash") process.exit(0);
if (!frameworkRoot(input)) process.exit(0);

const access = agentAccess(input.agent_type);
const subagent = Boolean(input.agent_type);
const readOnly = READ_ONLY_ACCESS.has(access) || access === "orchestrate";
const { decision, reason } = classify(input.tool_input?.command, { readOnly, subagent, canSaveReviews: !subagent || READ_ONLY_ACCESS.has(access), access });
if (decision === "deny") {
  emitPreToolUse("deny", `project-kickstarter guard: blocked (${reason}). If this is truly intended, a human should run it manually.`);
} else if (decision === "ask") {
  emitPreToolUse("ask", `project-kickstarter guard: ${reason} — requires explicit human approval.`);
}
process.exit(0);
