#!/usr/bin/env node
// Quality gate CLI.
//   node scripts/gate.mjs check <TASK-ID> [--root dir] [--json]
// Exit 0 = pass, 1 = blocked, 2 = usage/error.
import { parseArgs, findProjectRoot, loadConfig } from "./lib/project.mjs";
import { loadTasks } from "./lib/tasks.mjs";
import { evaluateGate } from "./lib/gate.mjs";

const args = parseArgs(process.argv.slice(2));
const root = args.flags.root ? String(args.flags.root) : findProjectRoot();

try {
  const [cmd, id] = args._;
  if (cmd !== "check" || !id) throw new Error("usage: gate.mjs check <TASK-ID>");
  const config = loadConfig(root);
  const task = loadTasks(root, config).tasks.find((t) => t.data.id === id);
  if (!task) throw new Error(`task ${id} not found`);
  const res = evaluateGate(root, task, { config });
  if (args.flags.json) process.stdout.write(JSON.stringify({ task: id, ...res }, null, 2) + "\n");
  else {
    process.stdout.write([
      `${res.pass ? "PASS" : "BLOCKED"} ${id} (required reviews: ${res.required.join(", ") || "none"})`,
      ...res.reasons.map((r) => `  - ${r}`),
    ].join("\n") + "\n");
  }
  process.exitCode = res.pass ? 0 : 1;
} catch (e) {
  process.stderr.write(`gate.mjs: ${e.message}\n`);
  process.exitCode = 2;
}
