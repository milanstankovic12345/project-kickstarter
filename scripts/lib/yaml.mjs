// Minimal, dependency-free YAML subset used for framework frontmatter.
// Supported: block mappings, block sequences (incl. sequences of mappings),
// flow sequences/mappings ([a, b], {k: v}), quoted/unquoted scalars,
// numbers, booleans, null, block scalars (| and >), comments.
// Not supported (by design): anchors/aliases, tags, multi-document streams,
// complex keys. Files that need those are outside the framework's formats.

export class YamlError extends Error {
  constructor(message, line) {
    super(line ? `${message} (line ${line})` : message);
    this.line = line;
  }
}

const KEY_RE = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[A-Za-z0-9_$][A-Za-z0-9_.\-$ ]*?)\s*:(?:\s+|$)(.*)$/;

function indentOf(line) {
  const m = /^( *)/.exec(line);
  return m[1].length;
}

function isSkippable(line) {
  const t = line.trim();
  return t === "" || t.startsWith("#");
}

function stripComment(text) {
  // Remove " # comment" outside of quotes.
  let inS = false, inD = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS && text[i - 1] !== "\\") inD = !inD;
    else if (c === "#" && !inS && !inD && (i === 0 || /\s/.test(text[i - 1]))) {
      return text.slice(0, i).trimEnd();
    }
  }
  return text.trimEnd();
}

function unquoteKey(k) {
  if (k.startsWith('"')) return JSON.parse(k);
  if (k.startsWith("'")) return k.slice(1, -1).replace(/''/g, "'");
  return k.trim();
}

export function parseScalar(raw, lineNo) {
  const text = stripComment(raw.trim());
  if (text === "" || text === "~" || text === "null" || text === "Null" || text === "NULL") return null;
  if (text.startsWith("[") || text.startsWith("{")) return parseFlow(text, lineNo);
  if (text.startsWith('"')) {
    if (!text.endsWith('"') || text.length < 2) throw new YamlError("Unterminated double-quoted string", lineNo);
    try { return JSON.parse(text); } catch { throw new YamlError("Invalid double-quoted string", lineNo); }
  }
  if (text.startsWith("'")) {
    if (!text.endsWith("'") || text.length < 2) throw new YamlError("Unterminated single-quoted string", lineNo);
    return text.slice(1, -1).replace(/''/g, "'");
  }
  // Real YAML parsers reject ": " inside a plain scalar ("mapping values are
  // not allowed here"); mirror that so files validated here load in Claude Code.
  if (/:\s/.test(text)) throw new YamlError(`Plain scalar contains ": " — quote the value: ${text.slice(0, 50)}`, lineNo);
  if (/^(true|True|TRUE)$/.test(text)) return true;
  if (/^(false|False|FALSE)$/.test(text)) return false;
  if (/^[-+]?\d+$/.test(text)) return Number.parseInt(text, 10);
  if (/^[-+]?(\d+\.\d*|\.\d+)([eE][-+]?\d+)?$/.test(text)) return Number.parseFloat(text);
  return text;
}

