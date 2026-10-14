---
name: project-discovery
description: Analyzes a repository - languages, frameworks, architecture, dependencies, APIs, databases, tests, build tools, CI/CD, security-sensitive components, UI systems, conventions and existing agent instructions - and maintains the versioned project-context/project-profile.md without exposing secrets. Use when profiling a codebase, when the profile is missing or stale, or before planning work in an unfamiliar repository.
---

# Project discovery

> `<plugin-root>` in commands below means `${CLAUDE_PLUGIN_ROOT}`. If that
> still shows literally, it is the plugin folder that contains the `skills/`
> directory you read this file from.

The profile is shared memory: every other agent reads it instead of
re-exploring the repository. It has two parts:

1. **The generated block**, between `project-kickstarter:profile` markers.
   These are deterministic facts from `discover.mjs`, written by bootstrap.
   Never edit it by hand. Regenerate it with
   `node "<plugin-root>/scripts/bootstrap.mjs" apply`.
2. **Notes.** Architecture narrative, conventions, glossary and risks,
   written by you, the project-discoverer agent, from evidence.

## Procedure

1. Run `node "<plugin-root>/scripts/discover.mjs" --json` and read the
   result.
   - If the profile is missing or its `source_hash` differs, run bootstrap
     `apply` (or ask the orchestrator to). Never hand-write the generated
     block.
2. Fill the **Notes** sections (see `<plugin-root>/templates/project-profile.md`).
   Read only what you need:
   - entry points (main/server files, routers, app layout);
   - one representative module per layer;
   - existing docs: README, `docs/`, ADRs, CLAUDE.md, AGENTS.md;
   - lint, format and test configs, for conventions.
3. **Cite evidence.** Every statement names the file it came from. Write
   unknowns as "Unknown: <question>". Don't guess.
4. **Keep it concise.** Target under 150 lines of Notes. Link to files
   rather than copying them.

## Secrets and sensitive files

- `discover.mjs` lists secret-bearing files by **name only**. Never open
  `.env*`, key or certificate files, credential JSON, `.npmrc`, `.netrc`
  or `*.tfvars`.
- When configuration matters, read `.env.example` or the config schema
  instead. Refer to variables by key name only.
- If you find a secret value in a normal source file, record it in the
  Notes as a risk with its location only, never the value, and flag it to
  the orchestrator as critical.

## Large repositories

If the walk was truncated (`size.truncated`) or the repo is a monorepo:
profile the top level and each package's purpose in one line. Then list
"follow-up discovery" items that the planner can turn into tasks. Don't
try to read everything in one session.
