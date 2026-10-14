// GENERATED from project-kickstarter hooks/lib/bash-rules.mjs — do not edit by hand.
// Claude Code PreToolUse hook (matcher: Bash). Copy to .claude/hooks/ and register
// with the settings snippet. Denies catastrophic commands, asks a human for risky ones.
// Output format per https://code.claude.com/docs/en/hooks (permissionDecision +
// permissionDecisionReason). Fails open on malformed input.
// Command classification for the Bash guard. Pure and dependency-free so
// it can be unit-tested and mirrored into the kickstarter's standalone
// template (templates/hooks/guard-bash.mjs); a parity test keeps them aligned.

// rm with a recursive flag (short or long form) — used by DENY and ASK.
const RM_RECURSIVE = String.raw`\brm(?=[^;&|]*\s(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)(\s|$))`;
const RM_FORCE_OR_RECURSIVE = String.raw`\brm(?=[^;&|]*\s(-[a-zA-Z]*[rRf][a-zA-Z]*|--recursive|--force)(\s|$))`;

// Catastrophic: never run automatically.
const DENY = [
  [new RegExp(RM_RECURSIVE + String.raw`[^;&|]*\s(\/|~\/?|\$HOME\/?|\/\*|\*)(\s|$)`), "recursive delete of root, home or wildcard-at-cwd"],
  [/\brm\s[^;&|]*--no-preserve-root\b/, "rm --no-preserve-root"],
  [/\bmkfs(\.\w+)?\b|\bFormat-Volume\b|\bdiskpart\b|\bformat\s+[a-zA-Z]:/i, "filesystem format"],
  [/\bdd\s+[^|]*\bof=\/dev\/(sd|nvme|hd|disk)/, "raw disk write"],
  [/>\s*\/dev\/(sd|nvme|hd|disk)\w*/, "raw disk write"],
  [/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, "fork bomb"],
  [/\bchmod\s+(-R|--recursive)\s+0?777\s+\/(\s|$)/, "recursive chmod 777 on /"],
  [/\bRemove-Item\b(?=.*\s-Recurse\b)(?=.*\s(C:\\?|\/|~|\$HOME|\$env:USERPROFILE)(\s|$))/i, "recursive delete of a drive root or home"],
  [/\bcurl\b[^|]*\|\s*(sudo\s+)?(ba|z|)sh\b|\bwget\b[^|]*\|\s*(sudo\s+)?(ba|z|)sh\b|\biwr\b[^|]*\|\s*iex\b/i, "piping a remote script into a shell"],
];

