// Regression tests for TASK-002 round-3 (security re-review round 2:
// SEC-1, SEC-3 open; SEC-6..SEC-8 new). Cases are the reviewer's probes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../../hooks/lib/bash-rules.mjs";

const d = (cmd, opts) => classify(cmd, opts).decision;
const IMPL = { subagent: true, canSaveReviews: false, access: "write" };
const REVIEWER = { subagent: true, readOnly: true, canSaveReviews: true, access: "review" };
const ORCH = { subagent: true, readOnly: true, canSaveReviews: false, access: "orchestrate" };
const PLAN = { subagent: true, canSaveReviews: false, access: "plan" };

test("SEC-1: token-based default deny regardless of node flags, subshells or shell wrappers", () => {
  for (const c of [
    "node --no-warnings scripts/reports.mjs save review TASK-001 code",
    "node --trace-warnings scripts/reports.mjs save review TASK-001 code",
    "node --no-warnings scripts/tasks.mjs transition TASK-001 done",
    "node -r ./x.cjs scripts/tasks.mjs transition TASK-001 done",
    "(node scripts/tasks.mjs transition TASK-001 done)",
    "bash -lc 'node scripts/reports.mjs save review TASK-001 code'",
    'cmd /c "node scripts\\reports.mjs save audit AUDIT-20261014 security"',
    "npx node scripts/tasks.mjs transition TASK-001 done",
  ]) assert.equal(d(c, IMPL), "deny", c);
  // legitimate uses stay allowed
  assert.equal(d("node --no-warnings /p/scripts/reports.mjs save review TASK-001 code < r.md", REVIEWER), "allow");
  assert.equal(d("node /x/code-review-project/scripts/reports.mjs save handoff TASK-001 <<'EOF'\nreview notes\nEOF", IMPL), "allow", "path or body containing 'review' is not a review save");
  assert.equal(d("(node /p/scripts/tasks.mjs transition TASK-001 review)", ORCH), "allow");
  assert.equal(d("node /p/scripts/tasks.mjs transition TASK-001 ready", PLAN), "allow");
  assert.equal(d("node /p/scripts/tasks.mjs status", IMPL), "allow");
});

test("SEC-3: interpreter flags before -e and interpreter heredocs are inspected", () => {
  assert.equal(d(`node --input-type=module -e "import {writeFileSync} from 'fs'; writeFileSync('reports/reviews/x.md','b')"`, IMPL), "deny");
  assert.equal(d(`node --input-type=module -e "import fs from 'fs'; fs.writeFileSync('a','b')"`, REVIEWER), "deny");
  assert.equal(d("node <<'EOF'\nrequire('fs').writeFileSync('reports/reviews/TASK-001-code.md','b')\nEOF", IMPL), "deny");
  assert.equal(d("python - <<'EOF'\nopen('reports/reviews/TASK-001-code.md','w').write('x')\nEOF", IMPL), "deny");
  assert.equal(d("bash <<'EOF'\ncp a reports/reviews/X.md\nEOF", IMPL), "deny");
  assert.equal(d("node <<'EOF'\nrequire('fs').writeFileSync('src/a.js','x')\nEOF", REVIEWER), "deny");
  assert.equal(d("node <<'EOF'\nconsole.log(1+1)\nEOF", REVIEWER), "allow");
  assert.equal(d("cat <<'EOF'\nrequire('fs').writeFileSync('reports/reviews/x.md')\nEOF", IMPL), "allow", "non-interpreter heredoc body is data");
});

test("SEC-6: reads and messages mentioning framework paths are not denied", () => {
  assert.equal(d(`node -e "console.log(require('fs').readFileSync('reports/reviews/TASK-001-code.md','utf8'))"`, REVIEWER), "allow");
  assert.equal(d('git commit -m "fix: update reports/reviews handling"', IMPL), "allow");
  assert.equal(d("git add src/a.js reports/handoffs/TASK-001.md", IMPL), "allow");
  assert.equal(d("git checkout -- reports/reviews/TASK-001-code.md", IMPL), "deny", "restoring framework state still denied");
});

test("SEC-7: search patterns mentioning .env do not ask; searching inside .env still asks", () => {
  for (const c of ['rg -n "\\.env" hooks', "grep -rn '.env' src", "git grep -n .env -- src"]) assert.equal(d(c, REVIEWER), "allow", c);
  for (const c of ["grep API_KEY .env", 'rg -n "KEY" .env.local']) assert.equal(d(c, {}), "ask", c);
});

test("SEC-8: wrapper variants", () => {
  for (const c of ["find . | xargs -n1 rm", "xargs -I{} rm {} < list", "xargs -0 rm < list", "find . -name x -exec /bin/rm {} ;", "git -P checkout main", "/bin/rm -f x"]) assert.equal(d(c, REVIEWER), "deny", c);
});
