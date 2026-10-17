#!/usr/bin/env node
// PostToolUse(Edit|Write|MultiEdit): immediately validate framework
// artifacts that were just written (task files, handoffs, reviews, project
// config) and feed errors back to Claude. Opt-in.
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve, isAbsolute } from "node:path";
import { readInput, frameworkRoot, emit } from "./lib/common.mjs";
import { loadConfig, loadSchema, readJson, PROJECT_CONFIG_REL } from "../scripts/lib/project.mjs";
import { validateTaskSet, loadTasks } from "../scripts/lib/tasks.mjs";
import { validateHandoffForTask } from "../scripts/lib/handoff.mjs";
import { parseFrontmatter } from "../scripts/lib/frontmatter.mjs";
import { validate as validateSchema } from "../scripts/lib/schema.mjs";

const input = await readInput();
const root = frameworkRoot(input);
if (!root) process.exit(0);
const raw = input.tool_input?.file_path;
if (!raw) process.exit(0);
const abs = isAbsolute(raw) ? raw : resolve(input.cwd ?? root, raw);
const relPath = relative(root, abs).replace(/\\/g, "/");

let problems = [];
try {
  const config = loadConfig(root);
  if (new RegExp(`^${config.paths.tasks}/TASK-\\d{3,}[^/]*\\.md$`).test(relPath)) {
    const res = validateTaskSet(root, { config });
    const name = relPath.split("/").pop();
    problems = res.errors.filter((e) => (e.file ?? "").endsWith(name) || e.file === null).map((e) => e.message);
  } else if (new RegExp(`^${config.paths.handoffs}/(TASK-\\d{3,})\\.md$`).test(relPath)) {
    const id = /(TASK-\d{3,})/.exec(relPath)[1];
    const task = loadTasks(root, config).tasks.find((t) => t.data.id === id);
    problems = task ? validateHandoffForTask(root, task, { config }).errors : [`no task ${id} exists for this handoff`];
  } else if (new RegExp(`^${config.paths.reviews}/TASK-\\d{3,}-[a-z]+\\.md$`).test(relPath) && existsSync(abs)) {
    const { data } = parseFrontmatter(readFileSync(abs, "utf8"));
    problems = validateSchema(loadSchema("review"), data);
  } else if (relPath === PROJECT_CONFIG_REL) {
    problems = validateSchema(loadSchema("framework-config"), readJson(abs));
  }
} catch (e) {
  problems = [e.message];
}

if (problems.length) {
  emit({
    decision: "block",
    reason: `project-kickstarter: ${relPath} is invalid:\n- ${problems.slice(0, 10).join("\n- ")}\nFix it before continuing (framework scripts will reject it).`,
  });
}
process.exit(0);
