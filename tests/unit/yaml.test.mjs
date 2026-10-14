import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYaml, stringifyYaml, YamlError } from "../../scripts/lib/yaml.mjs";
import { parseFrontmatter, setFrontmatterScalars, headings } from "../../scripts/lib/frontmatter.mjs";

test("parses scalars, lists, nested maps and sequences of maps", () => {
  const y = `
id: TASK-001
title: "Quoted: with colon"
count: 3
ratio: 0.5
flag: true
nothing: null
inline: [a, "b c", 3]
emptyList: []
map:
  inner: value # comment
  deeper:
    x: 1
list:
  - one
  - two
validation:
  - cmd: npm test
    expect: exit 0
  - cmd: "npm run lint -- --max-warnings=0"
    expect: exit 0
sameIndent:
- p
- q
`;
  const d = parseYaml(y);
  assert.equal(d.id, "TASK-001");
  assert.equal(d.title, "Quoted: with colon");
  assert.equal(d.count, 3);
  assert.equal(d.ratio, 0.5);
  assert.equal(d.flag, true);
  assert.equal(d.nothing, null);
  assert.deepEqual(d.inline, ["a", "b c", 3]);
  assert.deepEqual(d.emptyList, []);
  assert.deepEqual(d.map, { inner: "value", deeper: { x: 1 } });
  assert.deepEqual(d.list, ["one", "two"]);
  assert.deepEqual(d.validation, [
    { cmd: "npm test", expect: "exit 0" },
    { cmd: "npm run lint -- --max-warnings=0", expect: "exit 0" },
  ]);
  assert.deepEqual(d.sameIndent, ["p", "q"]);
});

test("block scalars", () => {
  const d = parseYaml("a: |\n  line1\n  line2\nb: >-\n  folded\n  text\n");
  assert.equal(d.a, "line1\nline2\n");
  assert.equal(d.b, "folded text");
});

test("flow mappings and dates stay strings", () => {
  const d = parseYaml("m: {k: v, n: 2}\ndate: 2026-10-14\nurl: https://example.com/x");
  assert.deepEqual(d.m, { k: "v", n: 2 });
  assert.equal(d.date, "2026-10-14");
  assert.equal(d.url, "https://example.com/x");
});

test("rejects duplicate keys and bad indentation with line numbers", () => {
  assert.throws(() => parseYaml("a: 1\na: 2"), (e) => e instanceof YamlError && /Duplicate key/.test(e.message) && e.line === 2);
  assert.throws(() => parseYaml("a: 1\n   b: 2"), YamlError);
  assert.throws(() => parseYaml('a: "unterminated'), YamlError);
});

test("stringify round-trips", () => {
  const data = {
    id: "TASK-002", title: "Has: colon", n: 1, b: false, nul: null, empty: [], obj: {},
    list: ["a", "b"], long: ["x".repeat(50)], items: [{ cmd: "npm test", expect: "exit 0" }, { cmd: "true", expect: "1" }],
    nested: { a: { b: [1, 2] } }, numericString: "123", boolString: "true",
  };
  assert.deepEqual(parseYaml(stringifyYaml(data)), data);
});

test("frontmatter parse, in-place scalar update, headings", () => {
  const text = "---\r\nid: TASK-1\r\nstatus: ready\r\nlist:\r\n  - a\r\n---\r\n\r\n## Objective\r\nx\r\n## Steps\r\n";
  const fm = parseFrontmatter(text);
  assert.equal(fm.data.status, "ready");
  assert.deepEqual(headings(fm.body), ["Objective", "Steps"]);
  const updated = setFrontmatterScalars(text, { status: "in_progress", attempts: 1 });
  const re = parseFrontmatter(updated);
  assert.equal(re.data.status, "in_progress");
  assert.equal(re.data.attempts, 1);
  assert.deepEqual(re.data.list, ["a"]);
  assert.match(updated, /## Objective\nx\n/);
  assert.throws(() => setFrontmatterScalars(text, { list: "x" }), /not a scalar/);
});

test("missing frontmatter is reported, not thrown", () => {
  const fm = parseFrontmatter("# just markdown");
  assert.equal(fm.hasFrontmatter, false);
});
