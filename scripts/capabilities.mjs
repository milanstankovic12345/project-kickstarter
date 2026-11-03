#!/usr/bin/env node
// Read-only report of which external tools this framework integrates with,
// at what tier, and whether that tier is verified.
//   node scripts/capabilities.mjs list [--json]
//   node scripts/capabilities.mjs show <tool> [--json]
import { parseArgs } from "./lib/project.mjs";
import { loadCapabilities } from "./lib/capabilities.mjs";

const args = parseArgs(process.argv.slice(2));
const json = Boolean(args.flags.json);
const cmd = args._[0];

const cell = (t) => `${t.status}${t.adapter_version ? ` (v${t.adapter_version})` : ""}`;

try {
  const data = loadCapabilities(typeof args.flags.config === "string" ? args.flags.config : undefined);
  if (cmd === "show") {
    const name = args._[1];
    const tool = data.tools[name];
    if (!tool) throw new Error(`unknown tool "${name}" (known: ${Object.keys(data.tools).join(", ")})`);
    if (json) {
      process.stdout.write(JSON.stringify({ name, ...tool }, null, 2) + "\n");
    } else {
      process.stdout.write([
        `${tool.label} (${name})`,
        `  static_export     ${cell(tool.static_export)} - ${tool.static_export.notes}`,
        `  cli_adapter       ${cell(tool.cli_adapter)} - ${tool.cli_adapter.notes}`,
        `  full_integration  ${cell(tool.full_integration)} - ${tool.full_integration.notes}`,
      ].join("\n") + "\n");
    }
  } else if (cmd === "list" || !cmd) {
    if (json) {
      process.stdout.write(JSON.stringify(data, null, 2) + "\n");
    } else {
      const lines = ["tool              static_export        cli_adapter          full_integration"];
      for (const [name, tool] of Object.entries(data.tools)) {
        lines.push(`${name.padEnd(17)} ${cell(tool.static_export).padEnd(20)} ${cell(tool.cli_adapter).padEnd(20)} ${cell(tool.full_integration)}`);
      }
      process.stdout.write(lines.join("\n") + "\n");
    }
  } else {
    process.stdout.write("usage: capabilities.mjs <list|show <tool>> [--json]\n");
    process.exitCode = 2;
  }
} catch (e) {
  process.stderr.write(`capabilities.mjs: ${e.message}\n`);
  process.exitCode = 2;
}
