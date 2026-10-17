#!/usr/bin/env node
// Model routing CLI.
//   node scripts/routing.mjs resolve <agent> [--task TASK-ID] [--attempt N] [--unavailable opus,sonnet] [--root dir] [--json]
//   node scripts/routing.mjs check            # routing table + agent frontmatter consistency
//   node scripts/routing.mjs sync             # (plugin maintainers) write model/effort into agents/*.md from config
//   node scripts/routing.mjs table            # print tier -> model table
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, findProjectRoot, pluginFile, loadConfig } from "./lib/project.mjs";
import { effectiveRouting, checkRouting, resolveModel } from "./lib/routing.mjs";
import { loadRegistry, subagentType } from "./lib/registry.mjs";
import { parseFrontmatter, setFrontmatterScalars } from "./lib/frontmatter.mjs";
import { loadTasks } from "./lib/tasks.mjs";

const args = parseArgs(process.argv.slice(2));
const json = Boolean(args.flags.json);
const cmd = args._[0];

function agentFile(name) {
  return pluginFile("agents", `${name}.md`);
}

function removeKey(text, key) {
  return text.replace(/\r\n?/g, "\n").replace(new RegExp(`^(---\\n[\\s\\S]*?)^${key}:.*\\n([\\s\\S]*?\\n---)`, "m"), "$1$2");
}

function main() {
  const registry = loadRegistry();
  if (cmd === "resolve") {
    const root = args.flags.root ? String(args.flags.root) : findProjectRoot();
    const agent = args._[1];
    if (!agent) throw new Error("usage: resolve <agent> [--task TASK-ID] [--attempt N]");
    let taskTier;
    let attempt = Number(args.flags.attempt ?? 0) || 0;
    if (typeof args.flags.task === "string") {
      const t = loadTasks(root, loadConfig(root)).tasks.find((x) => x.data.id === args.flags.task);
      if (!t) throw new Error(`task ${args.flags.task} not found`);
      taskTier = t.data.model_tier;
      if (args.flags.attempt === undefined) attempt = t.data.attempts ?? 0;
    }
    const unavailable = typeof args.flags.unavailable === "string" ? args.flags.unavailable.split(",") : [];
    const res = resolveModel(agent, { root, taskTier, attempt, unavailable });
    res.subagent_type = subagentType(agent, root);
    const enabled = loadConfig(root).enabled_agents ?? [];
    res.enabled = enabled.length === 0 || enabled.includes(res.agent) || !registry.agents[res.agent];
    process.stdout.write((json ? JSON.stringify(res, null, 2) : `${res.model}`) + "\n");
    return;
  }
  if (cmd === "table") {
    const routing = effectiveRouting(args.flags.root ? String(args.flags.root) : findProjectRoot());
    const lines = Object.entries(routing.tiers).map(([k, t]) => `${k.padEnd(10)} ${t.model.padEnd(8)} fallbacks=${(t.fallbacks ?? []).join(",") || "-"}  ${t.purpose ?? ""}`);
    process.stdout.write((json ? JSON.stringify(routing.tiers, null, 2) : lines.join("\n")) + "\n");
    return;
  }
  if (cmd === "check" || cmd === "sync") {
    const routing = effectiveRouting(null);
    const errors = checkRouting(routing, registry);
    const changed = [];
    for (const [name, meta] of Object.entries(registry.agents)) {
      const file = agentFile(name);
      if (!existsSync(file)) { errors.push(`agent ${name}: missing ${join("agents", name + ".md")}`); continue; }
      const text = readFileSync(file, "utf8");
      const { data } = parseFrontmatter(text);
      const tier = routing.tiers[meta.tier];
      if (!tier) continue;
      const wantEffort = tier.effort ?? null;
      const drift = data.model !== tier.model || (data.effort ?? null) !== wantEffort;
      if (!drift) continue;
      if (cmd === "check") errors.push(`agent ${name}: frontmatter model=${data.model ?? "∅"} effort=${data.effort ?? "∅"} but tier ${meta.tier} wants model=${tier.model} effort=${wantEffort ?? "∅"} (run: node scripts/routing.mjs sync)`);
      else {
        let next = setFrontmatterScalars(text, { model: tier.model });
        next = wantEffort ? setFrontmatterScalars(next, { effort: wantEffort }) : removeKey(next, "effort");
        writeFileSync(file, next);
        changed.push(name);
      }
    }
    if (json) process.stdout.write(JSON.stringify({ errors, changed }, null, 2) + "\n");
    else process.stdout.write([...errors.map((e) => `ERROR ${e}`), ...(cmd === "sync" ? [`synced ${changed.length} agent(s)${changed.length ? ": " + changed.join(", ") : ""}`] : []), errors.length ? "" : "OK: routing consistent"].filter(Boolean).join("\n") + "\n");
    process.exitCode = errors.length ? 1 : 0;
    return;
  }
  process.stdout.write("usage: routing.mjs <resolve|check|sync|table>\n");
  process.exitCode = cmd ? 2 : 0;
}

try {
  main();
} catch (e) {
  process.stderr.write(`routing.mjs: ${e.message}\n`);
  process.exitCode = 2;
}
