// Turns a validated Codex CLI review result into a review.schema.json
// artifact. `kind: "codex"` is a distinct, explicitly-labeled external-tool
// review — advisory only (see config/defaults.json gates.required_reviews,
// which never includes "codex" by default: it counts toward the gate only
// if a human opts a specific task into it via that task's own `review` list).
import { stringifyYaml } from "./yaml.mjs";

const BLOCKING_SEVERITIES = new Set(["critical", "high"]);

export function mapFindings(rawFindings) {
  return rawFindings.map((f, i) => ({
    id: `CDX-${i + 1}`,
    severity: f.severity,
    title: f.title,
    location: f.location,
    status: "open",
  }));
}

export function deriveVerdict(findings) {
  if (findings.some((f) => BLOCKING_SEVERITIES.has(f.severity))) return "block";
  if (findings.length > 0) return "approve_with_notes";
  return "approve";
}

export function describeDiffSpec(diffSpec) {
  if (!diffSpec || diffSpec.mode === "uncommitted") return "uncommitted changes";
  if (diffSpec.mode === "base") return `diff against base ${diffSpec.ref}`;
  if (diffSpec.mode === "commit") return `commit ${diffSpec.sha}`;
  throw new Error(`unknown diffSpec.mode "${diffSpec?.mode}"`);
}

export function buildReviewMarkdown({ task, model, diffSpec, summary, findings }) {
  const mapped = mapFindings(findings);
  const data = {
    task,
    kind: "codex",
    reviewer: "codex-cli",
    model: model ?? null,
    verdict: deriveVerdict(mapped),
    scope_checked: [describeDiffSpec(diffSpec)],
    findings: mapped,
  };
  const body = `\n## Findings (external tool: OpenAI Codex CLI, advisory only — not a Claude subagent)\n${summary ?? ""}\n`;
  return `---\n${stringifyYaml(data)}\n---\n${body}`;
}
