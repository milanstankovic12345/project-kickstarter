# Authentication & authorization review

## Authentication
- **Passwords:** stored with argon2id, bcrypt (cost ≥ 10) or scrypt; never
  plaintext, MD5, SHA-x or unsalted. Compare in constant time.
- **Login:** rate limiting or lockout with backoff. The response must not
  reveal whether the username or the password was wrong. MFA where the
  product requires it.
- **Sessions:**
  - The session id is regenerated on login and on privilege change.
  - Cookies are `HttpOnly`, `Secure`, with an explicit `SameSite`, and
    scoped to path and domain.
  - Idle and absolute timeouts exist, and logout invalidates the session
    server-side.
- **Tokens (JWT, etc.):**
  - The algorithm is pinned server-side; `alg: none` and HS/RS confusion
    are rejected.
  - Signature, `exp`, `nbf`, `iss` and `aud` are verified, and lifetimes
    are short.
  - Refresh tokens rotate and are revocable. Tokens never go in
    `localStorage` when XSS is a realistic risk.
- **Password reset:**
  - The token comes from a CSPRNG, is single-use, short-lived, and stored
    hashed.
  - The flow doesn't reveal whether an account exists, and old sessions
    are invalidated after the reset.
- **OAuth/OIDC:** `state` and PKCE are used, redirect URIs exactly
  allowlisted, the ID token validated, and the email-verified claim checked
  before linking accounts.

## Authorization
- **Default deny:** any new route or action without an explicit policy is a
  finding.
- **Object level (IDOR):** every fetch, update or delete by id also scopes
  by owner, tenant or ACL, e.g. `WHERE id = ? AND tenant_id = ?`. Check
  list endpoints, exports, file downloads and GraphQL resolvers too.
- **Function level:** admin and privileged actions check the role or
  permission server-side. Hiding a button in the UI is not authorization.
- **Mass assignment:** request bodies bound to models must allowlist
  fields; `role`, `isAdmin`, `ownerId` and `tenantId` must never be bound
  from input.
- **Multi-tenant:** the tenant comes from the authenticated principal,
  never from a header, query or body the client controls.
- **Indirect paths:** background jobs, webhooks, cache keys and search
  indexes respect the same authz as the primary API.

## Evidence to collect
For each finding: the route or handler, the missing or incorrect check
(file:line), and an example request from an attacker principal showing
unauthorized access. A local test that demonstrates it is the strongest
evidence.
