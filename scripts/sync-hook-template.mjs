#!/usr/bin/env node
// Generates the kickstarter's standalone hook template
// (skills/project-kickstarter/templates/hooks/guard-bash.mjs) from the
// single source of truth hooks/lib/bash-rules.mjs, so the copied-into-project
// guard never drifts from the framework guard.
//   node scripts/sync-hook-template.mjs          write the template
//   node scripts/sync-hook-template.mjs --check  exit 1 if out of date
import { readFileSync, writeFileSync } from "node:fs";
import { pluginFile } from "./lib/project.mjs";

export const TEMPLATE_PATH = pluginFile("skills", "project-kickstarter", "templates", "hooks", "guard-bash.mjs");

export function renderTemplate() {
  const rules = readFileSync(pluginFile("hooks", "lib", "bash-rules.mjs"), "utf8").replace(/\r\n?/g, "\n");
  const body = rules
    .replace(/^\/\/.*\n/gm, (line) => line) // keep comments
    .replace(/^export (const|function) /gm, "$1 ");
  return `// GENERATED from project-kickstarter hooks/lib/bash-rules.mjs — do not edit by hand.
// Claude Code PreToolUse hook (matcher: Bash). Copy to .claude/hooks/ and register
// with the settings snippet. Denies catastrophic commands, asks a human for risky ones.
// Output format per https://code.claude.com/docs/en/hooks (permissionDecision +
// permissionDecisionReason). Fails open on malformed input.
${body}
let input = {};
try {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
} catch { process.exit(0); }

const { decision, reason } = classify(input?.tool_input?.command);
if (decision !== "allow") {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: decision === "deny" ? \`Blocked: \${reason}. Run it manually if truly intended.\` : \`\${reason} — requires explicit approval.\`,
    },
  }) + "\\n");
}
process.exit(0);
`;
}

if (process.argv[1] && process.argv[1].endsWith("sync-hook-template.mjs")) {
  const want = renderTemplate();
  let have = "";
  try { have = readFileSync(TEMPLATE_PATH, "utf8").replace(/\r\n?/g, "\n"); } catch { /* missing */ }
  if (process.argv.includes("--check")) {
    if (have !== want) { process.stdout.write("template out of date: run node scripts/sync-hook-template.mjs\n"); process.exitCode = 1; }
    else process.stdout.write("OK: hook template in sync\n");
  } else {
    writeFileSync(TEMPLATE_PATH, want);
    process.stdout.write(`wrote ${TEMPLATE_PATH}\n`);
  }
}
