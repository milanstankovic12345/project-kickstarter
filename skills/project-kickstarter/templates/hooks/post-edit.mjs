// PostToolUse hook: logs edits and (if a formatter is configured) reminds via stderr.
// Reads hook JSON from stdin; exits 0 to allow. Keep this read-only regarding the edit itself.
import { appendFileSync } from "node:fs";

let input = {};
try {
  input = JSON.parse(await new Promise((res) => {
    let data = "";
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => res(data || "{}"));
  }));
} catch { /* malformed input: fail open */ }

const file = input?.tool_input?.file_path ?? "unknown";
try {
  appendFileSync(".claude/hooks/audit.log", `${new Date().toISOString()} post-edit ${file}\n`);
} catch { /* logging must never block */ }

process.exit(0);
