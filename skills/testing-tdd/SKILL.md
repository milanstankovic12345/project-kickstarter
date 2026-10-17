---
name: testing-tdd
description: Test-first implementation discipline and test design - red/green/refactor, deriving tests from acceptance criteria, unhappy-path coverage, regression tests for bugs, flaky-test avoidance and honest reporting of test evidence. Use when implementing or fixing code in the agent framework, writing tests, or verifying acceptance criteria.
---

# Test-first discipline

Adapted from the TDD principles in obra/superpowers (MIT). The wording
here is original.

## The loop
1. **Red.** Write a test for one acceptance criterion or one bug. Run it,
   and watch it fail **for the expected reason**. If it passes before your
   change, the test is wrong or the behaviour already exists. Find out
   which before going on.
2. **Green.** Write the smallest production change that makes it pass. Run
   it and see it pass.
3. **Refactor.** Clean up with the tests green. Run the full relevant suite.
4. Repeat for the next criterion. Commit-sized steps.

If you wrote production code before its test, write the test now and check
that it fails when the change is reverted. Do that with `git stash` if it
is safe, or by reasoning, and say which you did.

## Designing tests from acceptance criteria
- One test name per behaviour: `rejects login with wrong password (401, no
  cookie)`.
- Cover the **unhappy paths** for every feature: invalid input, unauthorized
  or forbidden, not found, conflict, dependency failure or timeout, empty
  and maximum sizes.
- Test through public interfaces: HTTP handler, component as rendered,
  module API. Don't test private internals.
- For bugs, write the regression test that reproduces the reported scenario
  first.

## Test quality rules
- **Deterministic:** control time (fake timers or injected clocks),
  randomness (seed) and network (mocks, fixtures, local test servers).
- **Isolated:** no order dependence; each test sets up and cleans up its
  own data.
- **Mocks** at system boundaries only (network, clock, external services).
  Mocking the unit under test proves nothing.
- **Snapshots** only for stable, reviewed output, never as the only
  assertion.
- **Speed:** keep unit tests fast; mark slow integration and E2E tests so
  they can run separately, but still run them before handoff when the task
  asks.

## Using the project's tools
Use the test runner and commands from the profile's command table, such as
`npm test -- <path>` or `pytest tests/x -q`. Don't add a new test framework
inside a feature task. If none exists, report it as a blocker. The planner
creates a setup task for `test-engineer`.

## Reporting evidence
Record every command with its real exit code and the decisive output line
(e.g. `48 passed, 0 failed`). A skipped or failing test is never reported
as passing. Flaky results are reported as flaky, with both runs.
