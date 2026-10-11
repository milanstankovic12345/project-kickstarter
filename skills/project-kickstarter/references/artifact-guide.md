# Artifact Guide (Phase 3)

Generate artifacts from the answer log (`docs/kickstart/answers.md`) +
codebase analysis. Every non-trivial claim cites an answer ID or is marked
`[ASSUMPTION]`. Use the matching file in `templates/` as the skeleton.

## docs/prd.md

Sections: Executive Summary; Problem Statement; Goals & Non-Goals; Personas;
User Stories (ID'd, with acceptance criteria); Functional Requirements
(FR-n, priority MoSCoW); Non-Functional Requirements (perf, availability,
security targets from C/O answers); Success Metrics; Scope table (MVP /
v1.1 / later); Risks & Mitigations; Open Questions.
- User stories must be testable; each maps to ≥1 task in tasks.md later.
- NFRs must have numbers where the user gave them, else `[ASSUMPTION]`.

## docs/techstack.md

Sections: Stack Overview table (layer → choice → why → answer ID);
Alternatives Considered (≥2 per major choice); Dependency List;
Constraints & Trade-offs; Upgrade/Migration risk notes (brownfield).
- Justify every choice with the user's answers (team familiarity T-answers,
  cost O8, hosting O4), not with hype.

## docs/blueprint.md

Sections: Architecture Diagram (mermaid); Component Breakdown; Data Model
(entities, relations, key fields); API Surface (resource → method → auth);
Realtime/Async design (if F1/F3 say so); Deployment Topology (per O
answers); Scaling Path (what changes at 10× traffic); Failure Modes.
- Keep the blueprint at the level a tech-lead agent can implement against
  without re-deciding architecture.

## docs/uiux.md (skip for API-only/CLI products)

Sections: Design Principles (from X answers); Information Architecture
(screen map); Screen Specs (per key screen: purpose, layout, states —
empty/loading/error); Component Inventory mapped to the chosen design
system (X1); Interaction Patterns (forms, toasts, modals); Accessibility
Checklist (from U5); Visual Style tokens (colors/typography/spacing,
concrete values).
- If X10 = wireframe or mockup, include ASCII/mermaid wireframes per screen.

## docs/rules.md

The single source of engineering rules, later split into IDE rule files.
Sections: Code Style & Linting; Naming Conventions; Git Workflow (from P3/P4);
Testing Requirements (from T9); Error Handling & Logging (from O4);
Security Baseline (from C answers); Dependency Policy; Definition of Done.
- Rules must be imperative and checkable ("always", "never"), not
  aspirational prose.

## Traceability contract

- Start each artifact with a header block: idea seed, tier, confidence
  score, date, source = docs/kickstart/answers.md.
- `[ASSUMPTION]` items are collected at the end of each artifact under
  "Assumptions to confirm" so the user can close them later.
