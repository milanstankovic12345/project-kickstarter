# API security (REST, GraphQL, RPC, webhooks)

Use this checklist both to build endpoints and to review them.

## Every endpoint
1. **Authn:** which principal is calling? Public endpoints must be
   intentionally public, with a comment or route config saying so.
2. **Authz:** a function-level check (may this role call this?) and an
   object-level check (may this principal touch this object?).
3. **Input:** schema-validate the body, query and path params server-side
   (types, ranges, lengths, enums, formats). Reject unknown fields.
4. **Output:** return an explicit response DTO; never serialise ORM entities
   directly. Leave out internal ids, hashes, tokens and other users' PII.
5. **Errors:** use a generic message plus a correlation id. No stack traces,
   SQL errors or file paths in responses.
6. **Abuse:** rate limits on auth, signup, password reset, search and
   expensive or LLM operations. Use pagination with a capped page size, and
   cap request size.
7. **Idempotency:** non-idempotent operations that clients retry (payments,
   orders) take idempotency keys.

## GraphQL extras
Limit query depth and complexity. Disable introspection in production if
policy requires it. Authorize in every resolver, not only at the gateway.
Batch through dataloaders without leaking objects across tenants.

## Webhooks (inbound)
Verify the signature over the raw body with a constant-time compare. Check
a timestamp tolerance to prevent replay. Make processing idempotent by
event id. Never trust payload fields for authorization without fetching
the object again.

## Browser-facing
- **CORS:** an explicit origin allowlist. Never echo the `Origin` header
  back together with credentials.
- **CSRF:** cookie-authenticated, state-changing requests need
  `SameSite` + CSRF tokens or double-submit, or must require a custom
  header.
- **Headers:** `Content-Security-Policy`, `Strict-Transport-Security`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `frame-ancestors`.

## Outbound calls
Set timeouts and bounded retries. Validate TLS. SSRF controls apply to any
URL derived from user input (see owasp-top10.md A10). Never forward user
credentials to third parties.