// ---- flow collections ----------------------------------------------------
function parseFlow(text, lineNo) {
  let i = 0;
  const err = (m) => { throw new YamlError(`Flow collection: ${m}`, lineNo); };
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  function value() {
    ws();
    const c = text[i];
    if (c === "[") return seq();
    if (c === "{") return map();
    return scalarToken();
  }
  function scalarToken() {
    ws();
    const start = i;
    if (text[i] === '"') {
      i++;
      while (i < text.length && text[i] !== '"') { if (text[i] === "\\") i++; i++; }
      if (text[i] !== '"') err("unterminated string");
      i++;
      return JSON.parse(text.slice(start, i));
    }
    if (text[i] === "'") {
      i++;
      while (i < text.length) {
        if (text[i] === "'" && text[i + 1] === "'") { i += 2; continue; }
        if (text[i] === "'") break;
        i++;
      }
      if (text[i] !== "'") err("unterminated string");
      i++;
      return text.slice(start + 1, i - 1).replace(/''/g, "'");
    }
    while (i < text.length && !",]}".includes(text[i]) && !(text[i] === ":" && /\s/.test(text[i + 1] ?? " "))) i++;
    return parseScalar(text.slice(start, i).trim(), lineNo);
  }
  function seq() {
    i++; // [
    const out = [];
    ws();
    if (text[i] === "]") { i++; return out; }
    for (;;) {
      out.push(value());
      ws();
      if (text[i] === ",") { i++; ws(); if (text[i] === "]") { i++; return out; } continue; }
      if (text[i] === "]") { i++; return out; }
      err("expected , or ]");
    }
  }
  function map() {
    i++; // {
    const out = {};
    ws();
    if (text[i] === "}") { i++; return out; }
    for (;;) {
      ws();
      const k = scalarToken();
      ws();
      if (text[i] !== ":") err("expected :");
      i++;
      out[String(k)] = value();
      ws();
      if (text[i] === ",") { i++; continue; }
      if (text[i] === "}") { i++; return out; }
      err("expected , or }");
    }
  }
  const result = value();
  ws();
  if (i !== text.length) err("trailing characters");
  return result;
}

// ---- block structure -----------------------------------------------------
export function parseYaml(source) {
  const lines = source.replace(/\r\n?/g, "\n").replace(/\t/g, "  ").split("\n");
  let i = 0;
  const nextSignificant = (from) => {
    let j = from;
    while (j < lines.length && isSkippable(lines[j])) j++;
    return j;
  };

  function blockScalar(indicator, parentIndent) {
    const folded = indicator.startsWith(">");
    const keep = indicator.includes("+");
    const strip = indicator.includes("-");
    const collected = [];
    let blockIndent = null;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "") { collected.push(""); i++; continue; }
      const ind = indentOf(line);
      if (ind <= parentIndent) break;
      if (blockIndent === null) blockIndent = ind;
      if (ind < blockIndent) break;
      collected.push(line.slice(blockIndent));
      i++;
    }
    while (!keep && collected.length && collected[collected.length - 1] === "") collected.pop();
    let text;
    if (folded) {
      text = collected.reduce((acc, l, idx) => {
        if (idx === 0) return l;
        if (l === "" ) return acc + "\n";
        return acc.endsWith("\n") ? acc + l : acc + " " + l;
      }, "");
    } else text = collected.join("\n");
    return strip ? text : text + "\n";
  }

  function parseNode(indent) {
    i = nextSignificant(i);
    if (i >= lines.length) return null;
    const content = lines[i].slice(indentOf(lines[i]));
    if (content === "-" || content.startsWith("- ")) return parseSeq(indentOf(lines[i]));
    return parseMap(indentOf(lines[i]));
  }

  function parseSeq(indent) {
    const out = [];
    for (;;) {
      i = nextSignificant(i);
      if (i >= lines.length) break;
      const line = lines[i];
      const ind = indentOf(line);
      const content = line.slice(ind);
      if (ind !== indent || !(content === "-" || content.startsWith("- "))) {
        if (ind > indent) throw new YamlError("Unexpected indentation in sequence", i + 1);
        break;
      }
      const itemText = content === "-" ? "" : content.slice(2);
      const itemTrim = itemText.trim();
      if (itemTrim === "" || itemTrim.startsWith("#")) {
        i++;
        const j = nextSignificant(i);
        if (j < lines.length && indentOf(lines[j]) > indent) { i = j; out.push(parseNode(indentOf(lines[j]))); }
        else out.push(null);
        continue;
      }
      const offset = ind + 2 + (itemText.length - itemText.trimStart().length);
      if (KEY_RE.test(itemTrim) && !itemTrim.startsWith("[") && !itemTrim.startsWith("{")) {
        lines[i] = " ".repeat(offset) + itemTrim;
        out.push(parseMap(offset));
        continue;
      }
      if (itemTrim === "|" || itemTrim === ">" || /^[|>][-+]?$/.test(itemTrim)) {
        i++;
        out.push(blockScalar(itemTrim, indent));
        continue;
      }
      out.push(parseScalar(itemTrim, i + 1));
      i++;
    }
    return out;
  }

  function parseMap(indent) {
    const out = {};
    for (;;) {
      i = nextSignificant(i);
      if (i >= lines.length) break;
      const line = lines[i];
      const ind = indentOf(line);
      if (ind < indent) break;
      if (ind > indent) throw new YamlError("Unexpected indentation", i + 1);
      const content = line.slice(ind);
      if (content.startsWith("- ") || content === "-") break; // sequence at parent level
      const m = KEY_RE.exec(content);
      if (!m) throw new YamlError(`Expected "key: value", got "${content.slice(0, 40)}"`, i + 1);
      const key = unquoteKey(m[1]);
      if (Object.prototype.hasOwnProperty.call(out, key)) throw new YamlError(`Duplicate key "${key}"`, i + 1);
      const rest = stripComment(m[2] ?? "").trim();
      const lineNo = i + 1;
      i++;
      if (rest === "") {
        const j = nextSignificant(i);
        if (j < lines.length) {
          const cind = indentOf(lines[j]);
          const ccontent = lines[j].slice(cind);
          if (cind > indent) { i = j; out[key] = parseNode(cind); continue; }
          if (cind === indent && (ccontent.startsWith("- ") || ccontent === "-")) { i = j; out[key] = parseSeq(cind); continue; }
        }
        out[key] = null;
      } else if (/^[|>][-+]?$/.test(rest)) {
        out[key] = blockScalar(rest, indent);
      } else {
        out[key] = parseScalar(rest, lineNo);
      }
    }
    return out;
  }

  i = nextSignificant(0);
  if (i >= lines.length) return {};
  const first = lines[i];
  const rootIndent = indentOf(first);
  const result = parseNode(rootIndent);
  i = nextSignificant(i);
  if (i < lines.length) throw new YamlError("Could not parse remaining content", i + 1);
  return result;
}

