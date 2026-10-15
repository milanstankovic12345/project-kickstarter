#!/usr/bin/env node
// Export the framework layer to Cursor, Codex or GitHub Copilot.
//   node scripts/export-ide.mjs <cursor|codex|copilot> [--project dir] [--dry-run] [--force]
//        [--no-ci] [--no-hooks] [--install-git-hooks] [--json]
// Idempotent. Files you changed since the last export are reported as
// conflicts and a proposal is written to .agent-framework/proposed/ instead
// (unless --force, which keeps a backup in .agent-framework/backup/).
// Exit: 0 ok, 2 usage/error, 3 conflicts left unresolved.
import { resolve } from "node:path";
import { parseArgs } from "./lib/project.mjs";
import { TARGETS, RUNTIME_REL, planExport, applyExport } from "./lib/export-ide.mjs";
import { installPreCommit } from "./install-git-hooks.mjs";

const args = parseArgs(process.argv.slice(2));
const target = args._[0] ?? args.flags.target;
const root = resolve(args.flags.project ? String(args.flags.project) : process.cwd());
const json = Boolean(args.flags.json);
const opts = { ci: !args.flags["no-ci"], hooks: !args.flags["no-hooks"] };

function strip(p) {
  return { target: p.target, actions: p.actions.map(({ content, ...rest }) => rest), written: p.written };
}

try {
  if (!TARGETS.includes(target)) {
    process.stdout.write(`usage: export-ide.mjs <${TARGETS.join("|")}> [--project dir] [--dry-run] [--force] [--no-ci] [--no-hooks] [--install-git-hooks] [--json]\n`);
    process.exitCode = target ? 2 : 0;
  } else {
    const dry = Boolean(args.flags["dry-run"]);
    const p = dry ? planExport(root, target, opts) : applyExport(root, target, { ...opts, force: Boolean(args.flags.force) });
    let git = null;
    if (!dry && args.flags["install-git-hooks"]) git = installPreCommit(root, { runtimeRel: RUNTIME_REL, force: Boolean(args.flags.force) });
    const count = (a) => p.actions.filter((x) => x.action === a).length;
    const conflicts = p.actions.filter((a) => a.action === "conflict" && !a.applied);
    if (json) {
      process.stdout.write(JSON.stringify({ ...strip(p), git_hook: git }, null, 2) + "\n");
    } else {
      const lines = [
        `${dry ? "Plan" : "Exported"} for ${target} into ${root}`,
        `create=${count("create")} update=${count("update")} unchanged=${count("unchanged")} conflict=${count("conflict")} stale=${count("stale")}`,
        ...p.actions.filter((a) => ["conflict", "stale"].includes(a.action)).map((a) => `  ${a.action.padEnd(8)} ${a.path}  (${a.reason})${a.proposal ? ` -> ${a.proposal}` : ""}`),
      ];
      if (git) lines.push(`git pre-commit hook: ${git.status}${git.path ? ` (${git.path})` : ""}`);
      if (!dry) {
        lines.push(
          "",
          "Next steps:",
          `  1. node ${RUNTIME_REL}/scripts/bootstrap.mjs apply     # creates .claude/agent-framework.json, the profile and starter tasks`,
          `  2. node ${RUNTIME_REL}/scripts/tasks.mjs validate`,
          ...(args.flags["install-git-hooks"] ? [] : [`  3. node scripts/install-git-hooks.mjs --root . --runtime ${RUNTIME_REL}   # optional pre-commit backstop`]),
          "  Not verified in a live IDE: open the project in the IDE and run one task end to end.",
        );
      }
      process.stdout.write(lines.join("\n") + "\n");
    }
    process.exitCode = conflicts.length ? 3 : 0;
  }
} catch (e) {
  process.stderr.write(`export-ide.mjs: ${e.stack ?? e.message}\n`);
  process.exitCode = 2;
}
