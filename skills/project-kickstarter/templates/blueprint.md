# Blueprint — {{Project Name}}

## Architecture Diagram
```mermaid
{{flowchart/graph of components, data flow, external services}}
```

## Component Breakdown
| Component | Responsibility | Tech | Notes |
|---|---|---|---|

## Data Model
```mermaid
erDiagram
  {{entities and relations from D answers}}
```
Key fields, constraints, indexes, retention (D7/D8).

## API Surface
| Resource | Method | Auth | Purpose |
|---|---|---|---|

## Realtime / Async (if applicable)
{{F1, F3 → queues, websockets, schedulers}}

## Deployment Topology
{{per O1/O2/O4/O7: environments, containers, regions}}

## Scaling Path
What breaks first at 10× traffic and the planned fix.

## Failure Modes
| Failure | Detection | Response |
|---|---|---|
