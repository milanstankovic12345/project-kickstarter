// Mocked-subprocess tests for the generic CLI-presence probe. No real
// process is ever spawned here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { detectCli } from "../../scripts/lib/cli-detect.mjs";

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.kill = () => { child.killed = true; child.emit("exit", null, "SIGTERM"); };
  return child;
}

test("installed CLI: exit 0 with version on stdout -> installed:true", async () => {
  const spawnImpl = () => {
    const child = fakeChild();
    queueMicrotask(() => { child.stdout.emit("data", "1.2.3\n"); child.emit("exit", 0); });
    return child;
  };
  const res = await detectCli({ bin: "codex", spawnImpl });
  assert.equal(res.installed, true);
  assert.equal(res.version, "1.2.3");
});

test("missing executable (ENOENT) -> installed:false, not_installed, never throws", async () => {
  const spawnImpl = () => { const e = new Error("spawn codex ENOENT"); e.code = "ENOENT"; throw e; };
  const res = await detectCli({ bin: "codex", spawnImpl });
  assert.equal(res.installed, false);
  assert.equal(res.reason, "not_installed");
});

test("ENOENT emitted via the error event is also not_installed", async () => {
  const spawnImpl = () => {
    const child = fakeChild();
    queueMicrotask(() => { const e = new Error("enoent"); e.code = "ENOENT"; child.emit("error", e); });
    return child;
  };
  const res = await detectCli({ bin: "opencode", spawnImpl });
  assert.equal(res.installed, false);
  assert.equal(res.reason, "not_installed");
});

test("non-zero exit -> installed:false, nonzero_exit", async () => {
  const spawnImpl = () => {
    const child = fakeChild();
    queueMicrotask(() => child.emit("exit", 1));
    return child;
  };
  const res = await detectCli({ bin: "codex", spawnImpl });
  assert.equal(res.installed, false);
  assert.equal(res.reason, "nonzero_exit");
  assert.equal(res.exitCode, 1);
});

test("hung process is killed and reported as timed_out", async () => {
  const spawnImpl = () => fakeChild(); // never exits on its own
  const res = await detectCli({ bin: "codex", spawnImpl, timeoutMs: 20 });
  assert.equal(res.installed, false);
  assert.equal(res.reason, "timed_out");
});

test("missing bin name throws (programmer error, not a runtime case)", async () => {
  await assert.rejects(() => detectCli({}), /requires a bin name/);
});
