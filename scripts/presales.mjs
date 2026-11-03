#!/usr/bin/env node
// Validated, local, persistent presales records. The only write path for
// project-context/presales/{briefs,plans}.jsonl — see
// docs/architecture/presales.md. Presales is analysis/estimation only; this
// script never shells out on, nor interprets, extracted ad text.
//
//   node scripts/presales.mjs brief add [--opportunity-id --source --original-description
//                                          --budget-stated --budget-min --budget-max --budget-type
//                                          --currency --eligibility --deadline
//                                          --known-facts a;;b --unknown-facts a;;b
//                                          --constraints a;;b --sensitivity --approved-by]   [< brief.json]
//   node scripts/presales.mjs brief get <ID>
//   node scripts/presales.mjs brief list [--all]
//   node scripts/presales.mjs brief approve <ID> --approved-by <name>
//   node scripts/presales.mjs brief validate
//   node scripts/presales.mjs brief export [--format jsonl|md] [--out <path>]
//
//   node scripts/presales.mjs plan add [--brief-id BRIEF-xxxx --scope ... --confidence N
//                                         --evidence-references a;;b --recommended-design ...]  [< plan.json]
//   node scripts/presales.mjs plan get|list|approve|validate|export   (same shape as brief)
// Options everywhere: --root <dir> --json
import { readFileSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs, findProjectRoot, loadConfig, frameworkPaths, loadSchema, rel, appendEvent } from "./lib/project.mjs";
import { readProjectId } from "./lib/memory.mjs";
import { loadRecords, validateRecord, looksLikeSecret, nextId, deadlineWarning, budgetWarning } from "./lib/presales.mjs";

const args = parseArgs(process.argv.slice(2));
const root = args.flags.root ? String(args.flags.root) : findProjectRoot();
const json = Boolean(args.flags.json);
const [kind, action, ...rest] = args._;

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
  return v ? String(v).split(";;").map((s) => s.trim()).filter(Boolean) : [];
}

/** Number(v), but a non-numeric flag stays a string so schema validation rejects it
 * instead of silently coercing to NaN (which JSON.stringify would turn into null). */
function strictNumber(v) {
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}

function atomicAppend(path, line) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, line + "\n");
}

function briefFromFlags(flags) {
  const record = {};
  if (flags["opportunity-id"] !== undefined) record.opportunity_id = flags["opportunity-id"];
  if (flags.source !== undefined) record.source = flags.source;
  if (flags["original-description"] !== undefined) record.original_description = flags["original-description"];
  if (flags["budget-stated"] !== undefined || flags["budget-min"] !== undefined || flags["budget-max"] !== undefined || flags["budget-type"] !== undefined) {
    record.budget = {
      stated: flags["budget-stated"] ?? null,
      min: flags["budget-min"] !== undefined ? strictNumber(flags["budget-min"]) : null,
      max: flags["budget-max"] !== undefined ? strictNumber(flags["budget-max"]) : null,
      type: flags["budget-type"] ?? "unspecified",
    };
  }
  if (flags.currency !== undefined) record.currency = flags.currency;
  if (flags.eligibility !== undefined) record.eligibility = flags.eligibility;
  if (flags.deadline !== undefined) record.deadline = flags.deadline;
  if (flags["known-facts"] !== undefined) record.known_facts = splitList(flags["known-facts"]);
  if (flags["unknown-facts"] !== undefined) record.unknown_facts = splitList(flags["unknown-facts"]);
  if (flags.constraints !== undefined) record.constraints = splitList(flags.constraints);
  if (flags.sensitivity !== undefined) record.sensitivity = flags.sensitivity;
  if (flags["extraction-notes"] !== undefined) record.extraction_notes = flags["extraction-notes"];
  return record;
}

