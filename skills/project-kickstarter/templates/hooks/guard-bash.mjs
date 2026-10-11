// PreToolUse hook (matcher: Bash): blocks clearly destructive commands.
// Reads hook JSON from stdin; outputs a deny decision for dangerous commands.
let input = {};
try {
  input = JSON.parse(await new Promise((res) => {
    let data = "";
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => res(data || "{}"));
  }));
} catch { process.exit(0); }

const cmd = String(input?.tool_input?.command ?? "");
const dangerous = [
  /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/,      // rm -rf
  /\bgit\s+push\s+.*--force\b/,                        // force push
  /\bgit\s+reset\s+--hard\b/,                          // hard reset
  /\bdrop\s+(table|database)\b/i,                      // SQL drops
  />\s*\/dev\/sd[a-z]/,                                // raw device writes
];

if (dangerous.some((re) => re.test(cmd))) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      reason: `Blocked potentially destructive command: ${cmd.slice(0, 120)}`
    }
  }));
  process.exit(0);
}
process.exit(0);
