#!/usr/bin/env node
// Install a git pre-commit hook that runs the framework backstop
// (ci-check.mjs) for IDEs that have no hook events of their own.
//   node scripts/install-git-hooks.mjs [--root dir] [--runtime <rel dir>] [--force]
// Never overwrites a pre-commit hook it did not write, unless --force
// (which keeps a backup next to it).
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync } from "node:fs";
import { join, isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, findProjectRoot } from "./lib/project.mjs";

export const HOOK_MARKER = "# project-kickstarter:ide pre-commit";

export function hookScript(runtimeRel) {
  return `#!/bin/sh\n${HOOK_MARKER}\nnode "${runtimeRel}/scripts/ci-check.mjs" || exit 1\n`;
}

export function hooksDir(root) {
  const r = spawnSync("git", ["rev-parse", "--git-path", "hooks"], { cwd: root, encoding: "utf8" });
  const out = r.status === 0 ? r.stdout.trim() : "";
  if (out) return isAbsolute(out) ? out : resolve(root, out);
  return join(root, ".git", "hooks");
}

export function installPreCommit(root, { runtimeRel = ".agent-framework/runtime", force = false } = {}) {
  if (!existsSync(join(root, ".git"))) return { status: "no-git", path: null };
  const dir = hooksDir(root);
  const path = join(dir, "pre-commit");
  const want = hookScript(runtimeRel);
  let backup = null;
  if (existsSync(path)) {
    const cur = readFileSync(path, "utf8");
    if (cur === want) return { status: "unchanged", path };
    if (!cur.includes(HOOK_MARKER)) {
      if (!force) return { status: "conflict", path };
      backup = `${path}.backup`;
      copyFileSync(path, backup);
    }
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, want);
  try { chmodSync(path, 0o755); } catch { /* not supported on every file system */ }
  return { status: backup ? "replaced" : "installed", path, backup };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const root = args.flags.root ? String(args.flags.root) : findProjectRoot();
  const res = installPreCommit(root, { runtimeRel: args.flags.runtime ? String(args.flags.runtime) : undefined, force: Boolean(args.flags.force) });
  const msg = {
    "no-git": "not a git repository; nothing installed",
    unchanged: `pre-commit hook already installed (${res.path})`,
    conflict: `a pre-commit hook not written by this tool exists (${res.path}); re-run with --force to replace it (a backup is kept)`,
    replaced: `pre-commit hook replaced (${res.path}); backup at ${res.backup}`,
    installed: `pre-commit hook installed (${res.path})`,
  }[res.status];
  process.stdout.write(msg + "\n");
  process.exitCode = res.status === "conflict" ? 3 : 0;
}
