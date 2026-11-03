# Project memory

## Purpose

`project-context/memory/` is a durable, local, verifiable record of
decisions, requirements, conventions, gotchas and lessons that should
outlive a single session. It is distinct from the two things that might
look similar:

- `project-context/project-profile.md` is a **regenerated snapshot** of
  the codebase (languages, frameworks, commands...), rewritten whenever
  discovery reruns. It has no history and nothing to supersede.
- `docs/adr/ADR-NNN-*.md` are **prose** architecture decisions with an
  informal, manual "write a new ADR to supersede an old one" convention.
  They remain the narrative record; memory is the structured, queryable
  index a script can search without an agent reading every ADR.

## Storage

A single append-only file: `project-context/memory/records.jsonl`, one
JSON object per line. This mirrors the only existing precedent in this
codebase, `reports/metrics/events.jsonl`, rather than a folder with one
file per fact. Trade-off: no per-fact `git log -p`, but trivial
supersede/search/validate/export logic and no file-naming/ID-collision
scheme to invent. The file is never mutated in place — see Supersede below.

## Record schema

Validated against `schemas/memory.schema.json` by every write and by
`memory.mjs validate`.

| Field | Type | Notes |
|---|---|---|
| `id` | `MEM-NNNN` | Sequential, assigned by the script |
| `project_id` | UUID | Stamped from `project-context/memory/project-id.json` |
| `type` | enum | `decision \| requirement \| convention \| gotcha \| lesson \| event` |
| `statement` | string, 3–2000 chars | The fact itself — never a raw chat dump |
| `source` | string, ≤200 chars | e.g. `"TASK-002 handoff"`, `"human:milan"`, `"ADR-003"` |
| `created_at` | ISO-8601 timestamp | Set by the script |
| `confidence` | integer 0–100 | Mirrors `review.schema.json` finding `confidence` |
| `approval_status` | enum | `proposed \| approved \| rejected` |
| `approved_by` | string | Required when `sensitivity: sensitive` |
| `validity` | enum | `active \| expired` — a human/agent-asserted hint, not the final word (see Ranking) |
| `expires` | ISO date | Optional; past date ⇒ effectively expired |
| `supersedes` | `MEM-NNNN` or `null` | Set only by `supersede` |
| `tags` | string[], ≤10 | Free-form, ≤40 chars each |
| `sensitivity` | enum | `public \| internal \| sensitive` |

## project_id and isolation

The first read or write in a project generates a `crypto.randomUUID()`
into `project-context/memory/project-id.json` and stamps it onto every
record from then on. It is **not** derived from the project profile's
`source_hash`, which changes every time discovery reruns.

On every read, a record whose `project_id` doesn't match the local file
is excluded from `list`/`search`/`get` results and reported by
`memory.mjs validate` as "foreign project_id" — e.g. if a `records.jsonl`
line is ever copied between repos, it is flagged, never silently trusted.

## Ranking and staleness rules

`list`/`search` are active-only by default (`--all` to include everything):

