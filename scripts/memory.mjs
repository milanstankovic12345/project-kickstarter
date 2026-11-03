#!/usr/bin/env node
// Validated, local, persistent project memory. The only write path for
// project-context/memory/records.jsonl — see docs/architecture/memory.md.
//
//   node scripts/memory.mjs add [--type T --statement S --source Src --confidence N
//                                 --approval-status A --sensitivity Se --tags a,b
//                                 --expires YYYY-MM-DD --approved-by Name]   [< record.json]
//   node scripts/memory.mjs get <ID>
//   node scripts/memory.mjs list [--type T] [--tags a,b] [--all]
//   node scripts/memory.mjs search <query> [--type T] [--tags a,b] [--all] [--limit N=5]
//   node scripts/memory.mjs supersede <OLD-ID> [--type T --statement S ...]   [< record.json]
//   node scripts/memory.mjs validate
//   node scripts/memory.mjs export [--format jsonl|md] [--include-sensitive] [--out <path>]
// Options: --root <dir> --json
import { readFileSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs, findProjectRoot, loadConfig, frameworkPaths, loadSchema, rel, appendEvent } from "./lib/project.mjs";
import {
  readProjectId, loadRecords, validateRecord, looksLikeSecret,
  effectiveValidity, searchRecords, rankRecords, nextId,
} from "./lib/memory.mjs";

const args = parseArgs(process.argv.slice(2));
const root = args.flags.root ? String(args.flags.root) : findProjectRoot();
const json = Boolean(args.flags.json);
const [action, ...rest] = args._;

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

function splitList(v) {
  return v ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function recordFromFlags(flags) {
  const record = {};
  if (flags.type !== undefined) record.type = flags.type;
  if (flags.statement !== undefined) record.statement = flags.statement;
  if (flags.source !== undefined) record.source = flags.source;
  if (flags.confidence !== undefined) record.confidence = Number(flags.confidence);
  if (flags["approval-status"] !== undefined) record.approval_status = flags["approval-status"];
  if (flags.sensitivity !== undefined) record.sensitivity = flags.sensitivity;
  if (flags.tags !== undefined) record.tags = splitList(flags.tags);
  if (flags.expires !== undefined) record.expires = flags.expires;
  if (flags.validity !== undefined) record.validity = flags.validity;
  return record;
}

function readRecordBody() {
  const fromFlags = recordFromFlags(args.flags);
  if (Object.keys(fromFlags).length > 0) return fromFlags;
  const text = readStdin();
  if (!text.trim()) return null;
  try { return JSON.parse(text); } catch { return undefined; } // undefined signals "unparseable"
}

function atomicAppend(path, line) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, line + "\n");
}

function buildAndValidate(root, config, paths, schema, partial, { supersedes } = {}) {
  if (partial === undefined) return { errors: ["record body is not valid JSON"] };
  if (partial === null) return { errors: ["empty record body (pass --statement/--type/... or JSON on stdin)"] };
  const { id: _id, project_id: _pid, created_at: _ca, supersedes: _s, ...safePartial } = partial;
  const { records } = loadRecords(paths.memory);
  const record = {
    id: nextId(records),
    project_id: readProjectId(paths.memoryProjectId),
    created_at: new Date().toISOString(),
    approval_status: "proposed",
    validity: "active",
    tags: [],
    sensitivity: "public",
    supersedes: supersedes ?? null,
    ...safePartial,
  };
  if (partial.confidence === undefined) record.confidence = 50;
  const errors = validateRecord(schema, record).map((e) => `schema ${e}`);
  const secret = looksLikeSecret(record);
  if (secret.secret) errors.push(`rejected: looks like a secret (${secret.reason})`);
  if (record.sensitivity === "sensitive" && !args.flags["approved-by"]) {
    errors.push("sensitivity: sensitive records require --approved-by <name>");
  }
  if (record.sensitivity === "sensitive") record.approved_by = args.flags["approved-by"];
  return { record, errors };
}

function cmdAdd(config, paths, schema) {
  const partial = readRecordBody();
  const { record, errors } = buildAndValidate(root, config, paths, schema, partial);
  if (errors.length) {
    appendEvent(root, { type: "memory_rejected", errors }, config);
    return out({ ok: false, message: "record not added", errors });
  }
  atomicAppend(paths.memory, JSON.stringify(record));
  appendEvent(root, { type: "memory_added", id: record.id, record_type: record.type, sensitivity: record.sensitivity }, config);
  return out({ ok: true, message: `added ${record.id}`, id: record.id });
}

function cmdSupersede(config, paths, schema) {
  const oldId = rest[0];
  if (!oldId) return out({ ok: false, message: "usage: supersede <OLD-ID>", errors: ["missing OLD-ID"] });
  const { records } = loadRecords(paths.memory);
  const projectId = readProjectId(paths.memoryProjectId);
  const old = records.find((r) => r.id === oldId && r.project_id === projectId);
  if (!old) return out({ ok: false, message: `${oldId} not found in this project's memory`, errors: [] });
  const partial = readRecordBody();
  const { record, errors } = buildAndValidate(root, config, paths, schema, partial, { supersedes: oldId });
  if (errors.length) {
    appendEvent(root, { type: "memory_rejected", errors }, config);
    return out({ ok: false, message: "supersede not recorded", errors });
  }
  atomicAppend(paths.memory, JSON.stringify(record));
  appendEvent(root, { type: "memory_superseded", old: oldId, new: record.id }, config);
  return out({ ok: true, message: `${record.id} supersedes ${oldId}`, id: record.id });
}

