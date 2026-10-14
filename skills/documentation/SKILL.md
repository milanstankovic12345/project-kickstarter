---
name: documentation
description: Writes and updates verified project documentation - README usage, setup, command references, architecture notes, ADRs, changelogs and agent-framework usage sections - documenting only behaviour that exists and commands that were executed. Use for docs tasks, README updates after bootstrap, or when documentation drifted from the code.
---

# Verified documentation

Documentation is a contract with the reader. Every command a reader may
copy must have been **run in this session**, with its outcome recorded, or
be visibly marked `(not verified: <reason>)`.

## Procedure
1. **Audience.** Decide who reads this page: a new contributor, an
   operator, an API consumer or an end user. Write for that reader only.
2. **Sources of truth.** Collect facts from:
   - the code;
   - manifest scripts (`package.json`, `Makefile`, `pyproject.toml`);
   - CI config;
   - `project-context/project-profile.md`;
   - the handoffs of the work being documented.

   Don't copy claims from old docs without checking them.
3. **Verify.**
   - Run each documented command, or the safe subset: install, build,
     test, lint, local start.
   - Never run deploy or production commands. Document them as
     "requires credentials; not executed".
4. **Write.**
   - Short sections, task-oriented headings ("Run the tests", "Add a new
     endpoint").
   - Exact commands in code blocks, with expected output where it helps.
   - Link to deeper docs rather than repeating them.
5. **Preserve user content.** In READMEs, edit only your own sections
   between the markers below; never rewrite the user's prose:
   ```markdown
   <!-- project-kickstarter:start -->
   ...
   <!-- project-kickstarter:end -->
   ```
6. **Record** the commands you ran and their exit codes in the handoff.

## Types
- **README:** what it is, prerequisites, install, run, test, configure,
  troubleshoot, where to find more.
- **ADR** (`docs/adr/ADR-NNN-<slug>.md`): context, decision, alternatives,
  consequences, status. Never edit an accepted ADR's decision; supersede
  it with a new one.
- **Changelog:** Keep a Changelog style; user-visible changes only.
- **API docs:** generate from the source of truth (OpenAPI, typed schemas)
  where the project already does. Hand-written examples must have been
  executed.

## Don'ts
- No marketing language or claims of performance or security without
  evidence.
- No documentation for planned or unbuilt features unless marked "planned".
- No secrets, internal hostnames or personal data in examples.
