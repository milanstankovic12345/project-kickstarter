# Review checklist

Work top to bottom and stop digging in an area once you've confirmed it is
sound. Each item is a question to answer by reading or running the code.

## 1. Correctness (always)
- Does the change actually meet each acceptance criterion? Trace the main
  path end to end.
- Boundaries: empty, single, maximum, off-by-one, negative, zero, unicode,
  timezone/DST, very large inputs.
- Null/undefined/None handling on every new dereference, including optional
  fields from external data.
- Error paths: are exceptions caught at the right level, are they swallowed
  silently, are resources released (`finally`/`defer`/`using`)?
- Concurrency: shared mutable state, async races, missing `await`, retries
  that aren't idempotent, transaction boundaries.
- State and data: migrations reversible? Writes atomic? Cache invalidated?

## 2. Regressions and compatibility
- Callers of changed functions or types: do they still work? Use Grep to
  find them.
- Public API, CLI flags, config keys, event or message schemas, DB columns:
  renamed, removed or semantically changed? Is it versioned or documented?
- Default values changed? Feature flags respected?
- Tests: were existing tests deleted or weakened so they pass?

## 3. Tests
- Do the new tests fail without the change? Reason about it, or check with
  `git stash` if that is safe.
- Are unhappy paths covered: invalid input, unauthorized, dependency
  failure, timeouts?
- Do tests depend on time, randomness, network or order without control?

## 4. Security smells (escalate to security review if confirmed)
- New input reaching a sink (SQL, shell, file path, HTML, template, eval,
  deserialisation, redirect URL) without validation or encoding.
- Authn/authz checks on new routes, actions and object access (IDOR).
- Secrets in code, logs, error messages or test fixtures.

## 5. Performance
- N+1 queries, unbounded loops or result sets, missing pagination, missing
  indexes for new query shapes.
- Expensive work on hot paths or render paths; large synchronous I/O.
- Frontend: bundle growth from new dependencies, unnecessary re-renders,
  unoptimised images.

## 6. Maintainability
- Does it follow the conventions in the project profile? Is there a
  duplicate of an existing utility?
- Naming and structure: could a newcomer find and change this?
- Dead code, commented-out code, TODOs without a task id.

## 7. Architecture (architecture-reviewer focus)
- Do layer boundaries hold (UI → API → domain → data), with no reverse
  dependencies?
- Is the new coupling between modules justified? Are the interfaces narrow?
- Is it consistent with the ADRs in `docs/adr/`? New patterns introduced
  without a decision record?
- Does it scale? What breaks at 10× data or traffic, and is that acceptable
  for now?
- Do failure modes degrade gracefully, with timeouts and fallbacks at
  integration points?