function planFromFlags(flags) {
  const record = {};
  if (flags["brief-id"] !== undefined) record.brief_id = flags["brief-id"];
  if (flags.scope !== undefined) record.scope = flags.scope;
  if (flags["recommended-design"] !== undefined) record.recommended_design = flags["recommended-design"];
  if (flags["technology-stack"] !== undefined) record.technology_stack = splitList(flags["technology-stack"]);
  if (flags["estimate-assumptions"] !== undefined) record.estimate_assumptions = splitList(flags["estimate-assumptions"]);
  if (flags.dependencies !== undefined) record.dependencies = splitList(flags.dependencies);
  if (flags["client-questions"] !== undefined) record.client_questions = splitList(flags["client-questions"]);
  if (flags["acceptance-criteria"] !== undefined) record.acceptance_criteria = splitList(flags["acceptance-criteria"]);
  if (flags["evidence-references"] !== undefined) record.evidence_references = splitList(flags["evidence-references"]);
  if (flags.confidence !== undefined) record.confidence = strictNumber(flags.confidence);
  if (flags["min-days"] !== undefined || flags["max-days"] !== undefined) {
    record.effort_range = {
      min_days: flags["min-days"] !== undefined ? strictNumber(flags["min-days"]) : 0,
      max_days: flags["max-days"] !== undefined ? strictNumber(flags["max-days"]) : 0,
    };
  }
  return record;
}

function readRecordBody(fromFlags) {
  if (Object.keys(fromFlags).length > 0) return fromFlags;
  const text = readStdin();
  if (!text.trim()) return null;
  try { return JSON.parse(text); } catch { return undefined; } // undefined signals "unparseable"
}

// ---- brief --------------------------------------------------------------

function buildBrief(paths, partial) {
  if (partial === undefined) return { errors: ["record body is not valid JSON"] };
  if (partial === null) return { errors: ["empty record body (pass --original-description/... or JSON on stdin)"] };
  const { id: _id, project_id: _pid, created_at: _ca, approval_status: _as, ...safePartial } = partial;
  const { records } = loadRecords(paths.presalesBriefs);
  const record = {
    id: nextId(records, "BRIEF"),
    project_id: readProjectId(paths.memoryProjectId),
    created_at: new Date().toISOString(),
    approval_status: "proposed",
    sensitivity: "public",
    currency: "UNSPECIFIED",
    eligibility: "UNKNOWN",
    deadline: null,
    known_facts: [],
    unknown_facts: [],
    constraints: [],
    ...safePartial,
  };
  const errors = validateRecord(loadSchema("client-brief"), record).map((e) => `schema ${e}`);
  const secret = looksLikeSecret({ source: record.source, texts: [record.original_description, ...(record.known_facts ?? []), record.extraction_notes] });
  if (secret.secret) errors.push(`rejected: looks like a secret (${secret.reason})`);
  if (record.sensitivity === "sensitive" && !args.flags["approved-by"]) {
    errors.push("sensitivity: sensitive records require --approved-by <name>");
  }
  if (!errors.length) {
    const warnings = [deadlineWarning(record.deadline, record.original_description), budgetWarning(record.budget, record.original_description)].filter(Boolean);
    if (warnings.length) record.warnings = warnings;
  }
  return { record, errors };
}

function cmdBriefAdd(config, paths) {
  const partial = readRecordBody(briefFromFlags(args.flags));
  const { record, errors } = buildBrief(paths, partial);
  if (errors.length) {
    appendEvent(root, { type: "presales_brief_rejected", errors }, config);
    return out({ ok: false, message: "brief not added", errors });
  }
  atomicAppend(paths.presalesBriefs, JSON.stringify(record));
  appendEvent(root, { type: "presales_brief_added", id: record.id, eligibility: record.eligibility }, config);
  return out({ ok: true, message: `added ${record.id}`, id: record.id, warnings: record.warnings ?? [] });
}

