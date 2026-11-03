// Read-only adapter around the real Codex CLI (`codex exec review`).
// Never writes code, never pushes, never bypasses its sandbox. Every call
// is a single argv-array spawn with shell:false; no text is ever
// interpolated into a shell string.
import { execFile as nodeExecFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validate as validateSchema } from "./schema.mjs";
import { loadSchema, findProjectRoot } from "./project.mjs";

const MAX_OUTPUT_FILE_BYTES = 2 * 1024 * 1024;

function diffArgs(diffSpec) {
  if (!diffSpec || diffSpec.mode === "uncommitted") return ["--uncommitted"];
  if (diffSpec.mode === "base") return ["--base", diffSpec.ref];
  if (diffSpec.mode === "commit") return ["--commit", diffSpec.sha];
  throw new Error(`unknown diffSpec.mode "${diffSpec?.mode}"`);
}

function readCapped(path, maxBytes) {
  const buf = readFileSync(path);
  return buf.length > maxBytes ? buf.subarray(0, maxBytes).toString("utf8") : buf.toString("utf8");
}

/**
 * Run a read-only Codex CLI review and return a structured, schema-validated
 * result. Never throws for ordinary failure modes (missing executable,
 * timeout, non-zero exit, malformed output) — those come back as
 * { ok:false, reason, ... }. Only programmer errors (bad arguments, a root
 * outside the project) throw, so callers fail loudly before ever spawning.
 */
export async function runCodexReview({
  root,
  diffSpec,
  title,
  model,
  timeoutMs = 120_000,
  maxStdoutBytes = 2 * 1024 * 1024,
  maxStderrBytes = 64 * 1024,
  signal,
  spawnImpl = nodeExecFile,
  cwdOverride, // test-only: simulate a caller-supplied cwd distinct from `root`
} = {}) {
  const projectRoot = realpathSync(findProjectRoot(root));
  const targetDir = realpathSync(cwdOverride ?? root);
  const withinProjectRoot = targetDir === projectRoot || targetDir.startsWith(projectRoot + "\\") || targetDir.startsWith(projectRoot + "/");
  if (!withinProjectRoot) {
    throw new Error(`codex review root "${targetDir}" is outside the project root "${projectRoot}" (not within project root)`);
  }

  const workDir = mkdtempSync(join(tmpdir(), "pk-codex-"));
  const outFile = join(workDir, "last-message.json");
  const schemaFile = join(workDir, "output-schema.json");
  writeFileSync(schemaFile, JSON.stringify(loadSchema("codex-review-output")));

  const args = [
    "exec", "review",
    ...diffArgs(diffSpec),
    "-C", targetDir,
    "--json",
    "-o", outFile,
    "--output-schema", schemaFile,
    ...(title ? ["--title", title] : []),
    ...(model ? ["-m", model] : []),
  ];

  const startedAt = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let timer = null;
    let stdoutBytes = 0, stderrBytes = 0, truncated = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { rmSync(workDir, { recursive: true, force: true }); } catch { /* best effort cleanup */ }
      resolve({ durationMs: Date.now() - startedAt, truncated, ...result });
    };

    let child;
    try {
      child = spawnImpl("codex", args, { shell: false, signal });
    } catch (e) {
      if (e && e.code === "ENOENT") return finish({ ok: false, reason: "codex_not_installed" });
      return finish({ ok: false, reason: "spawn_error", message: e.message });
    }

    timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch { /* already gone */ }
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxStdoutBytes) truncated = true;
    });
    child.stderr?.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > maxStderrBytes) truncated = true;
    });
    child.on("error", (e) => {
      if (e && e.code === "ENOENT") return finish({ ok: false, reason: "codex_not_installed" });
      return finish({ ok: false, reason: "spawn_error", message: e.message });
    });
    child.on("exit", (code) => {
      if (timedOut) return finish({ ok: false, reason: "timed_out", timedOut: true, exitCode: code });
      if (signal?.aborted) return finish({ ok: false, reason: "cancelled" });
      if (code !== 0) return finish({ ok: false, reason: "nonzero_exit", exitCode: code });
      let raw;
      try {
        raw = readCapped(outFile, MAX_OUTPUT_FILE_BYTES);
      } catch {
        return finish({ ok: false, reason: "malformed_output", exitCode: code });
      }
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return finish({ ok: false, reason: "malformed_output", exitCode: code });
      }
      const errors = validateSchema(loadSchema("codex-review-output"), data);
      if (errors.length) return finish({ ok: false, reason: "malformed_output", exitCode: code, schemaErrors: errors });
      return finish({ ok: true, exitCode: code, data });
    });
  });
}
