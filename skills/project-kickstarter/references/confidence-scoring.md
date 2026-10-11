# Confidence Scoring & Round Loop

## Dimensions and weights

| ID | Dimension | Weight | Fed by questions |
|---|---|---|---|
| V | Vision & problem | 10% | V1–V8 |
| U | Users | 10% | U1–U8 |
| S | Scope & MVP | 15% | S1–S10 |
| F | Features | 10% | F1–F10 |
| D | Data | 10% | D1–D8 |
| I | Integrations | 5% | I1–I6 |
| T | Tech & architecture | 15% | T1–T12 |
| X | UX/UI | 10% | X1–X10 |
| C | Security & compliance | 5% | C1–C8 |
| O | Ops & deployment | 10% | O1–O8 |

(Constraints P feeds into S, T and O rather than being scored separately.)

## Per-dimension score

For each dimension:

```
coverage = answered questions / questions relevant to this product
quality  = 100 if answers are specific and non-contradictory
           70 if some answers are "recommend for me" / vague
           40 if answers contradict each other or the codebase
score    = 0.6*coverage + 0.4*quality   (scale 0–100)
```

A question answered `[inferred from code]` counts as answered with
quality 85 — verify with the user before treating it as 100.

## Overall score

```
overall = Σ dimension_score × weight
```

## Loop rules

1. Minimum 3 rounds; 5–10 questions per round.
2. Each round targets the 2–3 lowest-scoring dimensions first; within a
   dimension ask unanswered questions before re-asking answered ones.
3. Show the scoreboard after every round, e.g.:

   ```
   Confidence: 78% → 91% (target 95%)
   Weakest: Integrations 62, Ops 70, UX 74
   Continue with round 4? (or say "proceed" to accept current state)
   ```

4. **Stop when:** overall ≥ 95% AND every dimension ≥ 85%.
5. **User override:** if the user says "proceed" below threshold, record
   `PROCEED-OVERRIDE at NN%` in answers.md and list what remains unknown as
   `[ASSUMPTION]` items in every downstream artifact.
6. **Budget cap:** at the tier's max questions (30/60/100), stop and report.
7. Contradiction between an answer and the codebase analysis always
   triggers one follow-up question in the next round.
8. Keep per-round cost low: do not re-print the whole catalog or the whole
   answer log; print only the round's questions and the scoreboard.
