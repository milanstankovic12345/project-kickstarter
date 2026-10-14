#!/usr/bin/env node
// Task system CLI.
//   node scripts/tasks.mjs validate [--strict] [--json]
//   node scripts/tasks.mjs batches [--max N] [--json]
//   node scripts/tasks.mjs transition <TASK-ID> <state> [--reason "..."] [--human-approved] [--dry-run]
//   node scripts/tasks.mjs status [--json]
//   node scripts/tasks.mjs new --title "..." --agent <name> --scope <glob[,glob]> [--depends TASK-001,...]
//        [--validation "cmd"] [--acceptance "criterion"] [--tier coding] [--review code,security]
//   node scripts/tasks.mjs next-id
// Global: --root <dir> (default: nearest dir with .claude/agent-framework.json or .git)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, findProjectRoot, loadConfig, frameworkPaths, pluginFile, today, rel, appendEvent } from "./lib/project.mjs";
import { validateTaskSet, computeBatches, transition, statusSummary, nextTaskId, requiredReviewKinds, loadTasks } from "./lib/tasks.mjs";
import { knownAgentNames, knownSkillNames } from "./lib/registry.mjs";
import { stringifyYaml } from "./lib/yaml.mjs";

const args = parseArgs(process.argv.slice(2));
const root = args.flags.root ? String(args.flags.root) : findProjectRoot();
const json = Boolean(args.flags.json);
const cmd = args._[0];

function list(v) {
  if (v === undefined || v === true) return [];
  return String(v).split(",").map((s) => s.trim()).filter(Boolean);
}

function print(obj, human) {
  process.stdout.write((json ? JSON.stringify(obj, null, 2) : human(obj)) + "\n");
}

