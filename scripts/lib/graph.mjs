// Dependency graph utilities.

/**
 * Find a dependency cycle. `deps` maps node -> array of nodes it depends on.
 * Returns the cycle as an array of nodes (first === last) or null.
 */
export function findCycle(deps) {
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map();
  const stack = [];
  for (const n of Object.keys(deps)) color.set(n, WHITE);

  function visit(n) {
    color.set(n, GREY);
    stack.push(n);
    for (const d of deps[n] ?? []) {
      if (!color.has(d)) continue; // missing deps reported elsewhere
      if (color.get(d) === GREY) return [...stack.slice(stack.indexOf(d)), d];
      if (color.get(d) === WHITE) {
        const c = visit(d);
        if (c) return c;
      }
    }
    stack.pop();
    color.set(n, BLACK);
    return null;
  }
  for (const n of Object.keys(deps)) {
    if (color.get(n) === WHITE) {
      const c = visit(n);
      if (c) return c;
    }
  }
  return null;
}

/** Kahn topological order; throws if a cycle exists. */
export function topoOrder(deps) {
  const indeg = new Map(Object.keys(deps).map((n) => [n, 0]));
  for (const [n, ds] of Object.entries(deps)) for (const d of ds) if (indeg.has(d)) indeg.set(n, indeg.get(n) + 1);
  const queue = [...indeg].filter(([, v]) => v === 0).map(([k]) => k).sort();
  const out = [];
  const dependents = new Map();
  for (const [n, ds] of Object.entries(deps)) for (const d of ds) {
    if (!dependents.has(d)) dependents.set(d, []);
    dependents.get(d).push(n);
  }
  while (queue.length) {
    const n = queue.shift();
    out.push(n);
    for (const m of (dependents.get(n) ?? []).sort()) {
      indeg.set(m, indeg.get(m) - 1);
      if (indeg.get(m) === 0) queue.push(m);
    }
  }
  if (out.length !== indeg.size) throw new Error("Dependency cycle detected");
  return out;
}
