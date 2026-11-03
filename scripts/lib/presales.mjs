// Pure logic for presales records: two JSONL logs (briefs and plans)
// extracted/drafted from untrusted freelance-ad text. Mirrors
// scripts/lib/memory.mjs's shape (schema-validated, project isolated) but
// is its own store, and unlike memory's immutable log, `approve` rewrites
// a line's approval_status/approved_by in place — see
// docs/architecture/presales.md.
import { existsSync, readFileSync } from "node:fs";
import { validate as validateSchema } from "./schema.mjs";

/** Filename-shaped secret references, mirroring hooks/lib/bash-rules.mjs SECRET_FILE. */
const SECRET_FILE_SOURCE = /(^|[\s"'/\\=<>(*?])(\.env(?!\.(example|sample|template|dist)\b)(\.[\w.*?-]+|\*)?|id_(rsa|dsa|ecdsa|ed25519)|[\w.*?-]*\.(pem|key|p12|pfx|jks)|credentials\.json|\.npmrc|\.netrc|\.pypirc|[\w.*?-]+\.tfvars)(?=["'\s;|&)<>]|$)/i;
/** Content-shaped secrets that must never be stored in presales free text. */
const SECRET_CONTENT_PATTERNS = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "PEM private key block"],
  [/\b(SECRET|TOKEN|PASSWORD|API_KEY|ACCESS_KEY)\s*=\s*\S+/i, "KEY=value secret assignment"],
  [/\bBearer\s+[A-Za-z0-9._-]{20,}/, "bearer token"],
];

/** Best-effort, deliberately imperfect: see docs/architecture/presales.md Limitations. */
export function looksLikeSecret({ source, texts = [] }) {
  if (SECRET_FILE_SOURCE.test(source ?? "")) return { secret: true, reason: "source references a secret-bearing file" };
  for (const text of texts.filter(Boolean)) {
    for (const [re, reason] of SECRET_CONTENT_PATTERNS) {
      if (re.test(text)) return { secret: true, reason };
    }
  }
  return { secret: false };
}

export function validateRecord(schema, record) {
  return validateSchema(schema, record);
}

/** Load every line of a JSONL store. Never throws; malformed lines are reported, not fatal. */
export function loadRecords(path) {
  if (!existsSync(path)) return { records: [], malformed: [] };
  const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim() !== "");
  const records = [];
  const malformed = [];
  lines.forEach((line, i) => {
    try { records.push(JSON.parse(line)); }
    catch (e) { malformed.push({ lineNo: i + 1, error: e.message }); }
  });
  return { records, malformed };
}

export function nextId(records, prefix) {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const nums = records.map((r) => re.exec(r.id)?.[1]).filter(Boolean).map(Number);
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

const MONTHS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/i;

/**
 * Non-blocking lint: flags a `deadline` that has no date-like substring
 * anywhere in `original_description`. Cannot prove fabrication (a paraphrase
 * like "two weeks from now" is legitimate and won't match), only that the
 * literal source text contains no supporting date token.
 */
export function deadlineWarning(deadline, originalDescription) {
  if (!deadline) return null;
  const text = originalDescription ?? "";
  const year = deadline.slice(0, 4);
  const hasIsoDate = text.includes(deadline);
  const hasYear = text.includes(year);
  const hasSlashDate = /\b\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?\b/.test(text);
  const hasRelativeDate = /\b\d{1,2}\s*(day|days|week|weeks|month|months)\b/i.test(text);
  const hasMonthName = MONTHS.test(text);
  if (hasIsoDate || hasYear || hasSlashDate || hasRelativeDate || hasMonthName) return null;
  return "deadline is set but no date-like substring was found in original_description; verify before approving";
}

/**
 * Non-blocking lint: flags a budget min/max that has no matching numeric
 * substring anywhere in `original_description`. Same limitation as
 * deadlineWarning: cannot prove fabrication, only absence of a literal match.
 */
export function budgetWarning(budget, originalDescription) {
  if (!budget) return null;
  const text = originalDescription ?? "";
  const candidates = [budget.min, budget.max].filter((n) => typeof n === "number");
  if (!candidates.length) return null;
  const matches = candidates.some((n) => {
    const plain = String(Math.trunc(n));
    const withSeparators = n.toLocaleString("en-US");
    return text.includes(plain) || text.includes(withSeparators);
  });
  if (matches) return null;
  return "budget min/max is set but no matching figure was found in original_description; verify before approving";
}
