// Claude Code PostToolUse hook (matcher: Edit|Write): appends one line per
// edited file to .claude/hooks/audit.log in the project root. It never
// modifies the edited file and never blocks; logging errors are ignored.
import { appendFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";

let input = {};
try {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
} catch { /* malformed input: fail open */ }

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const file = input?.tool_input?.file_path ? relative(root, input.tool_input.file_path) : "unknown";
try {
  mkdirSync(join(root, ".claude", "hooks"), { recursive: true });
  appendFileSync(join(root, ".claude", "hooks", "audit.log"), `${new Date().toISOString()} ${input.tool_name ?? "edit"} ${file}\n`);
} catch { /* logging must never block */ }

process.exit(0);
