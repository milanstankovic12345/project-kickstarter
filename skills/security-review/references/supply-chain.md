# Dependency & supply-chain audit

Run only **read-only** commands. Never `audit fix`, `npm install`,
`pip install` or `--force`. Dependency changes are separate tasks with
their own review.

## Known vulnerabilities (use what is installed; record what ran)

| Ecosystem | Command |
|---|---|
| npm | `npm audit --json` (`--omit=dev` for production exposure) |
| pnpm / yarn | `pnpm audit --json` / `yarn npm audit --json` (yarn berry) |
| Python | `pip-audit -r requirements.txt` or `pip-audit` in the venv |
| Go | `govulncheck ./...` (reports only reachable vulnerabilities) |
| Rust | `cargo audit` |
| Ruby | `bundle audit check` |
| Java/Kotlin | OWASP dependency-check, if configured |
| Any | `osv-scanner --lockfile=<lockfile>` or `osv-scanner -r .` |

Triage each finding:
- Is the vulnerable function reachable from this project?
- Is it a dev-only or a runtime dependency?
- Does a fixed version exist?

Severity follows real exposure, not the CVSS score alone. A critical CVE in
an unreachable dev tool is usually medium or low.

## Supply-chain hygiene
- **Lockfiles:** committed and consistent with the manifest; CI installs
  from the lockfile (`npm ci`, `pip install --require-hashes`,
  `--frozen-lockfile`).
- **New dependencies:** check maintenance (recent releases, more than one
  maintainer), download counts, repo match, typosquatting (names one edit
  away from popular packages), and install scripts
  (`preinstall`/`postinstall`).
- **Pinning:** CI actions pinned to a commit SHA; Docker base images pinned
  to a digest or a specific version.
- **CI permissions:** `permissions:` set minimally; secrets not exposed to
  `pull_request_target` from forks.
- **Registries:** scoped registries for private packages (dependency
  confusion); no `--registry` overrides to unknown hosts.
- **Licenses:** flag copyleft or unknown licenses if the project has a
  license policy.

## Report
For each finding: package@version, advisory id (GHSA, CVE or OSV),
severity after triage, reachable or unknown, fixed version, upgrade risk.
List the tools that were unavailable. Without them, coverage is partial
and must be reported as such.