function main() {
  const config = loadConfig(root);
  switch (cmd) {
    case "validate": {
      const res = validateTaskSet(root, { config, knownAgents: knownAgentNames(root), knownSkills: knownSkillNames(root) });
      const out = { root, tasks: res.tasks.length, errors: res.errors, warnings: res.warnings };
      print(out, (o) => [
        `Validated ${o.tasks} task(s) in ${rel(root, frameworkPaths(root, config).tasks) || "."}`,
        ...o.errors.map((e) => `ERROR   ${e.task ?? "-"} ${e.file ?? ""}: ${e.message}`),
        ...o.warnings.map((w) => `WARN    ${w.task ?? "-"} ${w.file ?? ""}: ${w.message}`),
        o.errors.length ? `${o.errors.length} error(s)` : "OK: no errors",
      ].join("\n"));
      process.exitCode = res.errors.length || (args.flags.strict && res.warnings.length) ? 1 : 0;
      return;
    }
    case "batches":
    case "next": {
      const res = computeBatches(root, { config, maxParallel: args.flags.max });
      print(res, (o) => [
        o.batch.length ? `Runnable now (${o.batch.length}, parallel-safe):` : "Nothing runnable now.",
        ...o.batch.map((t) => `  ${t.id}  ${t.agent.padEnd(22)} ${t.title}`),
        ...(o.active.length ? [`In progress: ${o.active.join(", ")}`] : []),
        ...o.deferred.map((d) => `  deferred ${d.id}: ${d.reason}`),
        ...o.waiting.map((w) => `  waiting  ${w.id}: on ${w.waiting_on.join(", ")}`),
      ].join("\n"));
      return;
    }
    case "transition": {
      const [, id, to] = args._;
      if (!id || !to) throw new Error("usage: transition <TASK-ID> <state> [--reason ...]");
      const res = transition(root, id, to, {
        config,
        reason: typeof args.flags.reason === "string" ? args.flags.reason : undefined,
        humanApproved: Boolean(args.flags["human-approved"]),
        dryRun: Boolean(args.flags["dry-run"]),
      });
      print(res, (o) => (o.ok ? `${id}: ${o.from} -> ${o.to}${args.flags["dry-run"] ? " (dry run)" : ""}` : [`REJECTED ${id}: ${o.from ?? "?"} -> ${to}`, ...o.errors.map((e) => `  - ${e}`)].join("\n")));
      process.exitCode = res.ok ? 0 : 1;
      return;
    }
    case "status": {
      const res = statusSummary(root, config);
      print(res, (o) => {
        if (!o.total) return "No tasks.";
        const counts = Object.entries(o.counts).filter(([, n]) => n).map(([s, n]) => `${s}=${n}`).join(" ");
        return [`Tasks: ${o.total} (${counts})`, ...o.tasks.map((t) => `  ${t.id}  ${t.status.padEnd(11)} ${String(t.agent).padEnd(22)} ${t.title}${t.blocked_reason ? `  [${t.blocked_reason}]` : ""}${t.attempts ? `  (attempt ${t.attempts}/${t.max_retries})` : ""}`)].join("\n");
      });
      return;
    }
    case "required-reviews": {
      const id = args._[1];
      const t = loadTasks(root, config).tasks.find((x) => x.data.id === id);
      if (!t) throw new Error(`task ${id} not found`);
      const required = requiredReviewKinds(t, config);
      const reviewers = required.map((kind) => ({ kind, agent: config.review_agents?.[kind] ?? null }));
      print({ task: id, required, reviewers }, (o) => o.required.join(" "));
      return;
    }
    case "next-id": {
      print({ id: nextTaskId(root, config) }, (o) => o.id);
      return;
    }
    case "new": {
      const title = args.flags.title;
      const agent = args.flags.agent;
      const scope = list(args.flags.scope);
      if (typeof title !== "string" || typeof agent !== "string" || !scope.length) throw new Error('usage: new --title "..." --agent <name> --scope <glob>');
      const id = nextTaskId(root, config);
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
      const data = {
        id, title, status: "draft", agent,
        skills: list(args.flags.skills),
        model_tier: typeof args.flags.tier === "string" ? args.flags.tier : "coding",
        priority: typeof args.flags.priority === "string" ? args.flags.priority : "p2",
        depends_on: list(args.flags.depends),
        files_allowed: scope,
        files_excluded: list(args.flags.exclude),
        review: list(args.flags.review).length ? list(args.flags.review) : ["code"],
        validation: (args.flags.validation && args.flags.validation !== true ? String(args.flags.validation).split(";;") : ["<fill in exact command>"]).map((c) => ({ cmd: c.trim(), expect: "exit 0" })),
        acceptance: args.flags.acceptance && args.flags.acceptance !== true ? String(args.flags.acceptance).split(";;").map((s) => s.trim()) : ["<fill in observable criterion>"],
        max_retries: config.retries.default_max,
        attempts: 0,
        created: today(),
        updated: today(),
      };
      const template = readFileSync(pluginFile("templates", "task.md"), "utf8").replace(/\r\n?/g, "\n");
      const body = template.slice(template.indexOf("\n---\n", 4) + 5).replace(/\{\{id\}\}/g, id);
      const dir = frameworkPaths(root, config).tasks;
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${id}-${slug}.md`);
      if (existsSync(file)) throw new Error(`${rel(root, file)} already exists`);
      writeFileSync(file, `---\n${stringifyYaml(data)}\n---\n${body}`);
      appendEvent(root, { type: "task_created", task: id, agent }, config);
      print({ id, file: rel(root, file) }, (o) => `Created ${o.file} (status: draft). Fill in Objective/Context/Steps, then: tasks.mjs transition ${o.id} ready`);
      return;
    }
    default:
      process.stdout.write("usage: tasks.mjs <validate|batches|transition|status|new|next-id|required-reviews> [options] [--root dir] [--json]\n");
      process.exitCode = cmd ? 2 : 0;
  }
}

try {
  main();
} catch (e) {
  process.stderr.write(`tasks.mjs: ${e.message}\n`);
  process.exitCode = 2;
}
