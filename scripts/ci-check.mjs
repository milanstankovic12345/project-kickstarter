#!/usr/bin/env node
// Backstop for IDEs without hooks (git pre-commit and CI): validates the
// task set and re-evaluates the quality gate of every task marked done.
//   node scripts/ci-check.mjs [--root dir] [--json]
// Exit 0 = ok (or framework not enabled), 1 = problems found.
import { parseArgs, findProjectRoot, loadConfig, isFrameworkEnabled } from "./lib/project.mjs";
import { loadTasks, validateTaskSet } from "./lib/tasks.mjs";
import { evaluateGate } from "./lib/gate.mjs";

const args = parseArgs(process.argv.slice(2));
const root = args.flags.root ? String(args.flags.root) : findProjectRoot();

try {
  if (!isFrameworkEnabled(root)) {
    process.stdout.write("agent framework not enabled (no .claude/agent-framework.json); nothing to check\n");
  } else {
    const config = loadConfig(root);
    const problems = [];
    const set = validateTaskSet(root, { config });
    for (const e of set.errors) problems.push(`task ${e.task ?? e.file}: ${e.message}`);
    for (const t of loadTasks(root, config).tasks.filter((x) => x.data.status === "done")) {
      const res = evaluateGate(root, t, { config });
      if (!res.pass) problems.push(`${t.data.id} is done but the gate is BLOCKED: ${res.reasons.join("; ")}`);
    }
    if (args.flags.json) process.stdout.write(JSON.stringify({ ok: !problems.length, problems }, null, 2) + "\n");
    else process.stdout.write(problems.length ? problems.map((p) => `ERROR ${p}`).join("\n") + "\n" : "OK: tasks valid, gates pass for done tasks\n");
    process.exitCode = problems.length ? 1 : 0;
  }
} catch (e) {
  process.stderr.write(`ci-check.mjs: ${e.message}\n`);
  process.exitCode = 2;
}
