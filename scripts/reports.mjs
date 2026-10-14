#!/usr/bin/env node
// Validated persistence for handoffs and reviews. Agents without Write
// access (reviewers, auditors) save their reports through this script.
//
//   node scripts/reports.mjs save handoff <TASK-ID>          < handoff.md
//   node scripts/reports.mjs save review <TASK-ID> <kind>    < review.md
//   node scripts/reports.mjs check handoff <TASK-ID>
//   node scripts/reports.mjs check review <TASK-ID> <kind>
//   node scripts/reports.mjs progress "<line>"   (append to the progress ledger)
// Options: --root <dir> --json
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs, findProjectRoot, loadConfig, frameworkPaths, loadSchema, rel, appendEvent, today } from "./lib/project.mjs";
import { loadTasks } from "./lib/tasks.mjs";
import { validateHandoffForTask, handoffPath } from "./lib/handoff.mjs";
import { reviewPath } from "./lib/gate.mjs";
import { parseFrontmatter } from "./lib/frontmatter.mjs";
import { validate as validateSchema } from "./lib/schema.mjs";

const args = parseArgs(process.argv.slice(2));
const root = args.flags.root ? String(args.flags.root) : findProjectRoot();
const json = Boolean(args.flags.json);
const [action, kind, id, reviewKind] = args._;

function readStdin() {
  try { return readFileSync(0, "utf8"); } catch { return ""; }
}

function out(result) {
  if (json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  else {
    const lines = [result.ok ? `OK ${result.message}` : `REJECTED ${result.message}`];
    for (const e of result.errors ?? []) lines.push(`  - ${e}`);
    for (const w of result.warnings ?? []) lines.push(`  ~ ${w}`);
    process.stdout.write(lines.join("\n") + "\n");
  }
  process.exitCode = result.ok ? 0 : 1;
}

function validateReviewText(text, task, kindName) {
  const errors = [];
  let parsed;
  try { parsed = parseFrontmatter(text); } catch (e) { return [`unparseable frontmatter: ${e.message}`]; }
  if (!parsed.hasFrontmatter) return ["missing YAML frontmatter"];
  errors.push(...validateSchema(loadSchema("review"), parsed.data).map((e) => `schema ${e}`));
  if (parsed.data.task !== task.data.id) errors.push(`review task "${parsed.data.task}" does not match ${task.data.id}`);
  if (parsed.data.kind !== kindName) errors.push(`review kind "${parsed.data.kind}" does not match ${kindName}`);
  if (parsed.data.reviewer === task.data.agent) errors.push(`reviewer "${parsed.data.reviewer}" implemented this task; reviews must be independent`);
  const ids = (parsed.data.findings ?? []).map((f) => f.id);
  if (new Set(ids).size !== ids.length) errors.push("finding ids must be unique");
  return errors;
}

function atomicWrite(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

function main() {
  const config = loadConfig(root);
  if (action === "progress") {
    const line = args._.slice(1).join(" ").trim();
    if (!line) throw new Error('usage: progress "<line>"');
    const p = frameworkPaths(root, config).progress;
    mkdirSync(dirname(p), { recursive: true });
    if (!existsSync(p)) writeFileSync(p, "# Progress ledger\n\nAppend-only. One line per orchestration event. Survives context compaction.\n\n");
    appendFileSync(p, `- ${today()} ${line.replace(/\s*\n\s*/g, " ")}\n`);
    return out({ ok: true, message: `appended to ${rel(root, p)}` });
  }
  if (!["save", "check"].includes(action) || !["handoff", "review"].includes(kind) || !id) {
    throw new Error("usage: reports.mjs <save|check> <handoff|review> <TASK-ID> [kind]");
  }
  const task = loadTasks(root, config).tasks.find((t) => t.data.id === id);
  if (!task) return out({ ok: false, message: `task ${id} not found`, errors: [] });

  if (kind === "handoff") {
    const target = handoffPath(root, id, config);
    if (action === "save") {
      const text = readStdin();
      if (!text.trim()) return out({ ok: false, message: "empty stdin", errors: [] });
      const tmp = `${target}.candidate`;
      atomicWrite(tmp, text);
      const res = validateHandoffForTask(root, task, { config, file: tmp });
      if (res.errors.length) {
        renameSync(tmp, `${target}.rejected`);
        appendEvent(root, { type: "handoff_rejected", task: id, errors: res.errors }, config);
        return out({ ok: false, message: `handoff for ${id} not saved (kept as ${rel(root, target)}.rejected)`, errors: res.errors, warnings: res.warnings });
      }
      renameSync(tmp, target);
      appendEvent(root, { type: "handoff_saved", task: id, status: res.data.status, agent: res.data.agent }, config);
      return out({ ok: true, message: `saved ${rel(root, target)}`, warnings: res.warnings });
    }
    const res = validateHandoffForTask(root, task, { config });
    if (!res.exists) return out({ ok: false, message: `${rel(root, target)} does not exist`, errors: [] });
    return out({ ok: res.errors.length === 0, message: `${rel(root, target)}`, errors: res.errors, warnings: res.warnings });
  }

  if (!["code", "security", "ui", "architecture"].includes(reviewKind)) throw new Error("review kind must be code|security|ui|architecture");
  const target = reviewPath(root, id, reviewKind, config);
  if (action === "save") {
    const text = readStdin();
    const errors = validateReviewText(text, task, reviewKind);
    if (errors.length) {
      appendEvent(root, { type: "review_rejected", task: id, kind: reviewKind, errors }, config);
      return out({ ok: false, message: `review not saved`, errors });
    }
    atomicWrite(target, text);
    const data = parseFrontmatter(text).data;
    appendEvent(root, {
      type: "review_saved", task: id, kind: reviewKind, reviewer: data.reviewer, verdict: data.verdict,
      findings: Object.fromEntries(["critical", "high", "medium", "low", "info"].map((s) => [s, data.findings.filter((f) => f.severity === s).length])),
    }, config);
    return out({ ok: true, message: `saved ${rel(root, target)}` });
  }
  if (!existsSync(target)) return out({ ok: false, message: `${rel(root, target)} does not exist`, errors: [] });
  const errors = validateReviewText(readFileSync(target, "utf8"), task, reviewKind);
  return out({ ok: errors.length === 0, message: rel(root, target), errors });
}

try {
  main();
} catch (e) {
  process.stderr.write(`reports.mjs: ${e.message}\n`);
  process.exitCode = 2;
}
