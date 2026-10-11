# Task Plan — {{Project Name}}

> Phased, dependency-ordered. Each task names a suggested owner from the
> agent team. Execute top-to-bottom; a task may start when all its
> dependencies are Done.

## Phase 1 — Foundation
| ID | Task | Owner | Depends on | Acceptance criteria |
|---|---|---|---|---|
| T1.1 | Scaffold project per techstack.md | devops-engineer | — | Build passes; dev server runs |
| T1.2 | Set up lint/format/test pipeline | devops-engineer | T1.1 | CI green on sample commit |
| T1.3 | Data layer + migrations per blueprint | backend-engineer | T1.1 | Migration runs; entities match blueprint |

## Phase 2 — Core Features
| ID | Task | Owner | Depends on | Acceptance criteria |
|---|---|---|---|---|
| T2.1 | {{feature}} API | backend-engineer | T1.3 | FR-n implemented; tests pass |
| T2.2 | {{screen}} UI | frontend-engineer | T1.1 | Matches uiux.md states incl. error/empty |

## Phase 3 — Hardening
| ID | Task | Owner | Depends on | Acceptance criteria |
|---|---|---|---|---|
| T3.1 | E2E tests for core flows | qa-engineer | T2.x | All US acceptance criteria verified |
| T3.2 | Security baseline checklist | security-reviewer | T2.x | C-answers checklist all pass |

## Phase 4 — Launch Prep
| ID | Task | Owner | Depends on | Acceptance criteria |
|---|---|---|---|---|
| T4.1 | Deploy pipeline + environments | devops-engineer | T3.x | {{O2}} environments deployable |
| T4.2 | Monitoring + error tracking | devops-engineer | T4.1 | Errors visible in {{O3 tool}} |

Rules:
- One task = one reviewable unit (≤ ~400 lines changed ideally).
- Every task lists its acceptance criteria BEFORE starting work.
- qa-engineer writes tests against acceptance criteria, not implementation.
