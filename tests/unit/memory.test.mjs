import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSchema } from "../../scripts/lib/project.mjs";
import {
  readProjectId, validateRecord, looksLikeSecret, effectiveValidity,
  detectConflicts, rankRecords, searchRecords, nextId,
} from "../../scripts/lib/memory.mjs";

const schema = loadSchema("memory");
const PID = "11111111-1111-1111-1111-111111111111";

function rec(overrides = {}) {
  return {
    id: "MEM-0001",
    project_id: PID,
    type: "decision",
    statement: "Use Node's built-in test runner.",
    source: "human:milan",
    created_at: "2026-10-14T10:00:00Z",
    confidence: 80,
    approval_status: "approved",
    validity: "active",
    supersedes: null,
    tags: ["testing"],
    sensitivity: "public",
    ...overrides,
  };
}

test("validateRecord accepts a well-formed record and rejects a broken one", () => {
  assert.deepEqual(validateRecord(schema, rec()), []);
  const bad = rec({ approval_status: "maybe", statement: "" });
  const errors = validateRecord(schema, bad);
  assert.ok(errors.some((e) => e.includes("approval_status")));
  assert.ok(errors.some((e) => e.includes("statement")));
});

test("effectiveValidity marks the superseded record while its stored validity is untouched", () => {
  const a = rec({ id: "MEM-0001" });
  const b = rec({ id: "MEM-0002", supersedes: "MEM-0001", statement: "Use Node's built-in test runner (v2)." });
  const effective = effectiveValidity([a, b]);
  assert.equal(effective.get("MEM-0001"), "superseded");
  assert.equal(effective.get("MEM-0002"), "active");
  assert.equal(a.validity, "active"); // stored field never mutated
});

test("effectiveValidity resolves a supersede chain: A<-B<-C", () => {
  const a = rec({ id: "MEM-0001" });
  const b = rec({ id: "MEM-0002", supersedes: "MEM-0001" });
  const c = rec({ id: "MEM-0003", supersedes: "MEM-0002" });
  const effective = effectiveValidity([a, b, c]);
  assert.equal(effective.get("MEM-0001"), "superseded");
  assert.equal(effective.get("MEM-0002"), "superseded");
  assert.equal(effective.get("MEM-0003"), "active");
});

test("rankRecords orders approved > proposed > rejected, then confidence desc, then created_at desc", () => {
  const records = [
    rec({ id: "MEM-0001", approval_status: "proposed", confidence: 90, created_at: "2026-10-14T10:00:00Z" }),
    rec({ id: "MEM-0002", approval_status: "approved", confidence: 50, created_at: "2026-10-14T09:00:00Z" }),
    rec({ id: "MEM-0003", approval_status: "approved", confidence: 90, created_at: "2026-10-14T11:00:00Z" }),
    rec({ id: "MEM-0004", approval_status: "rejected", confidence: 99, created_at: "2026-10-14T12:00:00Z" }),
  ];
  assert.deepEqual(rankRecords(records).map((r) => r.id), ["MEM-0003", "MEM-0002", "MEM-0001", "MEM-0004"]);
});

test("searchRecords excludes superseded/expired records by default, includes them with includeAll", () => {
  const a = rec({ id: "MEM-0001", statement: "Old convention about linting." });
  const b = rec({ id: "MEM-0002", supersedes: "MEM-0001", statement: "New convention about linting." });
  const expired = rec({ id: "MEM-0003", statement: "Temporary linting exception.", expires: "2020-01-01" });
  const records = [a, b, expired];
  const active = searchRecords(records, { query: "linting" });
  assert.deepEqual(active.records.map((r) => r.id), ["MEM-0002"]);
  const all = searchRecords(records, { query: "linting", includeAll: true, limit: 0 });
  assert.deepEqual(new Set(all.records.map((r) => r.id)), new Set(["MEM-0001", "MEM-0002", "MEM-0003"]));
});

test("detectConflicts surfaces differing active statements instead of picking a winner", () => {
  const a = rec({ id: "MEM-0001", type: "decision", tags: ["api"], statement: "Use REST." });
  const b = rec({ id: "MEM-0002", type: "decision", tags: ["api"], statement: "Use GraphQL." });
  const effective = effectiveValidity([a, b]);
  const conflicts = detectConflicts([a, b], effective);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(new Set(conflicts[0].records), new Set(["MEM-0001", "MEM-0002"]));

  const result = searchRecords([a, b], { query: "" });
  assert.equal(result.records.length, 2);
  assert.ok(result.warnings.length > 0);
});

test("looksLikeSecret rejects secret-shaped content and accepts ordinary prose", () => {
  assert.equal(looksLikeSecret(rec({ source: ".env" })).secret, true);
  assert.equal(looksLikeSecret(rec({ statement: "AWS key AKIAABCDEFGHIJKLMNOP leaked in logs." })).secret, true);
  assert.equal(looksLikeSecret(rec({ statement: "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----" })).secret, true);
  assert.equal(looksLikeSecret(rec({ statement: "SECRET=abcd1234efgh5678" })).secret, true);
  assert.equal(looksLikeSecret(rec({ statement: "Never log the user's password in plaintext." })).secret, false);
});

test("readProjectId creates a project id once and returns the same id on a later call", () => {
  const dir = mkdtempSync(join(tmpdir(), "pk-mem-"));
  const file = join(dir, "project-context", "memory", "project-id.json");
  const first = readProjectId(file);
  const second = readProjectId(file);
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f-]{36}$/);
});

test("nextId produces sequential MEM-NNNN ids", () => {
  assert.equal(nextId([]), "MEM-0001");
  assert.equal(nextId([rec({ id: "MEM-0001" }), rec({ id: "MEM-0007" })]), "MEM-0008");
});
