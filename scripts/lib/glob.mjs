// Glob helpers. Paths are always compared in POSIX form, relative to the
// project root.

export function toPosix(p) {
  return String(p).replace(/\\/g, "/").replace(/^\.\//, "");
}

export function globToRegExp(glob) {
  const g = toPosix(glob);
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
      re += "(?:" + g.slice(i + 1, end).split(",").map((s) => s.replace(/[.+^$()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")).join("|") + ")";
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(path, globs = []) {
  const p = toPosix(path);
  return globs.some((g) => {
    const pg = toPosix(g);
    if (pg === p) return true;
    if (pg.endsWith("/") && p.startsWith(pg)) return true;
    return globToRegExp(pg).test(p);
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
