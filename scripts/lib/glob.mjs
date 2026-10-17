// Glob helpers. Paths are always compared in POSIX form, relative to the
// project root.
import { posix } from "node:path";

/** POSIX separators, normalised ("a/./b/../c" -> "a/c"), no leading "./". May keep leading "../". */
export function toPosix(p) {
  const s = String(p).replace(/\\/g, "/");
  if (s === "") return s;
  const n = posix.normalize(s).replace(/^\.\//, "");
  return n === "." ? "" : n;
}

/** True when a (normalised) relative path escapes its root or is absolute. */
export function escapesRoot(p) {
  const n = toPosix(p);
  return n === ".." || n.startsWith("../") || n.startsWith("/") || /^[a-zA-Z]:/.test(n);
}

function globBody(g) {
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        const slash = g[i + 2] === "/";
        re += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = g.indexOf("}", i);
      if (end === -1) { re += "\\{"; continue; }
      re += "(?:" + g.slice(i + 1, end).split(",").map(globBody).join("|") + ")";
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return re;
}

export function globToRegExp(glob, { nocase = false } = {}) {
  return new RegExp(`^${globBody(String(glob).replace(/\\/g, "/").replace(/^\.\//, ""))}$`, nocase ? "i" : "");
}

/** Case-insensitive file systems (Windows, macOS) need case-insensitive policy matching. */
export const CASE_INSENSITIVE_FS = process.platform === "win32" || process.platform === "darwin";

export function matchesAny(path, globs = [], { nocase = false } = {}) {
  const p = toPosix(path);
  const eq = (a, b) => (nocase ? a.toLowerCase() === b.toLowerCase() : a === b);
  return globs.some((g) => {
    const pg = String(g).replace(/\\/g, "/").replace(/^\.\//, "");
    if (eq(pg, p)) return true;
    if (pg.endsWith("/") && (nocase ? p.toLowerCase().startsWith(pg.toLowerCase()) : p.startsWith(pg))) return true;
    return globToRegExp(pg, { nocase }).test(p);
  });
}

/** Literal prefix of a glob up to the first wildcard character. */
export function staticPrefix(glob) {
  const g = toPosix(glob);
  const idx = g.search(/[*?{[]/);
  return idx === -1 ? g : g.slice(0, idx);
}

/**
 * Conservative overlap test between two globs: returns true unless we can
 * prove the matched path sets are disjoint. False positives only cost
 * parallelism, never correctness.
 */
export function globsMayOverlap(a, b) {
  const ga = toPosix(a), gb = toPosix(b);
  if (ga === gb) return true;
  const pa = staticPrefix(ga), pb = staticPrefix(gb);
  const aLiteral = pa === ga, bLiteral = pb === gb;
  if (aLiteral && bLiteral) return ga === gb || ga.startsWith(gb.endsWith("/") ? gb : gb + "/") || gb.startsWith(ga.endsWith("/") ? ga : ga + "/");
  if (aLiteral) return globToRegExp(gb).test(ga) || pathPrefixRelated(pa, pb);
  if (bLiteral) return globToRegExp(ga).test(gb) || pathPrefixRelated(pa, pb);
  return pathPrefixRelated(pa, pb);
}

function pathPrefixRelated(pa, pb) {
  return pa.startsWith(pb) || pb.startsWith(pa);
}

export function setsMayOverlap(globsA = [], globsB = []) {
  return globsA.some((a) => globsB.some((b) => globsMayOverlap(a, b)));
}
