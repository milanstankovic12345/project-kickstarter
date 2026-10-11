# Engineering Rules — {{Project Name}}

> Single source of truth. Split into IDE rule files in Phase 5; never edit
> copies directly — edit this file and re-sync.

## Code Style & Linting
- Formatter: {{e.g. Prettier / Ruff}} — run on save and in CI.
- Lint config lives at {{path}}; CI fails on lint errors.

## Naming Conventions
- Files: {{convention}}; Components: {{convention}}; DB: {{convention}}.

## Git Workflow (P3/P4)
- Branching: {{from P3}}; commit format: {{from P4}}.
- Never commit secrets; `.env*` is gitignored except `.env.example`.

## Testing Requirements (T9)
- Minimum bar: {{from T9}}; every bug fix ships with a regression test.

## Error Handling & Logging (O4)
- All errors logged as structured entries with correlation ID where applicable.
- User-facing errors never leak stack traces.

## Security Baseline (C)
- {{imperative rules distilled from C1–C8}}

## Dependency Policy (C6)
- {{from C6}}

## Definition of Done
- [ ] Lint + typecheck clean
- [ ] Tests written and passing
- [ ] Docs updated where behavior changed
- [ ] Task ID referenced in the PR/summary