function cmdGet(paths) {
  const id = rest[0];
  const { records } = loadRecords(paths.memory);
  const projectId = readProjectId(paths.memoryProjectId);
  const record = records.find((r) => r.id === id && r.project_id === projectId);
  if (!record) return out({ ok: false, message: `${id} not found`, errors: [] });
  const effective = effectiveValidity(records);
  return out({ ok: true, message: id, record: { ...record, effective_validity: effective.get(id) } });
}

function cmdList(paths) {
  const { records } = loadRecords(paths.memory);
  const projectId = readProjectId(paths.memoryProjectId);
  const local = records.filter((r) => r.project_id === projectId);
  const effective = effectiveValidity(local);
  const all = Boolean(args.flags.all);
  const type = args.flags.type;
  const tags = splitList(args.flags.tags);
  let filtered = local.filter((r) => {
    if (!all && effective.get(r.id) !== "active") return false;
    if (type && r.type !== type) return false;
    if (tags.length && !tags.every((t) => (r.tags ?? []).includes(t))) return false;
    return true;
  });
  filtered = rankRecords(filtered).map((r) => ({ ...r, effective_validity: effective.get(r.id) }));
  return out({ ok: true, message: `${filtered.length} record(s)`, records: filtered });
}

function cmdSearch(paths) {
  const query = rest.join(" ");
  const { records } = loadRecords(paths.memory);
  const projectId = readProjectId(paths.memoryProjectId);
  const local = records.filter((r) => r.project_id === projectId);
  const limit = args.flags.limit !== undefined ? Number(args.flags.limit) : 5;
  const result = searchRecords(local, {
    query, type: args.flags.type, tags: splitList(args.flags.tags),
    includeAll: Boolean(args.flags.all), limit,
  });
  return out({ ok: true, message: `${result.records.length} result(s)`, records: result.records, warnings: result.warnings });
}

function cmdValidate(paths, schema) {
  const { records, malformed } = loadRecords(paths.memory);
  const projectId = readProjectId(paths.memoryProjectId);
  const errors = malformed.map((m) => `line ${m.lineNo}: unparseable JSON (${m.error})`);
  const warnings = [];
  records.forEach((r, i) => {
    const schemaErrors = validateRecord(schema, r);
    for (const e of schemaErrors) errors.push(`record ${r.id ?? `#${i + 1}`}: ${e}`);
    if (r.project_id && r.project_id !== projectId) warnings.push(`record ${r.id}: foreign project_id (not this project's memory)`);
  });
  const ids = records.map((r) => r.id).filter(Boolean);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  for (const d of new Set(dupes)) errors.push(`duplicate id ${d}`);
  return out({ ok: errors.length === 0, message: `${records.length} record(s), ${malformed.length} malformed line(s)`, errors, warnings });
}

function cmdExport(paths) {
  const { records } = loadRecords(paths.memory);
  const projectId = readProjectId(paths.memoryProjectId);
  const includeSensitive = Boolean(args.flags["include-sensitive"]);
  const local = records.filter((r) => r.project_id === projectId && (includeSensitive || r.sensitivity !== "sensitive"));
  const format = args.flags.format ?? "jsonl";
  let text;
  if (format === "md") {
    const byType = new Map();
    for (const r of local) { if (!byType.has(r.type)) byType.set(r.type, []); byType.get(r.type).push(r); }
    text = [...byType.entries()]
      .map(([type, rs]) => `## ${type}\n\n` + rs.map((r) => `- **${r.id}** (${r.approval_status}, confidence ${r.confidence}): ${r.statement}`).join("\n"))
      .join("\n\n") + "\n";
  } else {
    text = local.map((r) => JSON.stringify(r)).join("\n") + (local.length ? "\n" : "");
  }
  // Export writes a local file or stdout only; nothing in this codebase ever
  // sends memory content over the network.
  if (args.flags.out) {
    writeFileSync(String(args.flags.out), text);
    return out({ ok: true, message: `exported ${local.length} record(s) to ${rel(root, String(args.flags.out))}` });
  }
  process.stdout.write(text);
  process.exitCode = 0;
}

function main() {
  const config = loadConfig(root);
  const paths = frameworkPaths(root, config);
  const schema = loadSchema("memory");
  switch (action) {
    case "add": return cmdAdd(config, paths, schema);
    case "supersede": return cmdSupersede(config, paths, schema);
    case "get": return cmdGet(paths);
    case "list": return cmdList(paths);
    case "search": return cmdSearch(paths);
    case "validate": return cmdValidate(paths, schema);
    case "export": return cmdExport(paths);
    default: throw new Error("usage: memory.mjs <add|get|list|search|supersede|validate|export> ...");
  }
}

try {
  main();
} catch (e) {
  process.stderr.write(`memory.mjs: ${e.message}\n`);
  process.exitCode = 2;
}
