#!/usr/bin/env node
// Read-only, advisory Codex CLI review for a task.
//   node scripts/codex-review.mjs review <TASK-ID> [--uncommitted | --base <branch> | --commit <sha>]
//     [--root <dir>] [--timeout-ms N] [--model <id>] [--json]
//
// Never blocks the pipeline: if Codex isn't installed, exits 0 with a
// notice. If it runs, the resulting review is saved through the existing,
// unmodified scripts/reports.mjs (kind "codex" — advisory only; it counts
// toward the gate only if a task explicitly opts in via its own `review`
// list, see config/defaults.json `gates.required_reviews`).
import { spawnSync } from "node:child_process";
import { parseArgs, findProjectRoot, loadConfig, pluginFile, appendEvent } from "./lib/project.mjs";
import { loadTasks } from "./lib/tasks.mjs";
import { runCodexReview } from "./lib/codex-adapter.mjs";
import { buildReviewMarkdown } from "./lib/codex-review.mjs";

const args = parseArgs(process.argv.slice(2));
const json = Boolean(args.flags.json);
const cmd = args._[0];
const taskId = args._[1];

function diffSpecFromFlags(flags) {
  if (typeof flags.base === "string") return { mode: "base", ref: flags.base };
  if (typeof flags.commit === "string") return { mode: "commit", sha: flags.commit };
  return { mode: "uncommitted" };
}

function countBySeverity(findings) {
  const out = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) out[f.severity] = (out[f.severity] ?? 0) + 1;
  return out;
}

async function main() {
  if (cmd !== "review" || !taskId) throw new Error("usage: codex-review.mjs review <TASK-ID> [--uncommitted|--base <branch>|--commit <sha>] [--root <dir>] [--timeout-ms N] [--model <id>] [--json]");
  const root = args.flags.root ? String(args.flags.root) : findProjectRoot();
  const config = loadConfig(root);
  const task = loadTasks(root, config).tasks.find((t) => t.data.id === taskId);
  if (!task) { process.stderr.write(`task ${taskId} not found\n`); process.exitCode = 2; return; }

  const diffSpec = diffSpecFromFlags(args.flags);
  const timeoutMs = args.flags["timeout-ms"] ? Number(args.flags["timeout-ms"]) : undefined;
  const model = typeof args.flags.model === "string" ? args.flags.model : undefined;

  const result = await runCodexReview({ root, diffSpec, model, ...(timeoutMs ? { timeoutMs } : {}) });

  if (!result.ok && result.reason === "codex_not_installed") {
    const msg = "Codex CLI not installed/available; skipping advisory review (non-fatal)";
    process.stdout.write((json ? JSON.stringify({ ok: true, skipped: true, reason: msg }, null, 2) : msg) + "\n");
    return;
  }

  appendEvent(root, {
    type: "codex_review_run",
    task: taskId,
    exit_code: result.exitCode ?? null,
    duration_ms: result.durationMs,
    truncated: Boolean(result.truncated),
    timed_out: Boolean(result.timedOut),
    ok: result.ok,
    findings: result.ok ? countBySeverity(result.data.findings) : undefined,
  }, config);

  if (!result.ok) {
    const msg = `codex review failed: ${result.reason}`;
    process.stdout.write((json ? JSON.stringify({ ok: false, reason: result.reason }, null, 2) : msg) + "\n");
    process.exitCode = 1;
    return;
  }

  const markdown = buildReviewMarkdown({ task: taskId, model, diffSpec, summary: result.data.summary, findings: result.data.findings });
  const saveRes = spawnSync(process.execPath, [pluginFile("scripts", "reports.mjs"), "save", "review", taskId, "codex", "--root", root, "--json"], {
    input: markdown, encoding: "utf8",
  });
  const saved = (() => { try { return JSON.parse(saveRes.stdout); } catch { return { ok: false, message: saveRes.stderr || saveRes.stdout }; } })();

  process.stdout.write((json ? JSON.stringify(saved, null, 2) : saved.message ?? JSON.stringify(saved)) + "\n");
  process.exitCode = saved.ok ? 0 : 1;
}

main().catch((e) => {
  process.stderr.write(`codex-review.mjs: ${e.message}\n`);
  process.exitCode = 2;
});
