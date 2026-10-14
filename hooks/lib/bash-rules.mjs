// Command classification for the Bash guard. Pure and dependency-free so
// it can be unit-tested and mirrored into the kickstarter's standalone
// template (templates/hooks/guard-bash.mjs); a parity test keeps them aligned.

// rm with a recursive flag (short or long form) — used by DENY and ASK.
const RM_RECURSIVE = String.raw`\brm(?=[^;&|]*\s(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)(\s|$))`;
const RM_FORCE_OR_RECURSIVE = String.raw`\brm(?=[^;&|]*\s(-[a-zA-Z]*[rRf][a-zA-Z]*|--recursive|--force)(\s|$))`;

// Catastrophic: never run automatically.
export const DENY = [
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
export const ASK = [
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

// Secret-bearing file names referenced anywhere in a command (reads, copies, sources).
export const SECRET_FILE = /(^|[\s"'\/\\=<>(])(\.env(?!\.(example|sample|template|dist)\b)(\.[\w.-]+)?|id_(rsa|dsa|ecdsa|ed25519)|[\w.-]+\.(pem|key|p12|pfx|jks)|credentials\.json|\.npmrc|\.netrc|\.pypirc|[\w.-]+\.tfvars)(?=["'\s;|&)<>]|$)/i;
// Commands that only check whether a secret file is ignored/present.
const SECRET_CHECK_OK = /^(git\s+(check-ignore|ls-files)\b|test\s+-[ef]\b|\[\s+-[ef]\b)/;
// Dumping the environment.
const ENV_DUMP = /^((printenv|env)\s*$|printenv\s+\w+|(Get-ChildItem|gci|dir|ls)\s+env:|set\s*$)/i;

// Commands that write to the working tree. Tested per segment after quoted
// text is blanked; command-word rules are anchored at the segment start.
export const WRITES = [
  [/(^|[^0-9&<>=\-])>{1,2}\s*(?!&|\/dev\/null\b|nul\b|\$null\b)\S/i, "output redirection to a file"],
  [/^sed\b.*\s(-[a-zA-Z]*i[a-zA-Z]*|--in-place)(\s|=|$)|^perl\b.*\s-[a-zA-Z]*i/, "in-place edit"],
  [/^tee\b(?!\s+\/dev\/null)/, "tee to file"],
  [/^(mv|cp|rm|rmdir|mkdir|touch|ln|truncate|install|chmod|chown|unlink)\b/, "file system modification"],
  [/^(Set-Content|Add-Content|Out-File|New-Item|Remove-Item|Move-Item|Copy-Item|Rename-Item)\b/i, "file system modification"],
  [/^git\s+(commit|add|rm|mv|checkout|switch|restore|reset|rebase|merge|cherry-pick|apply|am|push|pull|fetch|init|clone)(\s|$)/, "git state change"],
  [/^git\s+stash(\s+(push|pop|apply|drop|clear|save|branch)\b|\s*$|\s+-)/, "git stash"],
  [/^git\s+tag\s+(?!-l\b|--list\b|-n\d*\b|--contains\b|--points-at\b)\S/, "git tag"],
  [/^(npm|pnpm|yarn|bun)\s+(install|i|add|remove|uninstall|update|upgrade|ci)\b|^(npm|pnpm|yarn)\s+audit\s+fix\b|^pip3?\s+install\b|^cargo\s+(add|install)\b|^go\s+get\b/, "dependency change"],
  [/^((npx|bunx)\s+|pnpm\s+(exec\s+)?)?(prettier\b.*--write|eslint\b.*--fix|ruff\b.*--fix|ruff\s+format\b(?!.*--check)|black\b(?!.*--check))/, "auto-fixing formatter"],
];

// Framework scripts that agents run as `node <...>/scripts/<x>.mjs ...`.
// Anchored at the segment start; redirections in the same segment still count.
export const FRAMEWORK_SAFE = /^node\s+("[^"]*|'[^']*|\S*)(reports\.mjs["']?\s+(save|check|progress)|tasks\.mjs["']?\s+(validate|batches|next|status|required-reviews|next-id)|gate\.mjs["']?\s+check|routing\.mjs["']?\s+(resolve|table|check)|discover\.mjs|bootstrap\.mjs["']?\s+(audit|plan|validate)|metrics\.mjs["']?\s+(summary|report|proposals))\b/;

// Framework state that subagents must never write through the shell.
export const PROTECTED_TARGET = /(^|[\s"'\/\\=>])(tasks[\/\\]TASK-\d+[^\s"']*\.md|reports[\/\\](reviews|handoffs|audits|metrics)[\/\\]|risk-acceptances\.md|agent-framework(\.json|[\/\\]manifest\.json)|protected-paths\.json|model-routing\.json|agent-registry\.json)/i;
const SAVES_REVIEW = /\breports\.mjs["']?\s+save\s+(review|audit)\b/;

/** Heredoc bodies are data (e.g. review text quoting "rm -rf"), not commands. */
export function stripHeredocs(command) {
  return String(command ?? "").replace(/<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, "<<HEREDOC");
}

/** Replace the contents of quoted spans with spaces (keeps length/positions). */
export function blankQuotes(s) {
  return s.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, (m) => m[0] + " ".repeat(m.length - 2) + m[0]);
}

/** Split into simple commands on ; && || | and newlines (outside quotes, best effort). */
export function segments(command) {
  const out = [];
  let cur = "", q = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (q) { cur += c; if (c === q && command[i - 1] !== "\\") q = null; continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === "\n" || c === ";" || c === "|" || (c === "&" && command[i + 1] === "&")) {
      if (c === "&" || (c === "|" && command[i + 1] === "|")) i++;
      out.push(cur.trim()); cur = ""; continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

/** Normalise one segment: drop trailing comment, leading env assignments, sudo/command/exec. */
export function normalizeSegment(seg) {
  const blank = blankQuotes(seg);
  const hash = blank.search(/(^|\s)#/);
  let s = (hash === -1 ? seg : seg.slice(0, hash)).trim();
  s = s.replace(/^(\(\s*)+/, "").replace(/^(\w+=("[^"]*"|'[^']*'|\S*)\s+)+/, "").replace(/^(sudo|command|exec|nohup|time)\s+/, "");
  return s;
}

/**
 * Classify a Bash command.
 *  opts.readOnly    agent may not modify the working tree (reviewers, auditors, orchestrator)
 *  opts.subagent    command comes from a subagent (agent_type present)
 *  opts.canSaveReviews  agent is a reviewer/auditor
 */
export function classify(command, { readOnly = false, subagent = false, canSaveReviews = true } = {}) {
  const cmd = stripHeredocs(command);
  for (const [re, why] of DENY) if (re.test(cmd)) return { decision: "deny", reason: why };
  if (subagent && !canSaveReviews && SAVES_REVIEW.test(cmd)) return { decision: "deny", reason: "only reviewer/auditor agents may save reviews or audits" };
  for (const [re, why] of ASK) if (re.test(cmd)) return { decision: "ask", reason: why };
  for (const raw of segments(cmd)) {
    const seg = normalizeSegment(raw);
    if (!seg) continue;
    const blank = blankQuotes(seg);
    if (!SECRET_CHECK_OK.test(seg) && SECRET_FILE.test(seg)) return { decision: "ask", reason: "command references a secret-bearing file" };
    if (ENV_DUMP.test(seg)) return { decision: "ask", reason: "dumping environment variables (may contain secrets)" };
    const writes = WRITES.find(([re]) => re.test(blank));
    const safe = FRAMEWORK_SAFE.test(seg) && !WRITES[0][0].test(blank);
    if (writes && !safe && subagent && PROTECTED_TARGET.test(seg)) return { decision: "deny", reason: `subagent may not modify framework state through the shell (${writes[1]})` };
    if (writes && !safe && !subagent && /risk-acceptances\.md/i.test(seg)) return { decision: "ask", reason: "risk acceptances require human approval" };
    if (readOnly && writes && !safe) return { decision: "deny", reason: `read-only agent: ${writes[1]}` };
  }
  return { decision: "allow", reason: null };
}