1. **Supersession is computed at read time**, not written. Walking every
   record's `supersedes` edge, the target becomes `effective_validity:
   superseded` regardless of its own stored `validity`. Once superseded,
   always superseded — even if the record that superseded it later
   expires, the old one does not come back (a stale fact never wins).
2. **Expiry**: `validity: expired`, or an `expires` date in the past.
3. **Ranking** of the remaining active records: `approval_status`
   (`approved` > `proposed` > `rejected`), then `confidence` descending,
   then `created_at` descending. An approved fact always outranks an
   unapproved assumption.
4. **Conflicts are surfaced, never hidden.** Active records sharing the
   same `type` and `tags` with differing `statement`s are reported
   together with a warning in `search`'s output — the store does not pick
   a winner between them.

## Supersede semantics

`memory.mjs supersede <OLD-ID>` appends a new record whose `supersedes`
names the old id. It never mutates the old line — the store stays a true,
immutable log, the same discipline `events.jsonl` already follows.

Worked example: A is superseded by B, and B is later superseded by C.
`effectiveValidity` resolves A → `superseded`, B → `superseded`, C →
`active`. `A`'s own `validity` field on disk is still `"active"` — the
chain, not the stored field, is authoritative for staleness.

## CLI reference (`scripts/memory.mjs`)

| Command | Purpose |
|---|---|
| `add` | Validate and append a record (stdin JSON or `--type/--statement/--source/...` flags) |
| `get <ID>` | One record plus its computed `effective_validity` |
| `list [--type] [--tags] [--all]` | Ranked dump, active-only by default |
| `search <query> [--type] [--tags] [--all] [--limit N=5]` | Keyword match over `statement`/`source`/`tags`; no vector DB |
| `supersede <OLD-ID>` | Append a replacement record |
| `validate` | Report malformed lines (with line numbers), schema errors, foreign `project_id` |
| `export [--format jsonl\|md] [--include-sensitive] [--out <path>]` | Local file/stdout only — see Forbidden content |

## Guard wiring

`config/protected-paths.json` lists `project-context/memory/**` in
`subagent_deny`: agents never write the raw file, only through
`scripts/memory.mjs`, which validates schema and content before anything
touches disk. Nothing is added to the `ask` list — the store itself
isn't secret-bearing by design (secret-shaped content is rejected before
it's ever written, see below). `sensitivity: sensitive` gating (requiring
`--approved-by`) is enforced **inside the script**, not the path hook,
because `hooks/guard-paths.mjs` only sees file globs, never record
content. `hooks/lib/bash-rules.mjs`'s `PROTECTED_TARGET` and
`PROTECTED_CWD` also cover `project-context/memory`, so a subagent can't
bypass the script with a raw shell redirect or a `cd` into it.

## Secret rejection

`looksLikeSecret()` in `scripts/lib/memory.mjs` rejects a record whose
`source` looks like a secret-bearing filename (reusing the shape of
`hooks/lib/bash-rules.mjs`'s `SECRET_FILE` pattern: `.env*`, SSH keys,
`*.pem/key/p12/pfx/jks`, `credentials.json`, `.npmrc`/`.netrc`/`.pypirc`,
`*.tfvars`) or whose `statement`/`tags` contain an AWS-access-key-shaped
string, a PEM private-key marker, a `SECRET=`/`TOKEN=`/`PASSWORD=`/
`API_KEY=`-style assignment, or a long bearer-token-shaped string.

**Limitations.** This is a best-effort heuristic, not a guarantee — the
same posture the rest of the framework already takes toward secrets
(never read, never scanned with anything beyond filename/shape patterns).
It can both over-reject (a sentence mentioning "password" in prose is
fine; a sentence that happens to contain `TOKEN=abc123` is not) and
under-reject (a secret that doesn't match any of these shapes). Don't try
to route around it, and never put a real secret value in a `statement` to
"document" it — refer to it by key name only, as the rest of the
framework already does.

## Integration points

- **Bootstrap** — deliberately **not** touched. Memory starts empty per
  project; discovery still only writes `project-profile.md`. Seeding
  memory from discovery is out of scope for V1.
- **Session resume** (`hooks/session-status.mjs`) — at most one bounded
  line appended to the existing ≤10-line summary: active decision/gotcha
  counts plus an ≤80-character snippet of the single most recent active
  decision. Never a dump.
- **Planning** (`skills/task-planning/SKILL.md`) — step 1 runs
  `memory.mjs search ... --json --limit 5` per relevant `type`, and cites
  hits in a task's Context section by id, not by copying the statement.
- **Architect** (`agents/architect.md`) — the architect has no Bash
  access (least-privilege `docs` tier), so after writing an ADR for a
  durable, project-level choice it writes the exact `memory.mjs add`
  command into its handoff for a human or an agent with Bash access to
  run. Two-way ADR↔memory supersede sync is a documented follow-up, not
  built in V1.
- **Every subagent** (`skills/handoff-protocol/SKILL.md`, §2.5) may
  consult memory with a targeted, capped `search` before unfamiliar work,
  and record a durable gotcha/decision/lesson it discovers.

**No agent or skill is ever instructed to load the full memory store into
its prompt context** — every consumer above calls `get`/`search --json`
with an explicit type/tag filter and a result cap, never `list` unbounded
and never the raw file.

## Forbidden content

Never stored, and how each is actually prevented:

- **API keys, passwords, tokens** — rejected by `looksLikeSecret()`
  (best-effort; see Limitations above).
- **`.env` contents** — the filename pattern in `looksLikeSecret()`
  rejects a `source` referencing `.env*`, and no code path in this
  framework ever reads a `.env` file's contents to put them anywhere.
- **Private client data** — not something the framework automates; this
  is a matter of what a human or agent chooses to write as a `statement`,
  same as any other free-text field in this framework.
- **Full raw chat logs** — `statement` has a 2000-character maximum,
  which rules out pasting a transcript; nothing in the framework ever
  copies conversation history into a memory record automatically.

Export never transmits anything anywhere: `memory.mjs export` only
writes a local file or stdout. "Never send memory to external services
without approval" holds as a design invariant because nothing in this
zero-dependency, no-network codebase ever makes an outbound call with
memory content — not because `export` itself runs a runtime check.
