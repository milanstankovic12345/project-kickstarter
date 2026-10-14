# Input validation & output encoding

The principle: **validate on input, encode on output, and use safe APIs at
sinks.** Client-side validation is for user experience only and never
counts as a control.

## Validation
- Validate server-side at the trust boundary with a schema library (zod,
  pydantic, Joi, class-validator, JSON Schema, etc.).
- Prefer allowlists to denylists: enums, regexes anchored with `^…$`, and
  numeric ranges.
- Cap lengths and sizes on every string, array, file and request body.
- Canonicalise before validating: decode once, normalise unicode, and
  resolve paths before checking prefixes.
- Treat everything as untrusted: headers, cookies, filenames, MIME types,
  webhook payloads, data from your own DB that users originally supplied,
  and LLM output.

## Sinks and safe patterns

| Sink | Unsafe | Safe |
|---|---|---|
| SQL | String concatenation or interpolation, raw query with template literals | Parameterised queries or the ORM query builder; allowlist identifiers (column or sort names) |
| NoSQL | Passing request objects directly (`{$gt: ""}` operator injection) | Cast to expected primitive types; strip `$` keys |
| OS command | `exec("cmd " + input)`, `shell=True` | `execFile`/`spawn` with an argument array, no shell; allowlist values |
| File path | `join(base, input)` without a check | Resolve, then verify the result is inside `base`; reject `..` and absolute paths; generate server-side names for uploads |
| HTML | `innerHTML`, `dangerouslySetInnerHTML`, `v-html`, unescaped templates | Framework auto-escaping; sanitise rich text with a maintained sanitiser (e.g. DOMPurify) with a strict config |
| URL / redirect | Redirect to `?next=` as given | Allowlist relative paths or known hosts |
| Template engine | Rendering user input as a template | Pass input as data only |
| Deserialisation | `pickle`, `yaml.load`, `ObjectInputStream`, `unserialize` on untrusted data | JSON plus schema validation; `yaml.safe_load` |
| Regex | User-supplied regex, or catastrophic backtracking patterns on user input | Fixed patterns, RE2 or a timeout, length caps |
| Logs | Logging raw input (log injection) and secrets | Structured logging, encoding of newlines, redaction |

## File uploads
Cap the size. Check the content type by sniffing the content, not only the
extension. Store outside the web root or in object storage with
server-generated names. Serve with `Content-Disposition: attachment` and a
safe content type. Scan if policy requires it. Process images in a
sandbox or with a maintained library.
