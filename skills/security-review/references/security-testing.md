# Security testing

Write tests that would **fail if the vulnerability came back**. Run them
only against local or test environments the project controls. Never target
production or third-party systems.

## Test patterns

| Risk | Test |
|---|---|
| Missing authn | Request without credentials → 401/redirect; assert no data in body |
| IDOR / object authz | User A requests B's object by id (read, update, delete, list filter, export) → 403/404; data unchanged |
| Function authz | Non-admin calls an admin action → 403; side effect absent |
| Mass assignment | POST/PATCH with `role`, `isAdmin`, `tenantId` → fields ignored or rejected |
| SQL/NoSQL injection | Payloads such as `' OR '1'='1`, `{"$ne": null}` in each parameter → no extra rows, no 500, query parameterised |
| XSS | Store `<img src=x onerror=alert(1)>` → rendered output escaped (assert on HTML or DOM text) |
| Path traversal | `../../etc/passwd`, encoded variants, absolute paths → rejected, never read |
| SSRF | URL to `http://169.254.169.254/`, `http://localhost`, a redirect to internal → blocked |
| Rate limiting | N+1 rapid login attempts → throttled (429) |
| CSRF/CORS | Cross-origin state change without token → rejected; disallowed `Origin` → no ACAO header |
| Secrets/log leakage | Trigger errors → response has no stack trace; logs (captured in test) have no tokens or passwords |
| Token handling | Expired, tampered, `alg:none` JWT → rejected |

## Practices
- Keep security tests in the normal test suite so CI runs them.
- Name them after the finding id, e.g. `SEC-3: rejects cross-tenant invoice read`.
- Prove each test works: it fails on the vulnerable code (stash the fix or
  reason it through) and passes after the fix. Record both results in the
  handoff when feasible.
- Use tooling that already exists in the project (the HTTP test client,
  Playwright for browser flows). Add DAST tools only through a devops task.
