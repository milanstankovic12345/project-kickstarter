---
description: Independent security audit (appsec, authn/authz, API, input validation, secrets, supply chain, threat model) by separate read-only agents on the security model tier. Never declares the system secure.
argument-hint: "[scope path or area]"
---

Scope: `$ARGUMENTS` (empty = the whole repository).

Audit id: `AUDIT-<yyyymmdd>-<suffix>`. Give each agent its own suffix, for
example `-app` and `-deps`.

1. Resolve each agent's model with
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/routing.mjs" resolve <agent> --json`,
   for `security-reviewer`, `dependency-auditor` and `threat-modeler`.
2. Dispatch these in parallel, **in one message**:
   - `project-kickstarter:security-reviewer`: application code in scope,
     following the security-review skill. Saves with
     `reports.mjs save audit AUDIT-<date>-app security`.
   - `project-kickstarter:dependency-auditor`: manifests, lockfiles and
     CI. Saves as `AUDIT-<date>-deps security`.
   - `project-kickstarter:threat-modeler`: only if
     `docs/security/threat-model.md` is missing, or older than the auth or
     data code it covers.

   Give each agent the scope, the project profile path and the plugin root
   (`${CLAUDE_PLUGIN_ROOT}`). They inspect the code themselves; don't pass
   them conclusions.
3. Summarize:
   - findings by severity, with locations;
   - which tools ran and which were unavailable;
   - areas not covered.
4. Offer to turn Critical and High findings into remediation tasks with
   `/project-kickstarter:plan findings reports/audits/AUDIT-<date>-app-security.md`,
   using `review: [security]`.

Never state that the application is secure. State what was checked.
