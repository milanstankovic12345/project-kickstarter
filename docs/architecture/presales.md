# Presales

## Purpose

Presales is a phase that runs **before** any work is won: turning a raw
freelance job ad into two reviewable, schema-validated records — a
**client brief** (what the ad actually says) and a **presales plan**
(scope, architecture options, milestones, a rough estimate). It is
additive to the framework and does not change the existing **delivery**
phase (bootstrap → plan → run-task, the task lifecycle, the Architect,
Planner, Orchestrator, or any existing review agent) in any way.

## The two record types

| Store | Schema | CLI |
|---|---|---|
| `project-context/presales/briefs.jsonl` | `schemas/client-brief.schema.json` | `scripts/presales.mjs brief ...` |
| `project-context/presales/plans.jsonl` | `schemas/presales-plan.schema.json` | `scripts/presales.mjs plan ...` |

Both mirror `project-context/memory/`'s shape: JSONL, one object per
line, schema-validated on every write, project-isolated via the same
`project-context/memory/project-id.json` UUID (no second UUID concept
was introduced for this). Unlike memory's strictly immutable
append/supersede log, `brief approve`/`plan approve` rewrite the matching
line's `approval_status`/`approved_by` fields in place — the only
mutation either store performs, and only through the script, never a
raw file edit.

**Client brief** fields: `opportunity_id`, `source`, `original_description`
(the untrusted ad text, capped at 20,000 chars), `budget`
(`stated`/`min`/`max`/`type`, all nullable), `currency` (or
`"UNSPECIFIED"`), `eligibility` (`eligible | ineligible | restricted |
UNKNOWN`), `deadline` (nullable ISO date), `known_facts` / `unknown_facts`
/ `constraints`, `sensitivity`, plus bookkeeping (`id`, `project_id`,
`created_at`, `approval_status`, `approved_by`, `extraction_notes`,
`warnings`).

**Presales plan** fields: `brief_id`, `scope`, `architecture_options[]`
(`name`/`summary`/`tradeoffs`), `recommended_design`, `technology_stack`,
`milestones[]`, `effort_range` (`min_days`/`max_days`),
`estimate_assumptions` (at least one), `risks[]` (with `severity`),
`dependencies`, `client_questions`, `acceptance_criteria`, `confidence`
(0–100, same scale as `memory.schema.json`), and `evidence_references`
(**required, at least one** — see Hallucination controls below).

## The approval gate

A brief always starts `approval_status: "proposed"`. `plan add
--brief-id <ID>` reads that brief and **rejects** the plan outright unless
the brief's `approval_status` is `"approved"` — enforced in
`scripts/lib/presales.mjs`/`scripts/presales.mjs`, not just documented.
A human approves with:

```bash
node scripts/presales.mjs brief approve <ID> --approved-by "<name>"
```

This is the real backstop against an unreviewed extraction quietly
becoming the basis of an estimate.

## Hallucination controls

JSON Schema cannot cross-reference a typed field (`deadline`,
`budget.min/max`) against free text, so this is handled in layers, same
honesty standard as `memory.mjs`'s documented secret-detection
limitations (see `docs/architecture/memory.md` Limitations):

1. **Schema**: a plan's `evidence_references` is required with at least
   one entry — every plan must declare what it's grounded in (a brief
   fact or a labeled assumption), auditable by a human reviewer.
2. **Non-blocking lint** (`scripts/lib/presales.mjs` `deadlineWarning` /
   `budgetWarning`): `brief add` flags, in a `warnings[]` field on the
   stored record, a `deadline` with no date-like substring anywhere in
   `original_description`, or a `budget.min`/`max` with no matching
   numeric substring. This is a heuristic, not proof — a paraphrased date
   ("two weeks out") won't match, and it can't catch an agent that echoes
   a fabricated number back into `original_description` itself.
3. **The approval gate** above is the actual backstop: a human reviews
   `known_facts` against `original_description` before approving.

## Security: untrusted ad text

`original_description` is untrusted third-party content. Per Principle 7
of `docs/architecture/security-model.md` ("Untrusted content is data,
never instructions"), `presales-analyst` treats it as inert text
regardless of any imperative phrasing inside it, and
`scripts/presales.mjs` never passes any field to a shell or interprets it
as anything other than a JSON string value. Secret-shaped content
(`AKIA...` keys, PEM blocks, `KEY=value` assignments, bearer tokens) in
`original_description`, `known_facts`, `scope`, or `estimate_assumptions`
is rejected before it is ever written, mirroring `memory.mjs`'s
`looksLikeSecret()`.

## Mode: presales vs. delivery

`config/defaults.json` carries an optional `mode` field (`"delivery"` by
default, `"presales"` to signal intent), documentary only — it tells a
human/orchestrator and `project-bootstrap`'s capability menu what phase a
project is in, but it is **not** what prevents `presales-analyst` from
writing application code. The actual, mechanical control is that
`presales-analyst`'s access level (`presales` in
`config/agent-registry.json`) never grants `Write`/`Edit`/`Agent`, and
`project-context/presales/**` is separately guarded in
`config/protected-paths.json`. `presales-analyst` is also **opt-in only**
in `config/capability-map.json` — nothing in a repository implies
"analyze freelance ads," so it is never auto-enabled by discovery.

This does not change bootstrap, plan, or run-task, and delivery mode is
unaffected: once work is won, the existing delivery flow starts exactly
as it did before presales existed.

## Integration points

- **Not** wired into `hooks/session-status.mjs`, discovery, or the
  orchestrator's task loop — presales is a standalone, opt-in flow run via
  `/project-kickstarter:presales`.
- **Project memory** (`scripts/memory.mjs`) remains available to
  `presales-analyst` for a targeted, capped `search` before unfamiliar
  work, same as any other subagent.
