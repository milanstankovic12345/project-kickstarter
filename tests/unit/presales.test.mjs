import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSchema } from "../../scripts/lib/project.mjs";
import {
  validateRecord, looksLikeSecret, nextId, deadlineWarning, budgetWarning,
} from "../../scripts/lib/presales.mjs";

const briefSchema = loadSchema("client-brief");
const planSchema = loadSchema("presales-plan");
const PID = "11111111-1111-1111-1111-111111111111";

function brief(overrides = {}) {
  return {
    id: "BRIEF-0001",
    project_id: PID,
    opportunity_id: "upwork-12345",
    source: "upwork.com",
    original_description: "We need a landing page built with React.",
    currency: "USD",
    eligibility: "UNKNOWN",
    known_facts: ["Client wants a landing page.", "Stack: React."],
    unknown_facts: ["No deadline stated.", "No budget stated."],
    constraints: [],
    sensitivity: "public",
    created_at: "2026-10-14T10:00:00Z",
    approval_status: "proposed",
    ...overrides,
  };
}

function plan(overrides = {}) {
  return {
    id: "PLAN-0001",
    project_id: PID,
    brief_id: "BRIEF-0001",
    scope: "Build a single-page landing page.",
    architecture_options: [{ name: "Static site", summary: "Pre-rendered React.", tradeoffs: "Simple, but no backend." }],
    recommended_design: "Static site.",
    technology_stack: ["React", "Vite"],
    milestones: [{ name: "MVP", deliverable: "Deployed landing page." }],
    effort_range: { min_days: 3, max_days: 5 },
    estimate_assumptions: ["Single page, no CMS."],
    risks: [],
    dependencies: [],
    client_questions: [],
    acceptance_criteria: ["Page is live and responsive."],
    confidence: 60,
    evidence_references: ["brief: known_facts[1]"],
    created_at: "2026-10-14T10:00:00Z",
    approval_status: "proposed",
    ...overrides,
  };
}

test("validateRecord accepts a well-formed brief, including eligibility UNKNOWN", () => {
  assert.deepEqual(validateRecord(briefSchema, brief()), []);
  assert.deepEqual(validateRecord(briefSchema, brief({ eligibility: "UNKNOWN" })), []);
});

test("validateRecord rejects a brief missing eligibility or with an empty original_description", () => {
  const missingEligibility = brief();
  delete missingEligibility.eligibility;
  const errors1 = validateRecord(briefSchema, missingEligibility);
  assert.ok(errors1.some((e) => e.includes("eligibility")));

  const errors2 = validateRecord(briefSchema, brief({ original_description: "" }));
  assert.ok(errors2.some((e) => e.includes("original_description")));
});

test("validateRecord accepts a well-formed plan and rejects one with empty evidence_references", () => {
  assert.deepEqual(validateRecord(planSchema, plan()), []);
  const errors = validateRecord(planSchema, plan({ evidence_references: [] }));
  assert.ok(errors.some((e) => e.includes("evidence_references")));
});

test("looksLikeSecret rejects secret-shaped content in presales free text", () => {
  assert.equal(looksLikeSecret({ source: ".env" }).secret, true);
  assert.equal(looksLikeSecret({ texts: ["AWS key AKIAABCDEFGHIJKLMNOP leaked."] }).secret, true);
  assert.equal(looksLikeSecret({ texts: ["-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----"] }).secret, true);
  assert.equal(looksLikeSecret({ texts: ["SECRET=abcd1234efgh5678"] }).secret, true);
  assert.equal(looksLikeSecret({ texts: ["We need a landing page, nothing sensitive here."] }).secret, false);
});

test("nextId produces sequential ids per prefix, independent of the other store", () => {
  assert.equal(nextId([], "BRIEF"), "BRIEF-0001");
  assert.equal(nextId([brief({ id: "BRIEF-0001" }), brief({ id: "BRIEF-0007" })], "BRIEF"), "BRIEF-0008");
  assert.equal(nextId([], "PLAN"), "PLAN-0001");
});

test("deadlineWarning fires only when no date-like substring is present", () => {
  assert.equal(deadlineWarning(null, "anything"), null);
  assert.equal(deadlineWarning("2026-12-01", "Please deliver by 2026-12-01."), null);
  assert.equal(deadlineWarning("2026-12-01", "Needed within 3 weeks."), null);
  assert.equal(deadlineWarning("2026-12-01", "Needed by December."), null);
  assert.ok(deadlineWarning("2026-12-01", "We need a landing page built with React.") != null);
});

test("budgetWarning fires only when no matching figure is present", () => {
  assert.equal(budgetWarning(null, "anything"), null);
  assert.equal(budgetWarning({ min: 500, max: 1000 }, "Budget is $500-$1000."), null);
  assert.equal(budgetWarning({ min: 1000000 }, "Budget: 1,000,000."), null);
  assert.ok(budgetWarning({ min: 5000, max: 8000 }, "We need a landing page built with React.") != null);
});
