import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tempProject, cleanup, run } from "../helpers.mjs";

function add(root, flags, input) {
  return run("scripts/memory.mjs", ["add", "--root", root, "--json", ...flags], { input });
}

test("persists a record across separate process invocations (restart)", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  let r = add(root, ["--type", "gotcha", "--statement", "Windows paths need backslash handling.", "--source", "human:milan", "--confidence", "70"]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const { id } = JSON.parse(r.stdout);
  assert.equal(id, "MEM-0001");
  // Fresh process, same root: must read from disk, not from any cache.
  r = run("scripts/memory.mjs", ["get", id, "--root", root, "--json"]);
  assert.equal(r.code, 0, r.stdout);
  const got = JSON.parse(r.stdout);
  assert.equal(got.record.id, id);
  assert.equal(got.record.statement, "Windows paths need backslash handling.");
});

test("supersede keeps the old record's stored validity, computes effective status at read time", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  let r = add(root, ["--type", "decision", "--statement", "Use tabs for indentation.", "--source", "human:milan"]);
  const { id: oldId } = JSON.parse(r.stdout);
  r = run("scripts/memory.mjs", ["supersede", oldId, "--root", root, "--json", "--type", "decision", "--statement", "Use spaces for indentation.", "--source", "human:milan"]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const { id: newId } = JSON.parse(r.stdout);

  r = run("scripts/memory.mjs", ["get", oldId, "--root", root, "--json"]);
  const old = JSON.parse(r.stdout).record;
  assert.equal(old.validity, "active"); // stored field untouched
  assert.equal(old.effective_validity, "superseded"); // computed at read time

  r = run("scripts/memory.mjs", ["list", "--root", root, "--json"]);
  assert.deepEqual(JSON.parse(r.stdout).records.map((x) => x.id), [newId]);

  r = run("scripts/memory.mjs", ["list", "--all", "--root", root, "--json"]);
  assert.deepEqual(new Set(JSON.parse(r.stdout).records.map((x) => x.id)), new Set([oldId, newId]));
});

test("surfaces conflicting active decisions instead of silently picking one", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  add(root, ["--type", "decision", "--tags", "api", "--statement", "Use REST for the public API.", "--source", "human:milan"]);
  add(root, ["--type", "decision", "--tags", "api", "--statement", "Use GraphQL for the public API.", "--source", "human:milan"]);
  const r = run("scripts/memory.mjs", ["search", "API", "--root", root, "--json"]);
  assert.equal(r.code, 0, r.stdout);
  const result = JSON.parse(r.stdout);
  assert.equal(result.records.length, 2);
  assert.ok(result.warnings.length > 0, "expected a conflict warning");
});

test("a superseded fact never wins a search", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  let r = add(root, ["--type", "convention", "--statement", "Lint with the old config.", "--source", "human:milan"]);
  const { id } = JSON.parse(r.stdout);
  run("scripts/memory.mjs", ["supersede", id, "--root", root, "--json", "--type", "convention", "--statement", "Lint with the new config.", "--source", "human:milan"]);
  r = run("scripts/memory.mjs", ["search", "Lint", "--root", root, "--json"]);
  const result = JSON.parse(r.stdout);
  assert.equal(result.records.length, 1);
  assert.match(result.records[0].statement, /new config/);
  r = run("scripts/memory.mjs", ["search", "Lint", "--all", "--root", root, "--json"]);
  assert.equal(JSON.parse(r.stdout).records.length, 2);
});

test("cross-project isolation: records never leak between two project roots", (t) => {
  const rootA = tempProject();
  const rootB = tempProject();
  t.after(() => { cleanup(rootA); cleanup(rootB); });
  add(rootA, ["--type", "lesson", "--statement", "Root A lesson.", "--source", "human:milan"]);
  add(rootB, ["--type", "lesson", "--statement", "Root B lesson.", "--source", "human:milan"]);

  let r = run("scripts/memory.mjs", ["list", "--root", rootA, "--json"]);
  assert.deepEqual(JSON.parse(r.stdout).records.map((x) => x.statement), ["Root A lesson."]);
  r = run("scripts/memory.mjs", ["list", "--root", rootB, "--json"]);
  assert.deepEqual(JSON.parse(r.stdout).records.map((x) => x.statement), ["Root B lesson."]);

  // Hand-copy B's line into A's store: a foreign project_id must be flagged, not trusted.
  const bLine = readFileSync(join(rootB, "project-context/memory/records.jsonl"), "utf8").trim();
  const aFile = join(rootA, "project-context/memory/records.jsonl");
  appendFileSync(aFile, bLine + "\n");

  r = run("scripts/memory.mjs", ["validate", "--root", rootA, "--json"]);
  const validated = JSON.parse(r.stdout);
  assert.ok(validated.warnings.some((w) => w.includes("foreign project_id")));

  r = run("scripts/memory.mjs", ["list", "--root", rootA, "--json"]);
  assert.deepEqual(JSON.parse(r.stdout).records.map((x) => x.statement), ["Root A lesson."]);
});

test("malformed records are reported with line numbers and never crash a read", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  add(root, ["--type", "lesson", "--statement", "A valid record.", "--source", "human:milan"]);
  const file = join(root, "project-context/memory/records.jsonl");
  appendFileSync(file, "{not json\n");
  appendFileSync(file, JSON.stringify({ id: "MEM-9999", type: "lesson" }) + "\n"); // missing required fields

  let r = run("scripts/memory.mjs", ["validate", "--root", root, "--json"]);
  assert.equal(r.code, 1);
  const result = JSON.parse(r.stdout);
  assert.ok(result.errors.some((e) => e.includes("line 2")));
  assert.ok(result.errors.some((e) => e.includes("MEM-9999")));

  r = run("scripts/memory.mjs", ["list", "--root", root, "--json"]);
  assert.equal(r.code, 0, r.stdout);
  assert.deepEqual(JSON.parse(r.stdout).records.map((x) => x.statement), ["A valid record."]);
});

test("rejects secret-shaped content without writing it", (t) => {
  const root = tempProject();
  t.after(() => cleanup(root));
  let r = add(root, ["--type", "gotcha", "--statement", "AWS key AKIAABCDEFGHIJKLMNOP was committed.", "--source", "human:milan"]);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /secret/);

  r = add(root, ["--type", "gotcha", "--statement", "Something unrelated.", "--source", ".env"]);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /secret/);

  const file = join(root, "project-context/memory/records.jsonl");
  assert.equal(existsSync(file), false);
});
