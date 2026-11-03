import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCapabilities, listTools } from "../../scripts/lib/capabilities.mjs";
import { run } from "../helpers.mjs";

function tmpConfig(data) {
  const dir = mkdtempSync(join(tmpdir(), "pk-cap-"));
  const p = join(dir, "tool-capabilities.json");
  writeFileSync(p, JSON.stringify(data));
  return p;
}

test("the shipped manifest is valid and lists at least Codex, Cursor, Copilot, OpenCode, Gemini CLI", () => {
  const data = loadCapabilities();
  const tools = listTools(data);
  for (const name of ["cursor", "codex", "copilot", "opencode", "gemini-cli"]) {
    assert.ok(tools.some((t) => t.name === name), `missing ${name}`);
  }
});

test("no tool claims full_integration without cli_adapter support", () => {
  for (const t of listTools()) {
    if (t.full_integration.supported) assert.ok(t.cli_adapter.supported, `${t.name} claims full_integration without cli_adapter`);
  }
});

test("a tool claiming full_integration without cli_adapter is rejected", () => {
  const bad = {
    version: 1,
    tools: {
      fake: {
        label: "Fake",
        static_export: { supported: true, status: "VERIFIED", notes: "x" },
        cli_adapter: { supported: false, status: "NOT_SUPPORTED", notes: "x" },
        full_integration: { supported: true, status: "VERIFIED", notes: "x" },
      },
    },
  };
  assert.throws(() => loadCapabilities(tmpConfig(bad)), /full_integration without cli_adapter/);
});

test("a schema-invalid manifest (bad status enum) is rejected, not silently accepted", () => {
  const bad = {
    version: 1,
    tools: {
      fake: {
        label: "Fake",
        static_export: { supported: true, status: "TOTALLY_FINE", notes: "x" },
        cli_adapter: { supported: false, status: "NOT_SUPPORTED", notes: "x" },
        full_integration: { supported: false, status: "NOT_SUPPORTED", notes: "x" },
      },
    },
  };
  assert.throws(() => loadCapabilities(tmpConfig(bad)));
});

test("CLI: list and show exit 0 on the real manifest; show of an unknown tool exits 2 without a stack trace", () => {
  let r = run("scripts/capabilities.mjs", ["list", "--json"]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.ok(JSON.parse(r.stdout).tools.codex);
  r = run("scripts/capabilities.mjs", ["show", "codex", "--json"]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).cli_adapter.status, "VERIFIED");
  r = run("scripts/capabilities.mjs", ["show", "nonexistent-tool"]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /unknown tool/);
});

test("CLI: an invalid --config exits 2 with a clear message, not a crash", () => {
  const bad = {
    version: 1,
    tools: { fake: { label: "Fake", static_export: { supported: "yes" } } },
  };
  const r = run("scripts/capabilities.mjs", ["list", "--config", tmpConfig(bad)]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /invalid/);
});
