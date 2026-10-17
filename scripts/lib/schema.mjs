// Small JSON-Schema (draft 2020-12 subset) validator, dependency-free.
// Supports: type, enum, const, required, properties, additionalProperties
// (boolean or schema), items, minItems, maxItems, uniqueItems, minLength,
// maxLength, pattern, minimum, maximum, $ref to local "#/$defs/...",
// anyOf, oneOf (first match), propertyNames.pattern.

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  return typeof v;
}

function typeMatches(expected, v) {
  const t = typeOf(v);
  if (expected === "number") return t === "number" || t === "integer";
  return expected === t;
}

function resolveRef(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`Unsupported $ref ${ref}`);
  return ref.slice(2).split("/").reduce((node, key) => node?.[key], root);
}

export function validate(schema, value, root = schema, path = "$") {
  const errors = [];
  const push = (msg) => errors.push(`${path}: ${msg}`);
  if (schema === true) return errors;
  if (schema === false) { push("not allowed"); return errors; }
  if (schema.$ref) return validate(resolveRef(root, schema.$ref), value, root, path);

  if (schema.anyOf) {
    const ok = schema.anyOf.some((s) => validate(s, value, root, path).length === 0);
    if (!ok) push("does not match any allowed form");
  }
  if (schema.oneOf) {
    const n = schema.oneOf.filter((s) => validate(s, value, root, path).length === 0).length;
    if (n !== 1) push(`must match exactly one allowed form (matched ${n})`);
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(t, value))) {
      push(`expected ${types.join("|")}, got ${typeOf(value)}`);
      return errors;
    }
  }
  if (schema.const !== undefined && value !== schema.const) push(`must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) push(`must be one of ${schema.enum.join(", ")} (got ${JSON.stringify(value)})`);

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) push(`must have length >= ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) push(`must have length <= ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) push(`must match /${schema.pattern}/`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) push(`must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) push(`must be <= ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) push(`must have at least ${schema.minItems} item(s)`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) push(`must have at most ${schema.maxItems} item(s)`);
    if (schema.uniqueItems) {
      const seen = new Set(value.map((x) => JSON.stringify(x)));
      if (seen.size !== value.length) push("items must be unique");
    }
    if (schema.items) value.forEach((item, idx) => errors.push(...validate(schema.items, item, root, `${path}[${idx}]`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value) || value[key] === undefined) push(`missing required property "${key}"`);
    }
    const props = schema.properties ?? {};
    for (const [key, v] of Object.entries(value)) {
      if (schema.propertyNames?.pattern && !new RegExp(schema.propertyNames.pattern).test(key)) {
        push(`property name "${key}" must match /${schema.propertyNames.pattern}/`);
      }
      if (props[key]) errors.push(...validate(props[key], v, root, `${path}.${key}`));
      else if (schema.additionalProperties === false) push(`unknown property "${key}"`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        errors.push(...validate(schema.additionalProperties, v, root, `${path}.${key}`));
      }
    }
  }
  return errors;
}
