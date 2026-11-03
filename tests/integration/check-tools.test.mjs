// check-tools.mjs is a diagnostic: it must report cleanly whether codex/
// opencode are installed on THIS machine, without ever throwing or exiting
// non-zero either way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../helpers.mjs";

test("check-tools.mjs always exits 0 and reports a boolean-ish status per tool, installed or not", () => {
  const r = run("scripts/check-tools.mjs", ["--json"]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const { results } = JSON.parse(r.stdout);
  const codex = results.find((x) => x.tool === "codex");
  assert.ok(codex);
  assert.equal(typeof codex.installed, "boolean");
  const cursor = results.find((x) => x.tool === "cursor");
  assert.equal(cursor.installed, null, "cursor is a GUI tool and is not probed");
});

test("check-tools.mjs human output never crashes regardless of what's installed", () => {
  const r = run("scripts/check-tools.mjs", []);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /tool\s+status/);
});