function cmdBriefApprove(paths, config) {
  const id = rest[0];
  if (!id) return out({ ok: false, message: "usage: brief approve <ID> --approved-by <name>", errors: ["missing ID"] });
  const approvedBy = args.flags["approved-by"];
  if (!approvedBy) return out({ ok: false, message: "approve requires --approved-by <name>", errors: ["missing --approved-by"] });
  const { records } = loadRecords(paths.presalesBriefs);
  const projectId = readProjectId(paths.memoryProjectId);
  const idx = records.findIndex((r) => r.id === id && r.project_id === projectId);
  if (idx === -1) return out({ ok: false, message: `${id} not found in this project's briefs`, errors: [] });
  const updated = { ...records[idx], approval_status: "approved", approved_by: approvedBy };
  const errors = validateRecord(loadSchema("client-brief"), updated).map((e) => `schema ${e}`);
  if (errors.length) return out({ ok: false, message: "approval rejected", errors });
  const lines = records.map((r, i) => JSON.stringify(i === idx ? updated : r));
  writeFileSync(paths.presalesBriefs, lines.join("\n") + (lines.length ? "\n" : ""));
  appendEvent(root, { type: "presales_brief_approved", id, approved_by: approvedBy }, config);
  return out({ ok: true, message: `${id} approved`, id });
}

function cmdBriefGet(paths) {
  const id = rest[0];
  const { records } = loadRecords(paths.presalesBriefs);
  const projectId = readProjectId(paths.memoryProjectId);
  const record = records.find((r) => r.id === id && r.project_id === projectId);
  if (!record) return out({ ok: false, message: `${id} not found`, errors: [] });
  return out({ ok: true, message: id, record });
}

function cmdBriefList(paths) {
  const { records } = loadRecords(paths.presalesBriefs);
  const projectId = readProjectId(paths.memoryProjectId);
  const local = records.filter((r) => r.project_id === projectId);
  const all = Boolean(args.flags.all);
  const filtered = all ? local : local.filter((r) => r.approval_status !== "rejected");
  return out({ ok: true, message: `${filtered.length} brief(s)`, records: filtered });
}

