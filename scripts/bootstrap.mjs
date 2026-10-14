#!/usr/bin/env node
// Adaptive project bootstrap.
//   node scripts/bootstrap.mjs audit    [--root dir] [--json]   inventory + gaps, no writes
//   node scripts/bootstrap.mjs plan     [--root dir] [--json]   per-file actions, no writes
//   node scripts/bootstrap.mjs apply    [--root dir] [--json] [--force]
//   node scripts/bootstrap.mjs validate [--root dir] [--json]
// apply is idempotent: unchanged files are not rewritten; files changed by a
// user since bootstrap wrote them are reported as conflicts and a proposal
// is written to .claude/agent-framework/proposed/ instead (unless --force,
// which keeps a backup in .claude/agent-framework/backup/).
import { parseArgs, findProjectRoot } from "./lib/project.mjs";
import { plan, apply, validateProject, renderReport } from "./lib/bootstrap.mjs";

const args = parseArgs(process.argv.slice(2));
const root = args.flags.root ? String(args.flags.root) : findProjectRoot();
const json = Boolean(args.flags.json);
const mode = args._[0];

function strip(p) {
  return {
    discovery: p.discovery,
    inventory: p.inventory,
    capabilities: p.capabilities,
    actions: p.actions.map(({ content, ...rest }) => rest),
    written: p.written,
  };
}

function summary(p) {
  const count = (a) => p.actions.filter((x) => x.action === a).length;
  return [
    `Enabled agents (${p.capabilities.enabled.length}): ${p.capabilities.enabled.map((a) => a.name).join(", ")}`,
    `Omitted agents (${p.capabilities.omitted.length}): ${p.capabilities.omitted.map((a) => a.name).join(", ") || "none"}`,
    `Specialists: ${p.capabilities.specialists.map((s) => s.name).join(", ") || "none"} · Reused: ${p.capabilities.reused.map((r) => r.name).join(", ") || "none"}`,
    `Gaps: ${p.capabilities.gaps.map((g) => g.id).join(", ") || "none"}`,
    `Actions: create=${count("create")} update=${count("update")} unchanged=${count("unchanged")} conflict=${count("conflict")} skip=${count("skip")}`,
    ...p.actions.filter((a) => a.action !== "unchanged").map((a) => `  ${a.action.padEnd(9)} ${a.path}  (${a.reason})${a.proposal ? ` -> ${a.proposal}` : ""}`),
  ].join("\n");
}

try {
  switch (mode) {
    case "audit": {
      const p = plan(root);
      if (json) process.stdout.write(JSON.stringify({ discovery: p.discovery, inventory: p.inventory, capabilities: p.capabilities }, null, 2) + "\n");
      else process.stdout.write(renderReport(p, { mode: "audit" }));
      break;
    }
    case "plan": {
      const p = plan(root);
      process.stdout.write((json ? JSON.stringify(strip(p), null, 2) : summary(p)) + "\n");
      process.exitCode = p.actions.some((a) => a.action === "conflict") ? 3 : 0;
      break;
    }
    case "apply": {
      const p = apply(root, { force: Boolean(args.flags.force) });
      process.stdout.write((json ? JSON.stringify(strip(p), null, 2) : `${summary(p)}\nReport: reports/bootstrap-report.md`) + "\n");
      process.exitCode = p.actions.some((a) => a.action === "conflict" && !a.applied) ? 3 : 0;
      break;
    }
    case "validate": {
      const r = validateProject(root);
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      else process.stdout.write([...r.errors.map((e) => `ERROR ${e}`), ...r.warnings.map((w) => `WARN  ${w}`), r.errors.length ? `${r.errors.length} error(s)` : "OK: framework files valid"].join("\n") + "\n");
      process.exitCode = r.errors.length ? 1 : 0;
      break;
    }
    default:
      process.stdout.write("usage: bootstrap.mjs <audit|plan|apply|validate> [--root dir] [--json] [--force]\n");
      process.exitCode = mode ? 2 : 0;
  }
} catch (e) {
  process.stderr.write(`bootstrap.mjs: ${e.stack ?? e.message}\n`);
  process.exitCode = 2;
}