// ---- serializer ----------------------------------------------------------
const NEEDS_QUOTE = /^$|^\s|\s$|^[-?:,\[\]{}#&*!|>'"%@`]|: |\s#|^(true|false|null|~|yes|no|on|off)$|^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$|\n/i;

function scalarToYaml(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  const s = String(v);
  return NEEDS_QUOTE.test(s) ? JSON.stringify(s) : s;
}

function isScalar(v) {
  return v === null || v === undefined || typeof v !== "object";
}

export function stringifyYaml(value, indent = 0) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value.map((item) => {
      if (isScalar(item)) return `${pad}- ${scalarToYaml(item)}`;
      if (Array.isArray(item)) {
        if (item.length === 0) return `${pad}- []`;
        return `${pad}-\n${stringifyYaml(item, indent + 2)}`;
      }
      const keys = Object.keys(item);
      if (keys.length === 0) return `${pad}- {}`;
      const body = stringifyYaml(item, indent + 2);
      return `${pad}- ${body.slice(indent + 2)}`;
    }).join("\n");
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    return keys.map((k) => {
      const v = value[k];
      const key = /^[A-Za-z0-9_$][A-Za-z0-9_.\-$]*$/.test(k) ? k : JSON.stringify(k);
      if (isScalar(v)) return `${pad}${key}: ${scalarToYaml(v)}`;
      if (Array.isArray(v) && v.length === 0) return `${pad}${key}: []`;
      if (!Array.isArray(v) && Object.keys(v).length === 0) return `${pad}${key}: {}`;
      if (Array.isArray(v) && v.every(isScalar) && v.length <= 6 && v.every((x) => String(x).length < 40)) {
        return `${pad}${key}: [${v.map((x) => (typeof x === "string" ? JSON.stringify(x) : scalarToYaml(x))).join(", ")}]`;
      }
      return `${pad}${key}:\n${stringifyYaml(v, indent + 2)}`;
    }).join("\n");
  }
  return pad + scalarToYaml(value);
}