// Risky but sometimes legitimate: require a human to approve.
const ASK = [
  [new RegExp(RM_FORCE_OR_RECURSIVE), "rm with recursive/force flags"],
  [/\bRemove-Item\b.*\s-(Recurse|Force)\b/i, "Remove-Item -Recurse/-Force"],
  [/\b(del|erase)\s+.*\/[sq]\b|\b(rd|rmdir)\s+.*\/s\b/i, "recursive delete (cmd)"],
  [/\bgit\s+push\b.*(\s--force(-with-lease)?\b|\s-f\b|\s\+\S+)/, "force push"],
  [/\bgit\s+reset\s+--hard\b/, "git reset --hard"],
  [/\bgit\s+clean\s+(-[a-zA-Z]*f|--force)/, "git clean -f"],
  [/\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/, "discarding all working-tree changes"],
  [/\bgit\s+branch\s+(-D|--delete\s+--force)\b/, "force branch delete"],
  [/\bgit\s+(filter-branch|filter-repo)\b/, "history rewrite"],
  [/\b(drop\s+(table|database|schema|index)|truncate\s+table)\b/i, "destructive SQL"],
  [/\bdelete\s+from\s+\w+\s*(;|$|")/i, "DELETE without WHERE"],
  [/\b(prisma\s+migrate\s+reset|rails\s+db:(drop|reset)|manage\.py\s+flush|sequelize\s+db:drop)\b/i, "database reset"],
  [/\bterraform\s+(apply|destroy|import|state\s+rm)\b|\bpulumi\s+(up|destroy)\b|\bcdk\s+(deploy|destroy)\b/, "infrastructure change"],
  [/\bkubectl\s+(apply|delete|replace|scale|drain|cordon|patch|edit|rollout\s+restart)\b|\bhelm\s+(install|upgrade|uninstall|delete|rollback)\b/, "cluster change"],
  [/\b(vercel\b.*--prod|netlify\s+deploy\b.*--prod|fly\s+deploy|firebase\s+deploy|serverless\s+deploy|sls\s+deploy|heroku\s+(releases:rollback|ps:scale)|gcloud\s+(app|run|functions)\s+deploy|eb\s+deploy|amplify\s+publish)\b/i, "production deployment"],
  [/\baws\s+\S+\s+(delete|remove|terminate|put-bucket-policy|put-bucket-acl|attach-.*-policy|create-access-key)\S*|\baws\s+s3\s+(rm|rb)\b|\bgcloud\s+.*\s(delete|remove-iam-policy-binding|add-iam-policy-binding)\b|\baz\s+.*\s(delete|role\s+assignment\s+create)\b/i, "cloud resource or IAM change"],
  [/\b(npm|pnpm|yarn)\s+publish\b|\bcargo\s+publish\b|\btwine\s+upload\b|\bgem\s+push\b|\bdocker\s+push\b|\bgh\s+release\s+create\b/, "publishing a package or image"],
  [/\bgh\s+repo\s+(delete|edit\b.*--visibility)|\bgh\s+secret\s+(set|delete)\b|\bgh\s+api\b.*-X\s*(DELETE|PUT)\b/i, "GitHub repository/secret change"],
  [/\bdocker\s+(system|volume|image)\s+prune\b|\bdocker\s+rm\s+-f\b/, "docker prune/force remove"],
  [/\b(chmod|chown)\s+(-R|--recursive)\b/, "recursive permission change"],
  [/(^|[;&|]\s*)sudo\b|\bRun-As\b|\bStart-Process\b.*-Verb\s+RunAs/i, "privilege escalation"],
  [/--human-approved\b/, "framework action that requires human approval (reopening a failed task)"],
  [/\bbootstrap\.mjs\s+apply\b.*--force\b/, "bootstrap --force overwrites user-customized files"],
];

// Secret-bearing file names referenced as command arguments (reads, copies,
// sources, globs). Message-like option values are removed before testing.
const SECRET_FILE = /(^|[\s"'\/\\=<>(*?])(\.env(?!\.(example|sample|template|dist)\b)(\.[\w.*?-]+|\*)?|id_(rsa|dsa|ecdsa|ed25519)|[\w.*?-]*\.(pem|key|p12|pfx|jks)|credentials\.json|\.npmrc|\.netrc|\.pypirc|[\w.*?-]+\.tfvars)(?=["'\s;|&)<>]|$)/i;
// Commands that only check whether a secret file is ignored/present.
const SECRET_CHECK_OK = /^(git\s+(check-ignore|ls-files)\b|test\s+-[ef]\b|\[\s+-[ef]\b)/;
// Option values that carry prose, not file arguments.
const MESSAGE_ARGS = /(\s(-m|--message|--title|--body|--text|--summary|--description|--notes)(=|\s+))("(?:[^"\\]|\\.)*"|'[^']*'|\S+)/g;
// Dumping the environment.
const ENV_DUMP = /^((printenv|env)\s*$|printenv\s+\w+|(Get-ChildItem|gci|dir|ls)\s+env:|set\s*$)/i;

// Output redirection with an optional fd prefix (1>, 2>>, &>, >|). 2>&1 and
// redirections to /dev/null are not writes.
const REDIRECT = /(?:^|[^&<>=-])(?:\d*|&)>>?\|?\s*(?!&\d|\/dev\/null\b|nul\b|\$null\b)[^\s&]/i;

// Commands that write to the working tree. Tested per normalised segment
// after quoted text is blanked; command-word rules are anchored at the start.
const WRITES = [
  [REDIRECT, "output redirection to a file"],
  [/^sed\b.*\s(-[a-zA-Z]*i[a-zA-Z]*|--in-place)(\s|=|$)|^perl\b.*\s-[a-zA-Z]*i/, "in-place edit"],
  [/^tee\b(?!\s+\/dev\/null)/, "tee to file"],
  [/^(mv|cp|rm|rmdir|mkdir|touch|ln|truncate|install|chmod|chown|unlink|shred|rsync)\b/, "file system modification"],
  [/^find\b.*\s(-delete\b|-exec(dir)?\s+(rm|mv|cp|sed|chmod|chown)\b)/, "find with delete/exec"],
  [/^(Set-Content|Add-Content|Out-File|New-Item|Remove-Item|Move-Item|Copy-Item|Rename-Item)\b/i, "file system modification"],
  [/^git\s+(commit|add|rm|mv|checkout|switch|restore|reset|rebase|merge|cherry-pick|apply|am|push|pull|fetch|init|clone|clean|revert)(\s|$)/, "git state change"],
  [/^git\s+stash(\s+(push|pop|apply|drop|clear|save|branch)\b|\s*$|\s+-)/, "git stash"],
  [/^git\s+tag\s+(?!-l\b|--list\b|-n\d*\b|--contains\b|--points-at\b)\S/, "git tag"],
  [/^(npm|pnpm|yarn|bun)\s+(install|i|add|remove|uninstall|update|upgrade|ci)\b|^(npm|pnpm|yarn)\s+audit\s+fix\b|^pip3?\s+install\b|^cargo\s+(add|install)\b|^go\s+get\b/, "dependency change"],
  [/^(npm|pnpm|yarn|bun)\s+(run\s+)?\S+.*\s--(fix|write)\b/, "script run with --fix/--write"],
  [/^((npx|bunx)\s+|pnpm\s+(exec\s+)?)?(prettier\b.*--write|eslint\b.*--fix|ruff\b.*--fix|ruff\s+format\b(?!.*--check)|black\b(?!.*--check))/, "auto-fixing formatter"],
];

// Interpreter one-liners: the code is inside quotes, so test the raw segment.
const INTERPRETER = /^(node|deno|bun)\s+(-e|--eval|-p|--print)\b|^python[0-9.]*\s+-c\b|^(perl|ruby)\s+-e\b|^(pwsh|powershell)(\.exe)?\s+.*-(c|Command)\b/i;
const INTERPRETER_WRITE = /\b(writeFile(Sync)?|appendFile(Sync)?|rmSync|rmdirSync|unlink(Sync)?|rename(Sync)?|mkdirSync|copyFile(Sync)?|createWriteStream|truncate(Sync)?|write_text|write_bytes|os\.remove|os\.unlink|os\.rename|shutil\.(rmtree|move|copy\w*)|Set-Content|Out-File|Remove-Item)\b|\bopen\s*\([^)]*,\s*\\?["'][wax+]/;

// Framework state that subagents must never write through the shell.
const PROTECTED_TARGET = /(^|[\s"'\/\\=>(])(tasks[\/\\]TASK-\d+[^\s"']*\.md|reports[\/\\](reviews|handoffs|audits|metrics)[\/\\]?|risk-acceptances\.md|agent-framework(\.json|[\/\\]manifest\.json)|protected-paths\.json|model-routing\.json|agent-registry\.json)/i;

/** Heredoc bodies are data (e.g. review text quoting "rm -rf"), not commands. The opener line's tail is kept. */
function stripHeredocs(command) {
  return String(command ?? "").replace(/<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1([^\n]*)\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, "<<HEREDOC$3");
}

/** Replace the contents of quoted spans with spaces (keeps length/positions). */
function blankQuotes(s) {
  return s.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, (m) => m[0] + " ".repeat(m.length - 2) + m[0]);
}

/** Split into simple commands on ; && || | and newlines (outside quotes, best effort). ">|" is a redirect, not a pipe. */
function segments(command) {
  const out = [];
  let cur = "", q = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (q) { cur += c; if (c === q && command[i - 1] !== "\\") q = null; continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === "|" && command[i - 1] === ">") { cur += c; continue; }
    if (c === "\n" || c === ";" || c === "|" || (c === "&" && command[i + 1] === "&")) {
      if (c === "&" || (c === "|" && command[i + 1] === "|")) i++;
      out.push(cur.trim()); cur = ""; continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

const LEADING = /^(\(|\{|!|then|do|else|elif|if|while|until|sudo|command|exec|nohup|time|nice|env(\s+-\S+)*|xargs(\s+-[a-zA-Z]+(\s+\S+)?)*|\w+=("[^"]*"|'[^']*'|\S*))\s+/;
const GIT_GLOBAL = /^git\s+((-C|-c|--git-dir|--work-tree|--namespace)(\s+|=)("[^"]*"|'[^']*'|\S+)\s+|(--no-pager|--paginate|-p|--bare|--no-replace-objects|--literal-pathspecs)\s+)+/;

/** Normalise one segment: drop trailing comment, shell keywords/wrappers, env assignments, git global options. */
function normalizeSegment(seg) {
  const blank = blankQuotes(seg);
  const hash = blank.search(/(^|\s)#/);
  let s = (hash === -1 ? seg : seg.slice(0, hash)).trim();
  for (let prev = null; prev !== s;) { prev = s; s = s.replace(LEADING, "").trim(); }
  s = s.replace(/^(if|then|do|else|fi|done|\}|\))$/, "");
  s = s.replace(GIT_GLOBAL, "git ");
  return s;
}

/** Positional tokens of a framework script invocation (`node .../<script> [--flags] action kind ...`), unquoted, flags dropped. */
function scriptInvocation(seg, script) {
  const m = new RegExp(`^node\\s+("[^"]*${script}"|'[^']*${script}'|\\S*${script})\\s*(.*)$`).exec(seg);
  if (!m) return null;
  const tokens = (m[2].match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((t) => t.replace(/^["']|["']$/g, ""));
  const positional = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith("<")) break; // stdin redirection / heredoc marker
    if (t.startsWith("--")) { if (!t.includes("=") && tokens[i + 1] && !tokens[i + 1].startsWith("-") && ["--root", "--reason", "--max", "--task", "--attempt", "--unavailable"].includes(t)) i++; continue; }
    positional.push(t);
  }
  return positional;
}

const SAFE_SCRIPT_ACTIONS = {
  "reports.mjs": ["save", "check", "progress"],
  "tasks.mjs": ["validate", "batches", "next", "status", "required-reviews", "next-id", "transition"],
  "gate.mjs": ["check"],
  "routing.mjs": ["resolve", "table", "check"],
  "discover.mjs": [undefined],
  "bootstrap.mjs": ["audit", "plan", "validate"],
  "metrics.mjs": ["summary", "report", "proposals"],
};

/** A framework script call with a known read/validate action and no redirection. */
function frameworkCall(seg) {
  for (const [script, actions] of Object.entries(SAFE_SCRIPT_ACTIONS)) {
    const pos = scriptInvocation(seg, script.replace(".", "\\."));
    if (pos && actions.includes(pos[0])) return { script, pos };
  }
  return null;
}

/**
 * Classify a Bash command.
 *  opts.readOnly        agent may not modify the working tree (reviewers, auditors, orchestrator)
 *  opts.subagent        command comes from a subagent (agent_type present)
 *  opts.canSaveReviews  agent is a reviewer/auditor
 *  opts.access          registry access level of the agent (orchestrate/plan may run lifecycle transitions)
 */
function classify(command, { readOnly = false, subagent = false, canSaveReviews = true, access = null } = {}, depth = 0) {
  const cmd = stripHeredocs(command);
  for (const [re, why] of DENY) if (re.test(cmd)) return { decision: "deny", reason: why };
  for (const [re, why] of ASK) if (re.test(cmd)) return { decision: "ask", reason: why };
  for (const raw of segments(cmd)) {
    const seg = normalizeSegment(raw);
    if (!seg) continue;
    // Recurse into `sh -c "<body>"`-style wrappers.
    const wrapped = /^(ba|z|da|k)?sh\s+(-[a-zA-Z]+\s+)*-c\s+(["'])([\s\S]*)\3\s*$/.exec(seg);
    if (wrapped && depth < 3) {
      const inner = classify(wrapped[4], { readOnly, subagent, canSaveReviews, access }, depth + 1);
      if (inner.decision !== "allow") return inner;
      continue;
    }
    const blank = blankQuotes(seg);
    const call = frameworkCall(seg);
    if (subagent && call?.script === "reports.mjs" && call.pos[0] === "save" && /^(review|audit)$/.test(call.pos[1] ?? "") && !canSaveReviews) {
      return { decision: "deny", reason: "only reviewer/auditor agents may save reviews or audits" };
    }
    if (subagent && call?.script === "tasks.mjs" && call.pos[0] === "transition" && !["orchestrate", "plan"].includes(access)) {
      return { decision: "deny", reason: "task lifecycle transitions are run by the orchestrator, not by worker agents" };
    }
    const withoutMessages = seg.replace(MESSAGE_ARGS, "$1MSG");
    if (!SECRET_CHECK_OK.test(seg) && SECRET_FILE.test(withoutMessages)) return { decision: "ask", reason: "command references a secret-bearing file" };
    if (ENV_DUMP.test(seg)) return { decision: "ask", reason: "dumping environment variables (may contain secrets)" };
    if (INTERPRETER.test(seg)) {
      if (subagent && PROTECTED_TARGET.test(seg)) return { decision: "deny", reason: "subagent may not modify framework state through an interpreter one-liner" };
      if (readOnly && INTERPRETER_WRITE.test(seg)) return { decision: "deny", reason: "read-only agent: interpreter one-liner writes files" };
    }
    const writes = WRITES.find(([re]) => re.test(blank));
    const safe = Boolean(call) && !REDIRECT.test(blank);
    if (writes && !safe && subagent && PROTECTED_TARGET.test(seg)) return { decision: "deny", reason: `subagent may not modify framework state through the shell (${writes[1]})` };
    if (writes && !safe && !subagent && /risk-acceptances\.md/i.test(seg)) return { decision: "ask", reason: "risk acceptances require human approval" };
    if (readOnly && writes && !safe) return { decision: "deny", reason: `read-only agent: ${writes[1]}` };
  }
  return { decision: "allow", reason: null };
}

let input = {};
try {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
} catch { process.exit(0); }

const { decision, reason } = classify(input?.tool_input?.command);
if (decision !== "allow") {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: decision === "deny" ? `Blocked: ${reason}. Run it manually if truly intended.` : `${reason} — requires explicit approval.`,
    },
  }) + "\n");
}
process.exit(0);
