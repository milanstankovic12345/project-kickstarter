#!/usr/bin/env node
// Portable test runner: finds tests/**/*.test.mjs and passes them to
// `node --test` explicitly (glob arguments need Node 21+).
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { PLUGIN_ROOT } from "./lib/project.mjs";

function find(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "fixtures" || name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...find(p));
    else if (name.endsWith(".test.mjs")) out.push(p);
  }
  return out;
}

const filter = process.argv[2];
const files = find(join(PLUGIN_ROOT, "tests")).filter((f) => !filter || relative(PLUGIN_ROOT, f).includes(filter)).sort();
if (!files.length) {
  console.error("no test files found");
  process.exit(1);
}
const res = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit", cwd: PLUGIN_ROOT });
process.exit(res.status ?? 1);
