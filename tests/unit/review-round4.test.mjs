// Regression tests for the TASK-002 round-3 escalation findings, fixed in
// the follow-up hardening pass: CR-5/SEC-10 (framework-script heredoc false
// positive) and SEC-9 (cd/pushd relative writes bypassing protected-path
// detection). Also covers Windows-style backslash paths for both.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, cdJoin } from "../../hooks/lib/bash-rules.mjs";

const d = (cmd, opts) => classify(cmd, opts).decision;
const IMPL = { subagent: true, canSaveReviews: false, access: "write" };
const REVIEWER = { subagent: true, readOnly: true, canSaveReviews: true, access: "review" };

test("CR-5/SEC-10: a framework-script heredoc is data even when its prose names fs write functions", () => {
  // The reviewer's own finding text describing the bug must not deny the
  // reviewer's save of that finding.
  assert.equal(
    d("node /p/scripts/reports.mjs save review TASK-002 code <<'EOF'\nFinding: handler calls fs.writeFileSync to overwrite the config without validation.\nEOF", REVIEWER),
    "allow",
    "reviewer saving a review that quotes writeFileSync in prose",
  );
  assert.equal(
    d("node /p/scripts/reports.mjs save audit AUDIT-20261014 security <<'EOF'\nUses shutil.rmtree on an untrusted path; also mentions Remove-Item.\nEOF", REVIEWER),
    "allow",
  );
  assert.equal(
    d("node /p/scripts/reports.mjs save handoff TASK-001 <<'EOF'\nUnresolved: the write path uses os.remove on cleanup.\nEOF", IMPL),
    "allow",
    "implementer saving a handoff that mentions os.remove in prose",
  );
  // A bare interpreter heredoc (no trusted script argument) must still deny:
  // the body really is executed as code here, not stdin text.
  assert.equal(
    d("node <<'EOF'\nrequire('fs').writeFileSync('reports/reviews/TASK-001-code.md','b')\nEOF", IMPL),
    "deny",
    "bare `node <<EOF` still executes the body as code",
  );
  // A reviewer still can't be smuggled into actually saving under the wrong
  // kind — frameworkCall() recognising the invocation doesn't bypass the
  // reviewer-only / independence rule enforced on the stripped command.
  assert.equal(
    d("node /p/scripts/reports.mjs save review TASK-002 code <<'EOF'\nharmless\nEOF", IMPL),
    "deny",
    "implementer still cannot save a review, framework-call exemption or not",
  );
});

test("SEC-9: cd/pushd into a protected directory then a relative write is still denied", () => {
  for (const c of [
    "cd reports/reviews && cat > TASK-002-code.md <<'EOF'\nverdict: approve\nEOF",
    "cd reports/handoffs; echo done > TASK-001.md",
    "pushd tasks && touch TASK-099-new.md",
    "cd reports && cd reviews && cp /tmp/x TASK-003-code.md",
  ]) assert.equal(d(c, IMPL), "deny", c);
  // Unrelated directories are unaffected.
  for (const c of ["cd src && touch a.js", "cd /tmp && npm test", "cd ../other && cat > x.md"]) {
    assert.equal(d(c, IMPL), "allow", c);
  }
});

test("SEC-9: cd tracking is Windows-backslash tolerant", () => {
  assert.equal(d("cd reports\\reviews && echo x > TASK-002-code.md", IMPL), "deny");
  assert.equal(d("cd tasks\\ && type nul > TASK-050-x.md", IMPL), "deny");
  assert.equal(cdJoin("", "reports\\reviews"), "reports/reviews");
  assert.equal(cdJoin("reports", "reviews"), "reports/reviews");
  assert.equal(cdJoin("reports/reviews", ".."), "reports");
  assert.equal(cdJoin("a/b", "C:\\elsewhere"), "C:/elsewhere");
});

test("SEC-9: a read-only agent is unaffected by cd tracking for genuine reads", () => {
  assert.equal(d("cd reports/reviews && cat TASK-001-code.md", REVIEWER), "allow");
  assert.equal(d("cd reports/reviews && git diff", REVIEWER), "allow");
});
