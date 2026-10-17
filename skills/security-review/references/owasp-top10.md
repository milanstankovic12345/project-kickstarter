# OWASP Top 10 (2021) — review prompts

Category names follow the OWASP Top 10 2021 list. Check
https://owasp.org/Top10/ for a newer edition before you cite one in a
report.

| ID | Category | Ask of the code |
|---|---|---|
| A01 | Broken Access Control | Is every route/action/object access checked **server-side** for this user and this object (not just "logged in")? Are IDs guessable? Can a user change `userId`, `tenantId` or `role` in the request? Are default-deny rules in place? Is CORS restricted? |
| A02 | Cryptographic Failures | Is sensitive data encrypted in transit (TLS) and at rest where required? Passwords hashed with argon2id, bcrypt or scrypt (never a fast hash)? Keys or IVs hardcoded or reused? Is `Math.random` or another non-CSPRNG used for tokens? Is TLS verification disabled? |
| A03 | Injection | Are SQL/NoSQL/LDAP/OS/template/XPath queries built from input? Use parameterised APIs, argument arrays for processes, and contextual output encoding. Includes XSS: unsafe HTML sinks such as `innerHTML`, `dangerouslySetInnerHTML`, `v-html`, `|safe`. |
| A04 | Insecure Design | Are business limits missing (quantity, price, rate, workflow order)? Is the client trusted for security decisions? Is there a threat model for risky features? |
| A05 | Security Misconfiguration | Debug mode, default credentials, verbose errors, permissive headers or CORS, directory listing, unnecessary features on, cloud buckets public? |
| A06 | Vulnerable & Outdated Components | Known-vulnerable or unmaintained dependencies on reachable paths? See supply-chain.md. |
| A07 | Identification & Authentication Failures | Brute-force protection, credential stuffing defences, session fixation, insecure "remember me", weak reset flows, missing MFA where required? See authn-authz.md. |
| A08 | Software & Data Integrity Failures | Unsigned updates or webhooks, insecure deserialisation (`pickle`, `yaml.load`, Java serialisation), CI pipelines pulling unpinned code? |
| A09 | Security Logging & Monitoring Failures | Are auth failures, access-control denials and high-value actions logged without secrets or PII? Is there an alerting path? |
| A10 | Server-Side Request Forgery | Does the server fetch user-supplied URLs? Allowlist schemes and hosts, block internal ranges and metadata IPs (169.254.169.254), re-validate after redirects. |

When a finding fits more than one category, cite the most specific CWE as
well, e.g. CWE-89 SQL injection, CWE-639 IDOR, CWE-79 XSS, CWE-918 SSRF,
CWE-798 hardcoded credentials, CWE-502 deserialisation.
