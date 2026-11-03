// Pure mapping/formatting logic for turning a validated Codex CLI result
// into a review.schema.json-shaped artifact. No subprocess involved.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFindings, deriveVerdict, describeDiffSpec, buildReviewMarkdown } from "../../scripts/lib/codex-review.mjs";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";
import { loadSchema } from "../../scripts/lib/project.mjs";
import { validate as validateSchema } from "../../scripts/lib/schema.mjs";

test("mapFindings assigns namespaced ids and preserves fields", () => {
  const findings = mapFindings([
    { severity: "high", title: "SQL injection", location: "src/db.js:12", rationale: "unparameterized" },
    { severity: "low", title: "naming nit", location: "src/a.js:1" },
  ]);
  assert.equal(findings[0].id, "CDX-1");
  assert.equal(findings[1].id, "CDX-2");
  assert.equal(findings[0].status, "open");
  assert.equal(findings[0].severity, "high");
});

test("deriveVerdict: block when any critical/high finding, approve_with_notes otherwise if findings exist, approve if none", () => {
  assert.equal(deriveVerdict([{ severity: "high" }]), "block");
  assert.equal(deriveVerdict([{ severity: "critical" }]), "block");
  assert.equal(deriveVerdict([{ severity: "low" }]), "approve_with_notes");
  assert.equal(deriveVerdict([]), "approve");
});

test("describeDiffSpec renders a human-readable scope description", () => {
  assert.equal(describeDiffSpec({ mode: "uncommitted" }), "uncommitted changes");
  assert.equal(describeDiffSpec({ mode: "base", ref: "main" }), "diff against base main");
  assert.equal(describeDiffSpec({ mode: "commit", sha: "abc123" }), "commit abc123");
});

test("buildReviewMarkdown produces frontmatter that validates against review.schema.json, labeled as an external tool", () => {
  const text = buildReviewMarkdown({
    task: "TASK-001",
    model: "gpt-5-codex",
    diffSpec: { mode: "uncommitted" },
    summary: "two findings",
    findings: [{ severity: "high", title: "SQL injection", location: "src/db.js:12", rationale: "x" }],
  });
  const { data } = parseFrontmatter(text);
  assert.equal(data.task, "TASK-001");
  assert.equal(data.kind, "codex");
  assert.equal(data.reviewer, "codex-cli");
  assert.equal(data.verdict, "block");
  assert.deepEqual(validateSchema(loadSchema("review"), data), []);
});
