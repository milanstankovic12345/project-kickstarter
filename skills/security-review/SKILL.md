---
name: security-review
description: Independent application-security review and audit - authentication, authorization, API security, input validation, injection, secrets handling, data exposure, OWASP Top 10, threat modeling, dependency and supply-chain risk, and security testing - with severity-rated, evidence-backed findings that block completion when Critical or High. Use for security reviews of tasks, /project-kickstarter:security-audit, threat models, or any request to check code for vulnerabilities.
---

# Security review

> `<plugin-root>` in commands below means `${CLAUDE_PLUGIN_ROOT}`. If that
> still shows literally, it is the plugin folder that contains the `skills/`
> directory you read this file from.

Your job is to find exploitable weaknesses by **reading and tracing the
code yourself**. An implementer's statement that something is "validated"
or "safe" is a claim to check, not evidence.

You may never conclude that a system "is secure". Report what you
inspected, what you found, and what you didn't cover.

## Load only what applies

| Code under review touches… | Read |
|---|---|
| Any change (baseline) | [references/owasp-top10.md](references/owasp-top10.md) |
| Login, sessions, tokens, roles, object access | [references/authn-authz.md](references/authn-authz.md) |
| HTTP/GraphQL/RPC endpoints, webhooks, CORS | [references/api-security.md](references/api-security.md) |
| User-controlled input reaching any sink | [references/input-validation.md](references/input-validation.md) |
| Config, env, keys, logs, error output | [references/secrets.md](references/secrets.md) |
| Dependencies, lockfiles, CI, build scripts | [references/supply-chain.md](references/supply-chain.md) |
| New feature or system design | [references/threat-modeling.md](references/threat-modeling.md) |
| Writing security tests | [references/security-testing.md](references/security-testing.md) |

## Procedure (task review)

1. **Map the attack surface of the change.** List entry points (routes,
   handlers, CLI args, message consumers, file uploads), the trust
   boundaries they cross, and the sinks they reach (DB, shell, filesystem,
   HTML, redirects, outbound requests, crypto, logs).
2. **Trace data from source to sink** for every entry point. At each hop,
   ask: validated? encoded for that sink? authorized for this subject and
   this object?
3. **Check controls** with the loaded references: authn present, authz per
   object, validation server-side, safe APIs (parameterised queries,
   no shell interpolation), secrets not exposed, errors not leaky, rate
   limits where abuse is cheap.
4. **Confirm before you report.** Write a concrete exploit scenario:
   attacker capability → request or input → impact. If you can confirm it
   safely in a local test environment, do so. Never run an attack against
   external or production systems.
5. **Rate each finding** with the rubric below, and include a CWE or OWASP
   category and a confidence score.
6. **Save** using `<plugin-root>/templates/review.md`, with `kind:
   security` and ids `SEC-n`:
   `node "<plugin-root>/scripts/reports.mjs" save review <ID> security`.

## Severity rubric

| Severity | Typical examples | Gate |
|---|---|---|
| critical | Unauthenticated RCE, SQL injection on reachable input, auth bypass, secrets committed or exposed publicly, cross-tenant data access | **blocks** until fixed and verified, or accepted by a named human |
| high | IDOR on sensitive objects, stored XSS, SSRF to internal network, missing authz on a privileged action, weak password storage, a known-exploitable dependency on a reachable path | **blocks** |
| medium | Reflected XSS needing interaction, CSRF on low-value actions, verbose errors with internals, missing rate limit on login, permissive CORS without credentials | reported |
| low | Missing security headers, minor info leaks, weak but non-exploitable configuration | reported |
| info | Hardening suggestions, pre-existing issues outside scope | reported |

Only a human can accept a Critical or High finding, through
`project-context/risk-acceptances.md`, which is hook-protected. An agent
must never mark such a finding accepted on its own.

## Audit mode (`/project-kickstarter:security-audit`)

This is the same procedure, scoped to the whole repo or a named area, run
as parallel independent sessions:

- `security-reviewer`: application code
- `dependency-auditor`: supply chain
- `threat-modeler`: only if no current threat model exists

Each reviewer saves its findings with
`node "<plugin-root>/scripts/reports.mjs" save audit AUDIT-<yyyymmdd>[-scope] security`,
and the report lands in `reports/audits/`. Critical and High
findings become remediation tasks through the planner, with
`review: [security]`.

## Output must include

- A findings table: id | severity | category | location | confidence | status
- Per finding: exploit scenario, impact, recommended fix, and how to test
  the fix
- A coverage statement: entry points reviewed, references applied, tools
  run (and unavailable ones), areas not reviewed
