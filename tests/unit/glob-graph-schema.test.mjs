import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesAny, globsMayOverlap, setsMayOverlap } from "../../scripts/lib/glob.mjs";
import { findCycle, topoOrder } from "../../scripts/lib/graph.mjs";
import { validate } from "../../scripts/lib/schema.mjs";
import { touchesSensitive } from "../../scripts/lib/gate.mjs";

test("glob matching", () => {
  assert.ok(matchesAny("src/a/x.ts", ["src/a/**"]));
  assert.ok(matchesAny("src/a/deep/x.ts", ["src/**/*.ts"]));
  assert.ok(matchesAny("README.md", ["README.md"]));
  assert.ok(matchesAny("src\\a\\x.ts", ["src/a/**"]), "windows separators normalised");
  assert.ok(matchesAny("src/x.tsx", ["src/*.{ts,tsx}"]));
  assert.ok(!matchesAny("src/b/x.ts", ["src/a/**"]));
  assert.ok(!matchesAny("src/a.ts", ["src/a/**"]));
});

test("conservative overlap", () => {
  assert.equal(globsMayOverlap("src/a/**", "src/b/**"), false);
  assert.equal(globsMayOverlap("src/a/**", "src/a/x.ts"), true);
  assert.equal(globsMayOverlap("src/**", "src/a/x.ts"), true);
  assert.equal(globsMayOverlap("docs/x.md", "docs/y.md"), false);
  assert.equal(globsMayOverlap("src/**/*.ts", "src/**/*.css"), true, "unprovable disjointness → overlap");
  assert.equal(setsMayOverlap(["a/**", "b/**"], ["c/**"]), false);
  assert.equal(setsMayOverlap(["a/**", "b/**"], ["b/x"]), true);
});

test("security-sensitive scopes", () => {
  const s = ["**/auth/**", "**/*auth*", "**/api/**", ".github/workflows/**"];
  assert.ok(touchesSensitive(["src/auth/**"], s));
  assert.ok(touchesSensitive(["src/lib/oauth.ts"], s));
  assert.ok(touchesSensitive(["app/api/users/route.ts"], s));
  assert.ok(touchesSensitive(["src/**"], s), "broad top-level scope is treated as sensitive");
  assert.ok(touchesSensitive(["**"], s));
  assert.ok(!touchesSensitive(["src/components/Button.tsx", "docs/**"], s));
});

test("cycle detection and topo order", () => {
  assert.equal(findCycle({ A: [], B: ["A"], C: ["B"] }), null);
  assert.deepEqual(findCycle({ A: ["C"], B: ["A"], C: ["B"] }), ["A", "C", "B", "A"]);
  assert.deepEqual(findCycle({ A: ["A"] }), ["A", "A"]);
  assert.deepEqual(topoOrder({ C: ["B"], B: ["A"], A: [] }), ["A", "B", "C"]);
  assert.throws(() => topoOrder({ A: ["B"], B: ["A"] }), /cycle/);
});

test("schema validator", () => {
  const schema = {
    type: "object", required: ["id"], additionalProperties: false,
    properties: { id: { type: "string", pattern: "^T-\\d+$" }, n: { type: "integer", minimum: 0 }, tags: { type: "array", items: { enum: ["a", "b"] }, uniqueItems: true }, ref: { $ref: "#/$defs/x" } },
    $defs: { x: { type: ["string", "null"] } },
  };
  assert.deepEqual(validate(schema, { id: "T-1", n: 2, tags: ["a"], ref: null }), []);
  const errs = validate(schema, { id: "X", n: -1, tags: ["a", "a", "c"], extra: 1, ref: 3 });
  assert.ok(errs.some((e) => /must match/.test(e)));
  assert.ok(errs.some((e) => /must be >= 0/.test(e)));
  assert.ok(errs.some((e) => /unique/.test(e)));
  assert.ok(errs.some((e) => /must be one of/.test(e)));
  assert.ok(errs.some((e) => /unknown property "extra"/.test(e)));
  assert.ok(errs.some((e) => /\$\.ref: expected string\|null/.test(e)));
  assert.ok(validate(schema, {}).some((e) => /missing required property "id"/.test(e)));
});
