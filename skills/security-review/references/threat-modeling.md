# Threat modeling (lightweight STRIDE)

Output: `docs/security/threat-model.md`. Update the existing file rather
than creating a parallel one.

## Steps
1. **Scope.** Name the system or feature and the business assets: data
   (PII, credentials, payments), capabilities (admin actions, money
   movement), availability.
2. **Data-flow diagram.** Draw actors, processes, data stores and external
   systems, and mark the **trust boundaries**: internet ↔ app,
   app ↔ DB, tenant ↔ tenant, service ↔ third party, CI ↔ prod. A mermaid
   `flowchart` is fine.
3. **Enumerate threats per boundary crossing** with STRIDE:

| Letter | Threat | Typical control |
|---|---|---|
| S | Spoofing identity | Authentication, signature verification |
| T | Tampering | Integrity checks, authz on writes, signed artifacts |
| R | Repudiation | Audit logs with actor and time |
| I | Information disclosure | Authz, encryption, minimal responses |
| D | Denial of service | Rate limits, quotas, timeouts, size caps |
| E | Elevation of privilege | Least privilege, server-side role checks |

4. **Assess each threat.** Record likelihood (L/M/H), impact (L/M/H), the
   existing mitigation with file evidence, and the gap.
5. **Decide.** Each gap becomes a security task (the planner creates it)
   or a residual risk that needs a **human** decision. Agents list residual
   risks; they never accept them.

## Template
```markdown
# Threat model — <system>
Version: <n> · Date: <yyyy-mm-dd> · Scope: <feature/system>
## Assets
## Data flow and trust boundaries
## Threats
| ID | Boundary | STRIDE | Threat | L | I | Mitigation (evidence) | Gap | Action |
## Residual risks (need human decision)
## Assumptions
```

Revisit the model when a feature adds a new boundary, data class or
external integration.
