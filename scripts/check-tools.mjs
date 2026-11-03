#!/usr/bin/env node
// Diagnostic-only: reports which CLIs this machine has installed. Detection
// of a binary is NOT a claim that this framework has a CLI adapter for it —
// only Codex currently does (scripts/codex-review.mjs); see
// `node scripts/capabilities.mjs list` for the actual support tier per tool.
// Never blocks: always exits 0.
import { parseArgs } from "./lib/project.mjs";
import { detectCli } from "./lib/cli-detect.mjs";

const args = parseArgs(process.argv.slice(2));
const json = Boolean(args.flags.json);

const PROBED = [
  { bin: "codex", note: "framework has a CLI_ADAPTER for this (scripts/codex-review.mjs)" },
  { bin: "opencode", note: "detection only; no CLI_ADAPTER implemented" },
];
const NOT_PROBED = [
  { tool: "cursor", note: "GUI tool; no scriptable CLI to probe" },
  { tool: "copilot", note: "a `gh` extension; not probed by this diagnostic" },
  { tool: "gemini", note: "NOT_SUPPORTED by this framework; not probed" },
];

async function main() {
  const results = [];
  for (const p of PROBED) results.push({ tool: p.bin, ...(await detectCli({ bin: p.bin })), note: p.note });
  for (const p of NOT_PROBED) results.push({ tool: p.tool, installed: null, reason: "not_probed", note: p.note });

  if (json) {
    process.stdout.write(JSON.stringify({ results }, null, 2) + "\n");
  } else {
    const lines = ["tool       status"];
    for (const r of results) {
      const status = r.installed === true ? `installed${r.version ? ` (${r.version})` : ""}`
        : r.installed === false ? `not installed (${r.reason})`
        : "not probed";
      lines.push(`${r.tool.padEnd(10)} ${status}  - ${r.note}`);
    }
    process.stdout.write(lines.join("\n") + "\n");
  }
}

main().catch((e) => {
  process.stderr.write(`check-tools.mjs: ${e.message}\n`);
}).finally(() => { process.exitCode = 0; });
