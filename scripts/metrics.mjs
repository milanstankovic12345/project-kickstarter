#!/usr/bin/env node
// Framework metrics and improvement-proposal checks.
//   node scripts/metrics.mjs summary   [--root dir] [--json]   aggregated events + signals
//   node scripts/metrics.mjs proposals [--root dir] [--json]   validate reports/improvements/PROP-*.md
// Token/cost data is not available to these scripts and is never estimated.
import { parseArgs, findProjectRoot, loadConfig } from "./lib/project.mjs";
import { summarize, signals, listProposals } from "./lib/metrics.mjs";

const args = parseArgs(process.argv.slice(2));
const root = args.flags.root ? String(args.flags.root) : findProjectRoot();
const json = Boolean(args.flags.json);

function main() {
  const config = loadConfig(root);
  const cmd = args._[0];
  if (cmd === "summary" || cmd === "report") {
    const s = summarize(root, config);
    const sig = signals(s);
    if (json) process.stdout.write(JSON.stringify({ ...s, signals: sig }, null, 2) + "\n");
    else {
      process.stdout.write([
        `Events: ${s.events}${s.malformed_lines ? ` (${s.malformed_lines} malformed lines)` : ""}${s.period ? ` from ${s.period.from} to ${s.period.to}` : ""}`,
        `Tasks: done ${s.tasks_done}, failed ${s.tasks_failed}, fix loops ${s.fix_loops}`,
        `Handoffs: saved ${s.handoffs.saved}, rejected ${s.handoffs.rejected} ${JSON.stringify(s.handoffs.rejection_reasons)}`,
        `Reviews: saved ${s.reviews.saved}, findings ${JSON.stringify(s.reviews.findings)}, verdicts ${JSON.stringify(s.reviews.verdicts)}`,
        `Subagent stops: ${s.subagent_stops.total}, without HANDOFF ${s.subagent_stops.missing_handoff}`,
        `Not tracked: ${s.not_tracked.join(", ")}`,
        sig.length ? "Signals:" : "Signals: none (insufficient evidence for proposals)",
        ...sig.map((x) => `  - ${x.id}: ${x.evidence} → ${x.suggestion}`),
      ].join("\n") + "\n");
    }
    return;
  }
  if (cmd === "proposals") {
    const props = listProposals(root, config);
    const bad = props.filter((p) => p.errors.length);
    if (json) process.stdout.write(JSON.stringify(props, null, 2) + "\n");
    else process.stdout.write((props.length ? props.map((p) => `${p.errors.length ? "INVALID" : "ok     "} ${p.file} ${p.data?.status ?? ""}${p.errors.length ? "\n    - " + p.errors.join("\n    - ") : ""}`).join("\n") : "No proposals.") + "\n");
    process.exitCode = bad.length ? 1 : 0;
    return;
  }
  process.stdout.write("usage: metrics.mjs <summary|proposals> [--root dir] [--json]\n");
  process.exitCode = cmd ? 2 : 0;
}

try {
  main();
} catch (e) {
  process.stderr.write(`metrics.mjs: ${e.message}\n`);
  process.exitCode = 2;
}
