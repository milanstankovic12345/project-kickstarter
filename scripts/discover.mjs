#!/usr/bin/env node
// Deterministic project discovery.
//   node scripts/discover.mjs [--root dir] [--json]
// Prints a JSON discovery document (--json) or a short human summary.
// Never reads the contents of secret-bearing files (.env*, keys, credentials).
import { parseArgs, findProjectRoot } from "./lib/project.mjs";
import { discover } from "./lib/discover.mjs";

const args = parseArgs(process.argv.slice(2));
const root = args.flags.root ? String(args.flags.root) : findProjectRoot();
try {
  const d = discover(root);
  if (args.flags.json) process.stdout.write(JSON.stringify(d, null, 2) + "\n");
  else {
    process.stdout.write([
      `Project: ${d.root_name} (${d.size.files} files${d.size.truncated ? ", truncated" : ""}) source_hash=${d.source_hash}`,
      `Languages: ${d.languages.map((l) => `${l.name}(${l.files})`).join(", ") || "-"}`,
      `Frameworks: ${d.frameworks.map((f) => `${f.name}[${f.category}]`).join(", ") || "-"}`,
      `Commands: ${Object.entries(d.commands).map(([k, v]) => `${k}=${v.cmd}`).join("; ") || "-"}`,
      `Tests: ${d.testing.test_files} files (${d.testing.frameworks.join(", ") || "no framework"}) · CI: ${d.ci.map((c) => c.system).join(", ") || "none"} · UI: ${d.ui.has_ui ? "yes" : "no"}`,
      `Data: ${[...d.data.databases, ...d.data.orm].join(", ") || "-"} · Auth: ${d.auth.join(", ") || "-"} · Sensitive paths: ${d.security_sensitive_paths.length}`,
      `Secret files (names only): ${d.secret_files.join(", ") || "none"}`,
    ].join("\n") + "\n");
  }
} catch (e) {
  process.stderr.write(`discover.mjs: ${e.message}\n`);
  process.exitCode = 2;
}
