// Pure logic for project memory: a single append-only JSONL log of
// decisions/requirements/conventions/gotchas/lessons/events. The store is
// never mutated in place (supersede is soft and resolved at read time) so
// it stays a trustworthy log the way reports/metrics/events.jsonl is.
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { validate as validateSchema } from "./schema.mjs";

const APPROVAL_RANK = { approved: 0, proposed: 1, rejected: 2 };

/** Filename-shaped secret references, mirroring hooks/lib/bash-rules.mjs SECRET_FILE. */
const SECRET_FILE_SOURCE = /(^|[\s"'/\\=<>(*?])(\.env(?!\.(example|sample|template|dist)\b)(\.[\w.*?-]+|\*)?|id_(rsa|dsa|ecdsa|ed25519)|[\w.*?-]*\.(pem|key|p12|pfx|jks)|credentials\.json|\.npmrc|\.netrc|\.pypirc|[\w.*?-]+\.tfvars)(?=["'\s;|&)<>]|$)/i;
/** Content-shaped secrets that must never be stored in a statement/tag. */
const SECRET_CONTENT_PATTERNS = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "PEM private key block"],
  [/\b(SECRET|TOKEN|PASSWORD|API_KEY|ACCESS_KEY)\s*=\s*\S+/i, "KEY=value secret assignment"],
  [/\bBearer\s+[A-Za-z0-9._-]{20,}/, "bearer token"],
];

export function readProjectId(memoryProjectIdPath) {
  if (existsSync(memoryProjectIdPath)) {
    const data = JSON.parse(readFileSync(memoryProjectIdPath, "utf8"));
    if (data?.project_id) return data.project_id;
  }
  const project_id = randomUUID();
  mkdirSync(dirname(memoryProjectIdPath), { recursive: true });
  const tmp = `${memoryProjectIdPath}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify({ project_id, created_at: new Date().toISOString() }, null, 2) + "\n");
  renameSync(tmp, memoryProjectIdPath);
  return project_id;
}

export function parseRecordLine(line, lineNo) {
  try {
    const record = JSON.parse(line);
    return { ok: true, lineNo, record };
  } catch (e) {
    return { ok: false, lineNo, error: e.message };
  }
}

export function validateRecord(schema, record) {
  return validateSchema(schema, record);
}

/** Best-effort, deliberately imperfect: see docs/architecture/memory.md Limitations. */
export function looksLikeSecret(record) {
  if (SECRET_FILE_SOURCE.test(record.source ?? "")) return { secret: true, reason: "source references a secret-bearing file" };
  const haystacks = [record.statement, ...(record.tags ?? [])].filter(Boolean);
  for (const text of haystacks) {
    for (const [re, reason] of SECRET_CONTENT_PATTERNS) {
      if (re.test(text)) return { secret: true, reason };
    }
  }
  return { secret: false };
}

/** Load every line of the store. Never throws; malformed lines are reported, not fatal. */
export function loadRecords(memoryPath) {
  if (!existsSync(memoryPath)) return { records: [], malformed: [] };
  const lines = readFileSync(memoryPath, "utf8").split("\n").filter((l) => l.trim() !== "");
  const records = [];
  const malformed = [];
  lines.forEach((line, i) => {
    const parsed = parseRecordLine(line, i + 1);
    if (parsed.ok) records.push(parsed.record);
    else malformed.push({ lineNo: parsed.lineNo, error: parsed.error });
  });
  return { records, malformed };
}

function isExpired(record, now = new Date()) {
  if (record.validity === "expired") return true;
  if (record.expires && new Date(`${record.expires}T00:00:00Z`) < now) return true;
  return false;
}

/**
 * Effective validity per record id: "active" | "superseded" | "expired".
 * Supersession is resolved by walking `supersedes` edges from every record
 * that is itself active; once superseded, a record stays superseded even
 * if the record that superseded it later expires (stale facts never win).
 */
export function effectiveValidity(records, now = new Date()) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const effective = new Map();
  for (const r of records) effective.set(r.id, isExpired(r, now) ? "expired" : "active");
  for (const r of records) {
    if (r.supersedes && byId.has(r.supersedes) && effective.get(r.id) !== "expired") {
      effective.set(r.supersedes, "superseded");
    }
  }
  return effective;
}

const tagKey = (tags) => [...(tags ?? [])].map((t) => t.toLowerCase()).sort().join(",");

/** Active records sharing type+tags with a differing statement: surfaced, never auto-resolved. */
export function detectConflicts(records, effective) {
  const groups = new Map();
  for (const r of records) {
    if (effective.get(r.id) !== "active") continue;
    const key = `${r.type}|${tagKey(r.tags)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const conflicts = [];
  for (const [key, group] of groups) {
    const distinctStatements = new Set(group.map((r) => r.statement));
    if (group.length > 1 && distinctStatements.size > 1) {
      conflicts.push({ key, records: group.map((r) => r.id) });
    }
  }
  return conflicts;
}

/** approved > proposed > rejected, then confidence desc, then created_at desc. */
export function rankRecords(records) {
  return [...records].sort((a, b) => {
    const byApproval = (APPROVAL_RANK[a.approval_status] ?? 9) - (APPROVAL_RANK[b.approval_status] ?? 9);
    if (byApproval !== 0) return byApproval;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.created_at.localeCompare(a.created_at);
  });
}

function matchesQuery(record, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const haystack = `${record.statement} ${record.source} ${(record.tags ?? []).join(" ")}`.toLowerCase();
  return haystack.includes(q);
}

export function searchRecords(records, { query, type, tags, includeAll = false, limit = 5 } = {}) {
  const effective = effectiveValidity(records);
  const conflicts = detectConflicts(records, effective);
  const conflictIds = new Set(conflicts.flatMap((c) => c.records));
  let filtered = records.filter((r) => {
    if (!includeAll && effective.get(r.id) !== "active") return false;
    if (type && r.type !== type) return false;
    if (tags?.length && !tags.every((t) => (r.tags ?? []).includes(t))) return false;
    return matchesQuery(r, query);
  });
  filtered = rankRecords(filtered).map((r) => ({
    ...r,
    effective_validity: effective.get(r.id),
    conflict: conflictIds.has(r.id),
  }));
  const limited = Number.isFinite(limit) && limit > 0 ? filtered.slice(0, limit) : filtered;
  const relevantConflicts = conflicts.filter((c) => c.records.some((id) => limited.some((r) => r.id === id)));
  return { records: limited, warnings: relevantConflicts.map((c) => `conflicting ${c.key.split("|")[0]} records: ${c.records.join(", ")}`) };
}

export function nextId(records) {
  const nums = records.map((r) => /^MEM-(\d+)$/.exec(r.id)?.[1]).filter(Boolean).map(Number);
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `MEM-${String(n).padStart(4, "0")}`;
}
