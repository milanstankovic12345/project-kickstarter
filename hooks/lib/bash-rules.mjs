// Command classification for the Bash guard. Pure and dependency-free so
// it can be unit-tested and mirrored into the kickstarter's standalone
// template (templates/hooks/guard-bash.mjs); a parity test keeps them aligned.

// Catastrophic: never run automatically.
export const DENY = [
  [/\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rR][a-zA-Z]*\s+(-[a-zA-Z]+\s+)*(\/|~|\$HOME|\/\*|\*)(\s|$)/, "recursive delete of root, home or wildcard-at-cwd"],
  [/\brm\s+(-[a-zA-Z]+\s+)*--no-preserve-root\b/, "rm --no-preserve-root"],
  [/\bmkfs(\.\w+)?\b|\bFormat-Volume\b|\bdiskpart\b|\bformat\s+[a-zA-Z]:/i, "filesystem format"],
  [/\bdd\s+[^|]*\bof=\/dev\/(sd|nvme|hd|disk)/, "raw disk write"],
  [/>\s*\/dev\/(sd|nvme|hd|disk)\w*/, "raw disk write"],
  [/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, "fork bomb"],
  [/\bchmod\s+-R\s+0?777\s+\/(\s|$)/, "recursive chmod 777 on /"],
  [/\bRemove-Item\b(?=.*\s-Recurse\b)(?=.*\s(C:\\?|\/|~|\$HOME|\$env:USERPROFILE)(\s|$))/i, "recursive delete of a drive root or home"],
  [/\bcurl\b[^|]*\|\s*(sudo\s+)?(ba|z|)sh\b|\bwget\b[^|]*\|\s*(sudo\s+)?(ba|z|)sh\b|\biwr\b[^|]*\|\s*iex\b/i, "piping a remote script into a shell"],
];

// Risky but sometimes legitimate: require a human to approve.
export const ASK = [
  [/\brm\s+(-[a-zA-Z]+\s+)*-[a-zA-Z]*[rRf]/, "rm with -r/-f"],
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
  [/\b(chmod|chown)\s+-R\b/, "recursive permission change"],
  [/\bsudo\b|\bRun-As\b|\bStart-Process\b.*-Verb\s+RunAs/i, "privilege escalation"],
  [/\b(cat|type|more|less|head|tail|bat|gc|Get-Content|strings|xxd|od)\b[^|;&]*(^|[\s"'\/\\])(\.env(\.(?!example\b|sample\b|template\b)[\w.-]+)?|id_(rsa|dsa|ecdsa|ed25519)|[\w.-]+\.(pem|key|p12|pfx)|credentials(\.json)?|\.npmrc|\.netrc|[\w.-]+\.tfvars)(["'\s]|$)/i, "reading a secret-bearing file"],
  [/\b(printenv|env)\s*($|\|)|\bGet-ChildItem\s+env:|\bdir\s+env:|\bset\s*$/i, "dumping environment variables (may contain secrets)"],
  [/--human-approved\b/, "framework action that requires human approval (reopening a failed task)"],
  [/\bbootstrap\.mjs\s+apply\b.*--force\b/, "bootstrap --force overwrites user-customized files"],
];

// Commands that write to the working tree; denied for read-only agents.
export const WRITES = [
  [/(^|[^0-9&<>])>{1,2}\s*(?!&|\/dev\/null\b|nul\b|\$null\b)\S/i, "output redirection to a file"],
  [/\bsed\s+(-[a-zA-Z]*i|--in-place)\b|\bperl\s+-[a-zA-Z]*i/, "in-place edit"],
  [/\btee\b(?!\s+\/dev\/null)/, "tee to file"],
  [/\b(mv|cp|rm|rmdir|mkdir|touch|ln|truncate|install)\s/, "file system modification"],
  [/\b(Set-Content|Add-Content|Out-File|New-Item|Remove-Item|Move-Item|Copy-Item|Rename-Item)\b/i, "file system modification"],
  [/\bgit\s+(commit|add|rm|mv|checkout|switch|restore|reset|rebase|merge|cherry-pick|stash|apply|am|push|tag)\b/, "git state change"],
  [/\b(npm|pnpm|yarn|bun)\s+(install|i|add|remove|uninstall|update|upgrade|ci|audit\s+fix)\b|\bpip\s+install\b|\bcargo\s+(add|install)\b|\bgo\s+get\b/, "dependency change"],
  [/\b(npx|pnpx|bunx)\s+prettier\b.*--write|\beslint\b.*--fix|\bruff\b.*--fix|\bblack\b\s/, "auto-fixing formatter"],
];

// Framework scripts that read-only agents may run even though they write
// (they validate before persisting and only touch reports/).
export const FRAMEWORK_SAFE = /\b(reports\.mjs\s+(save|check|progress)|tasks\.mjs\s+(validate|batches|next|status|required-reviews|next-id)|gate\.mjs\s+check|routing\.mjs\s+(resolve|table|check)|discover\.mjs|bootstrap\.mjs\s+(audit|plan|validate)|metrics\.mjs\s+(summary|report))\b/;

/** Heredoc bodies are data (e.g. review text quoting "rm -rf"), not commands. */
export function stripHeredocs(command) {
  return String(command ?? "").replace(/<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, "<<HEREDOC");
}

/** Split into simple commands on ; && || | and newlines (outside quotes, best effort). */
export function segments(command) {
  const out = [];
  let cur = "", q = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (q) { cur += c; if (c === q && command[i - 1] !== "\\") q = null; continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === "\n" || c === ";" || (c === "|" ) || (c === "&" && command[i + 1] === "&")) {
      if (c === "&" || (c === "|" && command[i + 1] === "|")) i++;
      out.push(cur.trim()); cur = ""; continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

export function classify(command, { readOnly = false } = {}) {
  const cmd = stripHeredocs(command);
  for (const [re, why] of DENY) if (re.test(cmd)) return { decision: "deny", reason: why };
  for (const [re, why] of ASK) if (re.test(cmd)) return { decision: "ask", reason: why };
  if (readOnly) {
    for (const seg of segments(cmd)) {
      if (FRAMEWORK_SAFE.test(seg)) continue;
      for (const [re, why] of WRITES) if (re.test(seg)) return { decision: "deny", reason: `read-only agent: ${why}` };
    }
  }
  return { decision: "allow", reason: null };
}
