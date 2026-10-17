// Regression tests for TASK-002 round-2 review findings (code CR-1..CR-4,
// security SEC-1..SEC-5). Each case was reproduced against the round-1 code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../../hooks/lib/bash-rules.mjs";

const d = (cmd, opts) => classify(cmd, opts).decision;
const IMPL = { subagent: true, canSaveReviews: false, access: "write" };
const REVIEWER = { subagent: true, readOnly: true, canSaveReviews: true, access: "review" };
const ORCH = { subagent: true, readOnly: true, canSaveReviews: false, access: "orchestrate" };

test("CR-1: a redirect on the heredoc opener line is still a write", () => {
  for (const c of [
    "cat <<'EOF' > reports/reviews/TASK-002-code.md\nverdict: approve\nEOF",
    "cat <<-EOF >> tasks/TASK-001-x.md\nstatus: done\nEOF",
    'cat <<"END" >reports/handoffs/TASK-001.md\nx\nEND',
  ]) assert.equal(d(c, IMPL), "deny", c);
  assert.equal(d("cat <<'EOF' > src/x.ts\nx\nEOF", REVIEWER), "deny");
  assert.equal(d("node /p/scripts/reports.mjs save handoff TASK-001 <<'EOF'\nrm -rf / > x\nEOF", IMPL), "allow", "heredoc body is still data");
});

test("CR-2: fd-prefixed, &> and >| redirects are writes; 2>&1 and /dev/null are not", () => {
  for (const c of ["echo x 1>reports/reviews/a.md", "echo x &>tasks/TASK-001-x.md", "echo x >| tasks/TASK-001-x.md", "echo hi>reports/audits/a.md"]) assert.equal(d(c, IMPL), "deny", c);
  for (const c of ["npm test 2>&1", "npm test 2>/dev/null", "npm test > /dev/null 2>&1", 'grep "a=>b" src', "rg -- '->' src"]) assert.equal(d(c, REVIEWER), "allow", c);
  assert.equal(d("npm test 2> err.log", REVIEWER), "deny");
});

test("CR-3/SEC-5: wrapped and indirect writes are detected", () => {
  for (const c of ["if true; then cp /tmp/f reports/reviews/a.md; fi", "for f in a; do mv $f reports/handoffs/; done", 'bash -c "cp a reports/reviews/X.md"', "sh -c 'echo x > tasks/TASK-001-x.md'", "env FOO=1 cp a reports/reviews/b.md", "xargs cp -t reports/reviews/ < list"]) assert.equal(d(c, IMPL), "deny", c);
  for (const c of ['find . -name "*.tmp" -delete', "find . -exec rm {} ;", "ls | xargs rm", "xargs rm < list.txt", "npm run lint -- --fix", "pnpm run format -- --write", "{ cp a b; }", "! touch x"]) assert.equal(d(c, REVIEWER), "deny", c);
  for (const c of ["find . -name '*.md'", "xargs grep TODO < files.txt", "npm run lint", "bash -c 'npm test'"]) assert.equal(d(c, REVIEWER), "allow", c);
});

test("CR-4: secret-file names inside messages/prose do not trigger, real file arguments do", () => {
  for (const c of ['git commit -m "fix .env loading"', "gh pr create --title 'Document .env.example' --body 'see .env docs'"]) assert.equal(d(c, {}), "allow", c);
  for (const c of ['cat ".env"', "cat '.env.local'"]) assert.equal(d(c, {}), "ask", c);
});

test("SEC-1: review/audit saves cannot be smuggled past the reviewer-only rule; subagents cannot run lifecycle transitions", () => {
  for (const c of [
    'node "/p/scripts/reports.mjs" --root "D:/p" save review TASK-001 code <<\'EOF\'\nx\nEOF',
    "node /p/scripts/reports.mjs --json save review TASK-001 code < r.md",
    'node scripts/reports.mjs save "review" TASK-001 code < /tmp/r.md',
    "node scripts/reports.mjs save 'audit' AUDIT-20261014 security < r.md",
  ]) assert.equal(d(c, IMPL), "deny", c);
  assert.equal(d("node /p/scripts/reports.mjs --root /x save review TASK-001 code < r.md", REVIEWER), "allow");
  assert.equal(d("node /p/scripts/reports.mjs save handoff TASK-001 < h.md", IMPL), "allow");
  assert.equal(d("node /p/scripts/tasks.mjs transition TASK-001 done", IMPL), "deny");
  assert.equal(d('node "/p/scripts/tasks.mjs" --root x transition TASK-001 review', IMPL), "deny");
  assert.equal(d("node /p/scripts/tasks.mjs transition TASK-001 review", ORCH), "allow", "orchestrator subagent may transition");
  assert.equal(d("node /p/scripts/tasks.mjs transition TASK-001 ready", { subagent: true, canSaveReviews: false, access: "plan" }), "allow", "planner promotes tasks");
  assert.equal(d("node /p/scripts/tasks.mjs transition TASK-001 done", {}), "allow", "main thread (human-driven) is governed by permissions");
  assert.equal(d("node /p/scripts/tasks.mjs status", IMPL), "allow");
});

test("SEC-2: git global options do not hide state changes", () => {
  for (const c of ["git -C /d/p stash", "git -C . checkout -- src/a.js", "git --no-pager -c core.x=y commit -m x", "git --git-dir=.git --work-tree=. reset HEAD~1"]) assert.equal(d(c, REVIEWER), "deny", c);
  assert.equal(d("git -C . checkout -- tasks/TASK-001-x.md", IMPL), "deny");
  for (const c of ["git -C . diff HEAD~1", "git --no-pager log -5", "git -C /d/p status"]) assert.equal(d(c, REVIEWER), "allow", c);
});

test("SEC-3: interpreter one-liners that write are detected", () => {
  for (const c of [`node -e "require('fs').writeFileSync('reports/reviews/TASK-001-code.md','x')"`, `python -c "open('reports/reviews/TASK-001-code.md','w').write('x')"`, `node -e "fs.rmSync('tasks/TASK-001-x.md')"`]) assert.equal(d(c, IMPL), "deny", c);
  for (const c of [`node -e "require('fs').writeFileSync('src/a.js','x')"`, `python3 -c "import shutil; shutil.rmtree('build')"`, `node --eval "require('fs').unlinkSync('x')"`]) assert.equal(d(c, REVIEWER), "deny", c);
  for (const c of [`node -e "console.log(require('./package.json').version)"`, `python -c "import json,sys; print(json.load(open('a.json')))"`]) assert.equal(d(c, REVIEWER), "allow", c);
});

test("SEC-4: globbed secret reads ask", () => {
  for (const c of ["cat .env*", "cat config/*.env", "head -5 .env.*"]) assert.equal(d(c, {}), "ask", c);
  assert.equal(d("cat .env.example", {}), "allow");
});
