// Frontmatter split/parse/serialize for markdown files.
import { parseYaml, stringifyYaml, YamlError } from "./yaml.mjs";

const FM_RE = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;

export function splitFrontmatter(text) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const m = FM_RE.exec(normalized);
  if (!m) return { hasFrontmatter: false, yaml: "", body: normalized };
  return { hasFrontmatter: true, yaml: m[1], body: normalized.slice(m[0].length) };
}

/** Parse a markdown file with YAML frontmatter. Throws YamlError on bad YAML. */
export function parseFrontmatter(text) {
  const { hasFrontmatter, yaml, body } = splitFrontmatter(text);
  if (!hasFrontmatter) return { hasFrontmatter, data: {}, body };
  const data = yaml.trim() === "" ? {} : parseYaml(yaml);
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new YamlError("Frontmatter must be a mapping");
  }
  return { hasFrontmatter, data, body };
}

export function serializeFrontmatter(data, body) {
  const b = body.startsWith("\n") ? body : "\n" + body;
  return `---\n${stringifyYaml(data)}\n---\n${b.replace(/^\n+/, "\n")}`;
}

/**
 * Replace (or add) top-level scalar keys in the frontmatter while preserving
 * the rest of the file (content and line-ending style; a UTF-8 BOM is
 * dropped). Used for state transitions so the task body is never rewritten.
 */
export function setFrontmatterScalars(text, updates) {
  const crlf = /\r\n/.test(text);
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const m = FM_RE.exec(normalized);
  if (!m) throw new YamlError("File has no frontmatter");
  let yaml = m[1];
  for (const [key, value] of Object.entries(updates)) {
    const rendered = stringifyYaml({ [key]: value });
    const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:.*$`, "m");
    if (re.test(yaml)) {
      // Only replace when the existing value is a scalar on one line.
      const lineMatch = re.exec(yaml);
      const afterIdx = lineMatch.index + lineMatch[0].length;
      const nextLine = yaml.slice(afterIdx + 1).split("\n")[0] ?? "";
      if (/^\s+\S/.test(nextLine) && /:\s*$/.test(lineMatch[0])) {
        throw new YamlError(`Key "${key}" is not a scalar; refusing in-place update`);
      }
      yaml = yaml.replace(re, rendered.replace(/\$/g, "$$$$"));
    } else {
      yaml = `${yaml}\n${rendered}`;
    }
  }
  const out = `---\n${yaml}\n---\n${normalized.slice(m[0].length)}`;
  return crlf ? out.replace(/\n/g, "\r\n") : out; // preserve the file's line-ending style
}

/** Extract level-2 heading titles from a markdown body. */
export function headings(body, level = 2) {
  const hashes = "#".repeat(level);
  const re = new RegExp(`^${hashes}\\s+(.+?)\\s*$`, "gm");
  return [...body.matchAll(re)].map((x) => x[1]);
}
