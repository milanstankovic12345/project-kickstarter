// Test helpers: temp projects and CLI runners.
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { stringifyYaml } from "../scripts/lib/yaml.mjs";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const FIXTURES = join(REPO, "tests", "fixtures");

export function tempProject(files = {}, { framework = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "pk-test-"));
  mkdirSync(join(dir, ".git"));
  if (framework) write(dir, ".claude/agent-framework.json", JSON.stringify({ version: 1 }, null, 2));
  for (const [p, c] of Object.entries(files)) write(dir, p, c);
  return dir;
}

export function copyFixture(name) {
  const dir = mkdtempSync(join(tmpdir(), `pk-fx-${name}-`));
  cpSync(join(FIXTURES, name), dir, { recursive: true });
  mkdirSync(join(dir, ".git"), { recursive: true });
  return dir;
}

export function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

export function write(root, rel, content) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  return p;
}

export const BODY = `
## Objective
Do the thing.

## Context
Relevant context.

## Steps
1. Write test.
2. Implement.

## Blockers
Stop if scope must widen.

## Deliverables
- code
`;

export function taskDoc(overrides = {}, body = BODY) {
  const data = {
    id: "TASK-001",
    title: "Example task",
    status: "ready",
    agent: "implementer",
    skills: [],
    model_tier: "coding",
    depends_on: [],
    files_allowed: ["src/a/**"],
    files_excluded: [],
    review: ["code"],
    validation: [{ cmd: "npm test", expect: "exit 0" }],
    acceptance: ["it works"],
    max_retries: 2,
    attempts: 0,
    created: "2026-10-14",
    updated: "2026-10-14",
    ...overrides,
  };
  return `---\n${stringifyYaml(data)}\n---\n${body}`;
}

export function writeTask(root, overrides = {}, body) {
  const id = overrides.id ?? "TASK-001";
  return write(root, `tasks/${id}-example.md`, taskDoc({ ...overrides, id }, body));
}

export function handoffDoc(overrides = {}) {
  const data = {
    task: "TASK-001",
    agent: "implementer",
    status: "done",
    summary: "Implemented the thing with tests.",
    files_modified: ["src/a/x.ts"],
    tests: [{ cmd: "npm test", exit_code: 0, summary: "3 passed" }],
    unresolved: [],
    risks: [],
    decisions: [],
    next_steps: [],
    ...overrides,
  };
  return `---\n${stringifyYaml(data)}\n---\n\n## What changed\nx\n`;
}

export function reviewDoc(overrides = {}) {
  const data = {
    task: "TASK-001",
    kind: "code",
    reviewer: "code-reviewer",
    verdict: "approve",
    scope_checked: ["src/a/**"],
    findings: [],
    ...overrides,
  };
  return `---\n${stringifyYaml(data)}\n---\n\n## Findings\nnone\n`;
}

export function run(script, args, { cwd, input, env } = {}) {
  const res = spawnSync(process.execPath, [join(REPO, script), ...args], {
    cwd, input, encoding: "utf8", env: { ...process.env, ...env },
  });
  // A crash must never satisfy an "exits non-zero" assertion by accident.
  if (/\b(SyntaxError|ReferenceError|TypeError|RangeError):/.test(res.stderr ?? "")) {
    throw new Error(`${script} crashed:\n${res.stderr}`);
  }
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}
