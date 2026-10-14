#!/usr/bin/env node
// SessionStart: inject a <=10-line framework status so a new session can
// resume without the previous conversation. Opt-in.
import { existsSync, readFileSync } from "node:fs";
import { readInput, frameworkRoot, emit } from "./lib/common.mjs";
import { loadConfig, frameworkPaths } from "../scripts/lib/project.mjs";
import { statusSummary, validateTaskSet } from "../scripts/lib/tasks.mjs";

const input = await readInput();
const root = frameworkRoot(input);
if (!root) process.exit(0);

try {
  const config = loadConfig(root);
  const s = statusSummary(root, config);
  const counts = Object.entries(s.counts).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ") || "none";
  const v = validateTaskSet(root, { config });
  const lines = [
    `project-kickstarter framework is active in this project. Tasks: ${s.total} (${counts}).`,
  ];
  const blocked = s.tasks.filter((t) => ["blocked", "failed"].includes(t.status)).slice(0, 3);
  for (const t of blocked) lines.push(`- ${t.id} ${t.status}: ${t.blocked_reason ?? t.title}`);
  const inProgress = s.tasks.filter((t) => t.status === "in_progress").map((t) => t.id);
  if (inProgress.length) lines.push(`- In progress from a previous session: ${inProgress.join(", ")} (orchestrator re-checks their handoffs first).`);
  if (v.errors.length) lines.push(`- Task validation errors: ${v.errors.length} (run tasks.mjs validate).`);
  const ledger = frameworkPaths(root, config).progress;
  if (existsSync(ledger)) {
    const last = readFileSync(ledger, "utf8").trim().split("\n").filter((l) => l.startsWith("- ")).pop();
    if (last) lines.push(`- Last progress: ${last.slice(2, 180)}`);
  }
  lines.push("Continue with /project-kickstarter:run-task, inspect with /project-kickstarter:status.");
  emit({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.slice(0, 10).join("\n") } });
} catch {
  // Never block session start.
}
process.exit(0);
