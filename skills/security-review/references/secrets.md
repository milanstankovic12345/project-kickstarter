# Secrets handling

## Rules for agents
- Never open, print, copy or summarise the **values** in `.env*`, key
  files (`*.pem`, `*.key`, `id_*`), credential stores, or cloud credential
  files. Refer to secrets by key name only.
- If a secret value appears in code, a diff, a log or a test fixture,
  report it as a **critical** finding. Give its location and type, and
  never repeat the value. Recommend rotating it, not just deleting it,
  because git history keeps it.
- Never add real credentials to tests, fixtures, docs or examples. Use
  obvious placeholders such as `sk_test_PLACEHOLDER` or env lookups.

## What to check in code
- Hardcoded keys or tokens: high-entropy strings, prefixes such as
  `AKIA`, `ghp_`, `sk_live_`, `xox[baprs]-`, `-----BEGIN`, and connection
  strings that contain passwords.
- Secrets reaching the client: bundled into frontend env
  (`NEXT_PUBLIC_*`, `VITE_*` used for secrets), sent in API responses, or
  present in source maps.
- Secrets in logs or errors: request and header dumps, ORM debug logging,
  exception messages.
- Config hygiene:
  - `.env*` is gitignored and `.env.example` holds placeholders only.
  - Secrets come from a secret manager or CI secret store in deployed
    environments.
  - No secrets appear in Dockerfile `ARG`/`ENV`, image layers or CI YAML.
- Rotation and scope: keys use least privilege and are separate per
  environment.

## Tools (use if installed; read-only)
`gitleaks detect --no-git -v` (working tree) or `gitleaks detect`
(history), `trufflehog filesystem .`, `detect-secrets scan`. Record which
of these ran. When none is available, say the scan was manual, using
pattern searches with Grep.