function cmdBriefValidate(paths) {
  const { records, malformed } = loadRecords(paths.presalesBriefs);
  const projectId = readProjectId(paths.memoryProjectId);
  const errors = malformed.map((m) => `line ${m.lineNo}: unparseable JSON (${m.error})`);
  const warnings = [];
  records.forEach((r, i) => {
    const schemaErrors = validateRecord(loadSchema("client-brief"), r);
    for (const e of schemaErrors) errors.push(`record ${r.id ?? `#${i + 1}`}: ${e}`);
    if (r.project_id && r.project_id !== projectId) warnings.push(`record ${r.id}: foreign project_id (not this project's briefs)`);
  });
  const ids = records.map((r) => r.id).filter(Boolean);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  for (const d of new Set(dupes)) errors.push(`duplicate id ${d}`);
  return out({ ok: errors.length === 0, message: `${records.length} brief(s), ${malformed.length} malformed line(s)`, errors, warnings });
}

function cmdBriefExport(paths) {
  const { records } = loadRecords(paths.presalesBriefs);
  const projectId = readProjectId(paths.memoryProjectId);
  const includeSensitive = Boolean(args.flags["include-sensitive"]);
  const local = records.filter((r) => r.project_id === projectId && (includeSensitive || r.sensitivity !== "sensitive"));
  const format = args.flags.format ?? "jsonl";
  let text;
  if (format === "md") {
    text = local.map((r) => `## ${r.id} (${r.approval_status}, eligibility ${r.eligibility})\n\n${r.scope ?? r.original_description}`).join("\n\n") + "\n";
  } else {
    text = local.map((r) => JSON.stringify(r)).join("\n") + (local.length ? "\n" : "");
  }
  if (args.flags.out) {
    writeFileSync(String(args.flags.out), text);
    return out({ ok: true, message: `exported ${local.length} brief(s) to ${rel(root, String(args.flags.out))}` });
  }
  process.stdout.write(text);
  process.exitCode = 0;
}

// ---- plan -----------------------------------------------------------------

function buildPlan(paths, partial) {
  if (partial === undefined) return { errors: ["record body is not valid JSON"] };
  if (partial === null) return { errors: ["empty record body (pass --brief-id/--scope/... or JSON on stdin)"] };
  const { id: _id, project_id: _pid, created_at: _ca, approval_status: _as, ...safePartial } = partial;
  const briefId = safePartial.brief_id;
  if (!briefId) return { errors: ["plan requires --brief-id <BRIEF-xxxx>"] };
  const projectId = readProjectId(paths.memoryProjectId);
  const { records: briefs } = loadRecords(paths.presalesBriefs);
  const brief = briefs.find((b) => b.id === briefId && b.project_id === projectId);
  if (!brief) return { errors: [`brief ${briefId} not found in this project`] };
  if (brief.approval_status !== "approved") return { errors: [`brief ${briefId} is not approved (status: ${brief.approval_status}); a plan may only cite an approved brief`] };
  const { records: plans } = loadRecords(paths.presalesPlans);
  const record = {
    id: nextId(plans, "PLAN"),
    project_id: projectId,
    created_at: new Date().toISOString(),
    approval_status: "proposed",
    architecture_options: [],
    technology_stack: [],
    milestones: [],
    estimate_assumptions: [],
    risks: [],
    dependencies: [],
    client_questions: [],
    acceptance_criteria: [],
    evidence_references: [],
    confidence: 50,
    effort_range: { min_days: 0, max_days: 0 },
    ...safePartial,
  };
  const errors = validateRecord(loadSchema("presales-plan"), record).map((e) => `schema ${e}`);
  const texts = [record.scope, record.recommended_design, ...(record.estimate_assumptions ?? []), ...(record.risks ?? []).map((r) => r.description)];
  const secret = looksLikeSecret({ texts });
  if (secret.secret) errors.push(`rejected: looks like a secret (${secret.reason})`);
  return { record, errors };
}

function cmdPlanAdd(config, paths) {
  const partial = readRecordBody(planFromFlags(args.flags));
  const { record, errors } = buildPlan(paths, partial);
  if (errors.length) {
    appendEvent(root, { type: "presales_plan_rejected", errors }, config);
    return out({ ok: false, message: "plan not added", errors });
  }
  atomicAppend(paths.presalesPlans, JSON.stringify(record));
  appendEvent(root, { type: "presales_plan_added", id: record.id, brief_id: record.brief_id }, config);
  return out({ ok: true, message: `added ${record.id}`, id: record.id });
}

function cmdPlanApprove(paths, config) {
  const id = rest[0];
  if (!id) return out({ ok: false, message: "usage: plan approve <ID> --approved-by <name>", errors: ["missing ID"] });
  const approvedBy = args.flags["approved-by"];
  if (!approvedBy) return out({ ok: false, message: "approve requires --approved-by <name>", errors: ["missing --approved-by"] });
  const { records } = loadRecords(paths.presalesPlans);
  const projectId = readProjectId(paths.memoryProjectId);
  const idx = records.findIndex((r) => r.id === id && r.project_id === projectId);
  if (idx === -1) return out({ ok: false, message: `${id} not found in this project's plans`, errors: [] });
  const updated = { ...records[idx], approval_status: "approved", approved_by: approvedBy };
  const errors = validateRecord(loadSchema("presales-plan"), updated).map((e) => `schema ${e}`);
  if (errors.length) return out({ ok: false, message: "approval rejected", errors });
  const lines = records.map((r, i) => JSON.stringify(i === idx ? updated : r));
  writeFileSync(paths.presalesPlans, lines.join("\n") + (lines.length ? "\n" : ""));
  appendEvent(root, { type: "presales_plan_approved", id, approved_by: approvedBy }, config);
  return out({ ok: true, message: `${id} approved`, id });
}

function cmdPlanGet(paths) {
  const id = rest[0];
  const { records } = loadRecords(paths.presalesPlans);
  const projectId = readProjectId(paths.memoryProjectId);
  const record = records.find((r) => r.id === id && r.project_id === projectId);
  if (!record) return out({ ok: false, message: `${id} not found`, errors: [] });
  return out({ ok: true, message: id, record });
}

function cmdPlanList(paths) {
  const { records } = loadRecords(paths.presalesPlans);
  const projectId = readProjectId(paths.memoryProjectId);
  const local = records.filter((r) => r.project_id === projectId);
  const all = Boolean(args.flags.all);
  const filtered = all ? local : local.filter((r) => r.approval_status !== "rejected");
  return out({ ok: true, message: `${filtered.length} plan(s)`, records: filtered });
}

function cmdPlanValidate(paths) {
  const { records, malformed } = loadRecords(paths.presalesPlans);
  const projectId = readProjectId(paths.memoryProjectId);
  const errors = malformed.map((m) => `line ${m.lineNo}: unparseable JSON (${m.error})`);
  const warnings = [];
  records.forEach((r, i) => {
    const schemaErrors = validateRecord(loadSchema("presales-plan"), r);
    for (const e of schemaErrors) errors.push(`record ${r.id ?? `#${i + 1}`}: ${e}`);
    if (r.project_id && r.project_id !== projectId) warnings.push(`record ${r.id}: foreign project_id (not this project's plans)`);
  });
  const ids = records.map((r) => r.id).filter(Boolean);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  for (const d of new Set(dupes)) errors.push(`duplicate id ${d}`);
  return out({ ok: errors.length === 0, message: `${records.length} plan(s), ${malformed.length} malformed line(s)`, errors, warnings });
}

function cmdPlanExport(paths) {
  const { records } = loadRecords(paths.presalesPlans);
  const projectId = readProjectId(paths.memoryProjectId);
  const local = records.filter((r) => r.project_id === projectId);
  const format = args.flags.format ?? "jsonl";
  let text;
  if (format === "md") {
    text = local.map((r) => `## ${r.id} (${r.approval_status}, confidence ${r.confidence})\n\n${r.scope}`).join("\n\n") + "\n";
  } else {
    text = local.map((r) => JSON.stringify(r)).join("\n") + (local.length ? "\n" : "");
  }
  if (args.flags.out) {
    writeFileSync(String(args.flags.out), text);
    return out({ ok: true, message: `exported ${local.length} plan(s) to ${rel(root, String(args.flags.out))}` });
  }
  process.stdout.write(text);
  process.exitCode = 0;
}

function main() {
  const config = loadConfig(root);
  const paths = frameworkPaths(root, config);
  if (kind === "brief") {
    switch (action) {
      case "add": return cmdBriefAdd(config, paths);
      case "approve": return cmdBriefApprove(paths, config);
      case "get": return cmdBriefGet(paths);
      case "list": return cmdBriefList(paths);
      case "validate": return cmdBriefValidate(paths);
      case "export": return cmdBriefExport(paths);
      default: throw new Error("usage: presales.mjs brief <add|get|list|approve|validate|export> ...");
    }
  }
  if (kind === "plan") {
    switch (action) {
      case "add": return cmdPlanAdd(config, paths);
      case "approve": return cmdPlanApprove(paths, config);
      case "get": return cmdPlanGet(paths);
      case "list": return cmdPlanList(paths);
      case "validate": return cmdPlanValidate(paths);
      case "export": return cmdPlanExport(paths);
      default: throw new Error("usage: presales.mjs plan <add|get|list|approve|validate|export> ...");
    }
  }
  throw new Error("usage: presales.mjs <brief|plan> <add|get|list|approve|validate|export> ...");
}

try {
  main();
} catch (e) {
  process.stderr.write(`presales.mjs: ${e.message}\n`);
  process.exitCode = 2;
}
