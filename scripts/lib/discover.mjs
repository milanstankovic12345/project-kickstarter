// Deterministic repository discovery. Reads manifests and a bounded file
// listing; never reads secret-bearing files (their names are listed only).
import { existsSync, readdirSync, readFileSync, statSync, lstatSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { createHash } from "node:crypto";

const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", ".output", "coverage", "vendor", "target", "__pycache__", ".venv", "venv", "env", ".tox", ".mypy_cache", ".pytest_cache", ".turbo", ".cache", ".parcel-cache", ".idea", ".vscode", ".gradle", "bin", "obj", ".terraform", "reports", "fixtures", "__fixtures__"]);
const MAX_FILES = 20000;
const MAX_DEPTH = 10;

// Files whose CONTENT must never be read.
const SECRET_NAME_RE = /^(\.env(\..*)?|.*\.(pem|key|p12|pfx|jks|keystore|crt|cer|der|kdbx|ovpn)|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|credentials(\.json)?|secrets?\.(json|ya?ml|toml)|\.npmrc|\.pypirc|\.netrc|service-account.*\.json|.*\.tfvars|.*\.tfstate(\.backup)?)$/i;
const SECRET_SAFE_RE = /^\.env\.(example|sample|template|dist)$/i;

export function isSecretFile(name) {
  const b = basename(name);
  return SECRET_NAME_RE.test(b) && !SECRET_SAFE_RE.test(b);
}

const LANG_BY_EXT = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".mts": "TypeScript", ".cts": "TypeScript",
  ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
  ".py": "Python", ".go": "Go", ".rs": "Rust", ".java": "Java", ".kt": "Kotlin", ".rb": "Ruby",
  ".php": "PHP", ".cs": "C#", ".swift": "Swift", ".dart": "Dart", ".scala": "Scala", ".ex": "Elixir", ".exs": "Elixir",
  ".vue": "Vue", ".svelte": "Svelte", ".astro": "Astro", ".sql": "SQL", ".sh": "Shell", ".ps1": "PowerShell",
  ".c": "C", ".h": "C", ".cpp": "C++", ".hpp": "C++", ".css": "CSS", ".scss": "SCSS", ".html": "HTML", ".md": "Markdown",
};

// npm dependency -> detection
const NPM = {
  react: ["React", "frontend"], "react-dom": null, next: ["Next.js", "fullstack"], vue: ["Vue", "frontend"], nuxt: ["Nuxt", "fullstack"],
  svelte: ["Svelte", "frontend"], "@sveltejs/kit": ["SvelteKit", "fullstack"], "@angular/core": ["Angular", "frontend"], "solid-js": ["Solid", "frontend"],
  astro: ["Astro", "frontend"], "@remix-run/react": ["Remix", "fullstack"], "react-native": ["React Native", "mobile"], expo: ["Expo", "mobile"], electron: ["Electron", "desktop"],
  express: ["Express", "backend"], fastify: ["Fastify", "backend"], koa: ["Koa", "backend"], "@nestjs/core": ["NestJS", "backend"], hono: ["Hono", "backend"],
  "@hapi/hapi": ["hapi", "backend"], "@trpc/server": ["tRPC", "api"], graphql: ["GraphQL", "api"], "@apollo/server": ["Apollo Server", "api"], "socket.io": ["Socket.IO", "realtime"], ws: ["ws", "realtime"],
  prisma: ["Prisma", "orm"], "@prisma/client": ["Prisma", "orm"], "drizzle-orm": ["Drizzle", "orm"], typeorm: ["TypeORM", "orm"], sequelize: ["Sequelize", "orm"], mongoose: ["Mongoose", "orm"], knex: ["Knex", "orm"], kysely: ["Kysely", "orm"],
  pg: ["PostgreSQL driver", "database"], mysql2: ["MySQL driver", "database"], "better-sqlite3": ["SQLite driver", "database"], mongodb: ["MongoDB driver", "database"], redis: ["Redis client", "database"], ioredis: ["Redis client", "database"],
  "@supabase/supabase-js": ["Supabase", "database"], firebase: ["Firebase", "database"],
  "next-auth": ["NextAuth/Auth.js", "auth"], "@auth/core": ["Auth.js", "auth"], passport: ["Passport", "auth"], jsonwebtoken: ["jsonwebtoken", "auth"], jose: ["jose", "auth"], "@clerk/nextjs": ["Clerk", "auth"], "@clerk/clerk-react": ["Clerk", "auth"], "lucia": ["Lucia", "auth"], bcrypt: ["bcrypt", "auth"], bcryptjs: ["bcryptjs", "auth"], argon2: ["argon2", "auth"], "express-session": ["express-session", "auth"], "better-auth": ["Better Auth", "auth"],
  tailwindcss: ["Tailwind CSS", "styling"], "styled-components": ["styled-components", "styling"], "@emotion/react": ["Emotion", "styling"], sass: ["Sass", "styling"],
  "@mui/material": ["MUI", "ui-library"], "@chakra-ui/react": ["Chakra UI", "ui-library"], "@mantine/core": ["Mantine", "ui-library"], antd: ["Ant Design", "ui-library"], "@radix-ui/react-slot": ["Radix UI", "ui-library"], "@headlessui/react": ["Headless UI", "ui-library"], vuetify: ["Vuetify", "ui-library"], "framer-motion": ["Framer Motion", "motion"], motion: ["Motion", "motion"],
  jest: ["Jest", "test"], vitest: ["Vitest", "test"], mocha: ["Mocha", "test"], "@playwright/test": ["Playwright", "e2e"], cypress: ["Cypress", "e2e"], "@testing-library/react": ["Testing Library", "test"], storybook: ["Storybook", "ui-docs"], "@storybook/react": ["Storybook", "ui-docs"],
  "@axe-core/playwright": ["axe-core", "a11y"], "jest-axe": ["jest-axe", "a11y"], "eslint-plugin-jsx-a11y": ["jsx-a11y", "a11y"],
  stripe: ["Stripe", "payments"], "@stripe/stripe-js": ["Stripe", "payments"], "@paypal/checkout-server-sdk": ["PayPal", "payments"],
  openai: ["OpenAI SDK", "ai"], "@anthropic-ai/sdk": ["Anthropic SDK", "ai"], ai: ["Vercel AI SDK", "ai"], langchain: ["LangChain", "ai"],
  typescript: ["TypeScript", "language-tooling"], eslint: ["ESLint", "lint"], prettier: ["Prettier", "format"], "@biomejs/biome": ["Biome", "lint"],
  turbo: ["Turborepo", "monorepo"], nx: ["Nx", "monorepo"], lerna: ["Lerna", "monorepo"],
};
const PY = {
  django: ["Django", "fullstack"], flask: ["Flask", "backend"], fastapi: ["FastAPI", "backend"], starlette: ["Starlette", "backend"],
  sqlalchemy: ["SQLAlchemy", "orm"], alembic: ["Alembic", "orm"], "django-rest-framework": ["DRF", "api"], djangorestframework: ["DRF", "api"], psycopg2: ["PostgreSQL driver", "database"], "psycopg2-binary": ["PostgreSQL driver", "database"], psycopg: ["PostgreSQL driver", "database"], pymongo: ["MongoDB driver", "database"], redis: ["Redis client", "database"],
  pytest: ["pytest", "test"], pydantic: ["Pydantic", "validation"], celery: ["Celery", "jobs"], "python-jose": ["python-jose", "auth"], pyjwt: ["PyJWT", "auth"], passlib: ["passlib", "auth"], authlib: ["Authlib", "auth"],
  stripe: ["Stripe", "payments"], openai: ["OpenAI SDK", "ai"], anthropic: ["Anthropic SDK", "ai"], torch: ["PyTorch", "ml"], tensorflow: ["TensorFlow", "ml"], transformers: ["Transformers", "ml"], ruff: ["Ruff", "lint"], mypy: ["mypy", "typecheck"], black: ["Black", "format"],
};
const GO = { "github.com/gin-gonic/gin": ["Gin", "backend"], "github.com/labstack/echo": ["Echo", "backend"], "github.com/gofiber/fiber": ["Fiber", "backend"], "gorm.io/gorm": ["GORM", "orm"], "github.com/golang-jwt/jwt": ["golang-jwt", "auth"], "github.com/jackc/pgx": ["pgx", "database"] };
const CARGO = { "actix-web": ["Actix Web", "backend"], axum: ["Axum", "backend"], rocket: ["Rocket", "backend"], diesel: ["Diesel", "orm"], sqlx: ["SQLx", "orm"], tokio: ["Tokio", "runtime"], jsonwebtoken: ["jsonwebtoken", "auth"] };

function readText(path, max = 512 * 1024) {
  try {
    const st = statSync(path);
    if (st.size > max) return null;
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function walk(root) {
  const files = [];
  const dirs = [];
  let truncated = false;
  const stack = [["", 0]];
  while (stack.length) {
    const [rel, depth] = stack.pop();
    let entries;
    try { entries = readdirSync(join(root, rel), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name) || (e.name.startsWith(".") && ![".github", ".claude", ".gitlab", ".circleci", ".cursor", ".clinerules", ".windsurf", ".agents", ".agent", ".storybook", ".husky", ".devcontainer", ".claude-plugin"].includes(e.name))) continue;
        dirs.push(r);
        if (depth < MAX_DEPTH) stack.push([r, depth + 1]);
      } else if (e.isFile()) {
        if (files.length >= MAX_FILES) { truncated = true; break; }
        files.push(r);
      }
    }
    if (truncated) break;
  }
  return { files: files.sort(), dirs: dirs.sort(), truncated };
}

function addFramework(out, seen, [name, category], evidence, version) {
  const key = `${name}|${category}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ name, category, version: version ?? null, evidence });
}

function parsePyDeps(text) {
  const deps = new Set();
  // Quoted PEP 508 requirement strings anywhere (pyproject arrays, setup.py).
  for (const m of text.matchAll(/["']([A-Za-z0-9][A-Za-z0-9_.\-]*)\s*(\[[^\]]*\])?\s*(?:[<>=!~][^"']*)?(?:;[^"']*)?["']/g)) deps.add(m[1].toLowerCase());
  // Poetry style: `name = "^1.0"` under [tool.poetry.dependencies].
  for (const m of text.matchAll(/^\s*([A-Za-z0-9][A-Za-z0-9_.\-]*)\s*=\s*["'{]/gm)) deps.add(m[1].toLowerCase());
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*["']?([A-Za-z0-9_.\-]+)(\[[^\]]*\])?\s*([<>=!~^].*)?["']?,?\s*$/.exec(line.replace(/#.*/, ""));
    if (m && !/^(name|version|description|requires-python|python|readme|license|authors?)$/i.test(m[1])) deps.add(m[1].toLowerCase());
  }
  return deps;
}

export function discover(root) {
  const { files, dirs, truncated } = walk(root);
  const fileSet = new Set(files);
  const has = (p) => fileSet.has(p);
  const result = {
    version: 1,
    root_name: basename(root),
    languages: [],
    package_managers: [],
    manifests: [],
    frameworks: [],
    commands: {},
    testing: { frameworks: [], test_files: 0, has_tests: false },
    ci: [],
    containers: { dockerfiles: [], compose: [] },
    iac: [],
    data: { databases: [], orm: [], migrations: [] },
    api: { styles: [], route_dirs: [] },
    auth: [],
    ui: { has_ui: false, frameworks: [], libraries: [], styling: [], token_files: [], storybook: false, a11y_tooling: [] },
    integrations: [],
    monorepo: { tool: null, packages: [] },
    security_sensitive_paths: [],
    secret_files: [],
    agent_configs: { claude_md: has("CLAUDE.md"), agents_md: has("AGENTS.md"), claude_agents: [], claude_skills: [], claude_commands: [], claude_settings: [], framework_config: has(".claude/agent-framework.json"), other: [] },
    docs: { readme: files.find((f) => /^readme(\.md|\.rst|\.txt)?$/i.test(f)) ?? null, docs_dir: dirs.includes("docs"), adr_dir: dirs.some((d) => /(^|\/)adrs?$/.test(d)), threat_model: files.some((f) => /threat-?model/i.test(f)), design_direction: files.some((f) => /^docs\/design\//.test(f)) },
    gitignore_covers_env: null,
    size: { files: files.length, dirs: dirs.length, truncated },
  };
  const fw = [];
  const seen = new Set();

  // Languages
  const langCount = {};
  for (const f of files) {
    const lang = LANG_BY_EXT[extname(f).toLowerCase()];
    if (lang) langCount[lang] = (langCount[lang] ?? 0) + 1;
  }
  result.languages = Object.entries(langCount).filter(([l]) => !["Markdown"].includes(l)).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, files: count }));

  // Secret files (names only)
  result.secret_files = files.filter((f) => isSecretFile(f));
  const gi = readText(join(root, ".gitignore"));
  if (gi !== null) result.gitignore_covers_env = /^\s*\.env(\*|\..*)?\s*$/m.test(gi) || /^\s*\*\.env\s*$/m.test(gi) || /^\s*\.env\*?\s*$/m.test(gi);

  // Node manifests
  const pkgFiles = files.filter((f) => basename(f) === "package.json");
  const pmFromLock = has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : has("bun.lockb") || has("bun.lock") ? "bun" : has("package-lock.json") ? "npm" : pkgFiles.length ? "npm" : null;
  if (pmFromLock) result.package_managers.push(pmFromLock);
  for (const pf of pkgFiles) {
    result.manifests.push(pf);
    let pkg;
    try { pkg = JSON.parse(readText(join(root, pf)) ?? "{}"); } catch { result.manifests_invalid = [...(result.manifests_invalid ?? []), pf]; continue; }
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}), ...(pkg.peerDependencies ?? {}) };
    for (const [dep, version] of Object.entries(deps)) {
      let hit = NPM[dep];
      if (hit === undefined && dep.startsWith("@radix-ui/")) hit = NPM["@radix-ui/react-slot"];
      if (hit === undefined && dep.startsWith("@remix-run/")) hit = NPM["@remix-run/react"];
      if (hit === undefined && dep.startsWith("@storybook/")) hit = NPM.storybook;
      if (hit) addFramework(fw, seen, hit, pf, String(version));
    }
    if (pf === "package.json") {
      const s = pkg.scripts ?? {};
      const run = (name) => (pmFromLock === "npm" || !pmFromLock ? (name === "test" ? "npm test" : `npm run ${name}`) : `${pmFromLock} ${name === "test" ? "test" : "run " + name}`);
      for (const [key, names] of Object.entries({ dev: ["dev", "start:dev", "serve"], start: ["start"], build: ["build"], test: ["test"], lint: ["lint"], typecheck: ["typecheck", "type-check", "tsc", "check-types"], format: ["format", "fmt"], e2e: ["e2e", "test:e2e"], check: ["check", "validate", "verify"] })) {
        const n = names.find((x) => s[x] && !/no test specified/.test(s[x]));
        if (n) result.commands[key] = { cmd: run(n), evidence: `package.json scripts.${n}` };
      }
      if (pmFromLock) result.commands.install = { cmd: pmFromLock === "npm" ? (has("package-lock.json") ? "npm ci" : "npm install") : `${pmFromLock} install`, evidence: ["pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock", "package-lock.json"].find(has) ?? "package.json" };
      if (pkg.workspaces) result.monorepo.tool = result.monorepo.tool ?? "workspaces";
    }
  }
  if (has("pnpm-workspace.yaml")) result.monorepo.tool = "pnpm-workspaces";
  if (has("turbo.json")) result.monorepo.tool = "turborepo";
  if (has("nx.json")) result.monorepo.tool = "nx";
  if (result.monorepo.tool) result.monorepo.packages = pkgFiles.filter((p) => p !== "package.json").map((p) => p.replace(/\/package\.json$/, "")).slice(0, 50);

  // Python
  const pyManifests = files.filter((f) => /(^|\/)(pyproject\.toml|requirements[^/]*\.txt|Pipfile|setup\.py|setup\.cfg)$/.test(f) && !/(^|\/)(tests?|fixtures)\//.test(f));
  if (pyManifests.length) {
    result.package_managers.push(has("poetry.lock") ? "poetry" : has("uv.lock") ? "uv" : has("Pipfile.lock") ? "pipenv" : "pip");
    for (const pm of pyManifests) {
      result.manifests.push(pm);
      const text = readText(join(root, pm)) ?? "";
      for (const dep of parsePyDeps(text)) if (PY[dep]) addFramework(fw, seen, PY[dep], pm);
    }
    if (fw.some((f) => f.name === "pytest") || files.some((f) => /(^|\/)(test_[^/]+|[^/]+_test)\.py$/.test(f))) result.commands.test = result.commands.test ?? { cmd: "pytest", evidence: "pytest detected" };
    if (fw.some((f) => f.name === "Ruff")) result.commands.lint = result.commands.lint ?? { cmd: "ruff check .", evidence: "ruff dependency" };
  }
  // Go / Rust / others
  if (has("go.mod")) {
    result.manifests.push("go.mod"); result.package_managers.push("go");
    const text = readText(join(root, "go.mod")) ?? "";
    for (const [mod, hit] of Object.entries(GO)) if (text.includes(mod)) addFramework(fw, seen, hit, "go.mod");
    result.commands.test = result.commands.test ?? { cmd: "go test ./...", evidence: "go.mod" };
    result.commands.build = result.commands.build ?? { cmd: "go build ./...", evidence: "go.mod" };
  }
  if (has("Cargo.toml")) {
    result.manifests.push("Cargo.toml"); result.package_managers.push("cargo");
    const text = readText(join(root, "Cargo.toml")) ?? "";
    for (const [crate, hit] of Object.entries(CARGO)) if (new RegExp(`^\\s*${crate.replace(/-/g, "[-_]")}\\s*=`, "m").test(text)) addFramework(fw, seen, hit, "Cargo.toml");
    result.commands.test = result.commands.test ?? { cmd: "cargo test", evidence: "Cargo.toml" };
  }
  for (const [file, pm, name, cat] of [["Gemfile", "bundler", "Rails", "fullstack"], ["composer.json", "composer", "Laravel", "fullstack"], ["pom.xml", "maven", "Spring Boot", "backend"], ["build.gradle", "gradle", "Spring Boot", "backend"], ["build.gradle.kts", "gradle", "Spring Boot", "backend"]]) {
    if (!has(file)) continue;
    result.manifests.push(file); result.package_managers.push(pm);
    const text = readText(join(root, file)) ?? "";
    if ((file === "Gemfile" && /gem ['"]rails['"]/.test(text)) || (file === "composer.json" && /laravel\/framework/.test(text)) || (/spring-boot/.test(text) && file !== "Gemfile" && file !== "composer.json")) addFramework(fw, seen, [name, cat], file);
  }
  if (files.some((f) => f.endsWith(".csproj"))) { result.package_managers.push("dotnet"); result.manifests.push(...files.filter((f) => f.endsWith(".csproj"))); }
  const makefile = readText(join(root, "Makefile"));
  if (makefile) {
    for (const t of ["test", "lint", "build", "dev"]) if (new RegExp(`^${t}:`, "m").test(makefile) && !result.commands[t]) result.commands[t] = { cmd: `make ${t}`, evidence: "Makefile" };
  }

  // Config-file based detections
  if (files.some((f) => /(^|\/)tailwind\.config\.(js|cjs|mjs|ts)$/.test(f))) addFramework(fw, seen, ["Tailwind CSS", "styling"], "tailwind.config");
  if (has("components.json")) addFramework(fw, seen, ["shadcn/ui", "ui-library"], "components.json");
  if (dirs.includes(".storybook")) result.ui.storybook = true;
  if (files.some((f) => /(^|\/)schema\.prisma$/.test(f))) addFramework(fw, seen, ["Prisma", "orm"], files.find((f) => /schema\.prisma$/.test(f)));
  if (files.some((f) => /(^|\/)manage\.py$/.test(f))) addFramework(fw, seen, ["Django", "fullstack"], "manage.py");
  if (files.some((f) => /(^|\/)(playwright\.config\.(ts|js))$/.test(f))) addFramework(fw, seen, ["Playwright", "e2e"], "playwright.config");

  result.frameworks = fw;
  const cats = (c) => fw.filter((f) => f.category === c).map((f) => f.name);

  // Testing
  result.testing.frameworks = [...new Set([...cats("test"), ...cats("e2e")])];
  result.testing.test_files = files.filter((f) => /(\.|_)(test|spec)\.[a-z]+$|(^|\/)test_[^/]+\.py$|(^|\/)__tests__\//.test(f)).length;
  result.testing.has_tests = result.testing.test_files > 0;

  // CI / containers / IaC
  const gha = files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f));
  if (gha.length) result.ci.push({ system: "github-actions", files: gha });
  if (has(".gitlab-ci.yml")) result.ci.push({ system: "gitlab-ci", files: [".gitlab-ci.yml"] });
  if (has(".circleci/config.yml")) result.ci.push({ system: "circleci", files: [".circleci/config.yml"] });
  if (has("azure-pipelines.yml")) result.ci.push({ system: "azure-pipelines", files: ["azure-pipelines.yml"] });
  if (has("Jenkinsfile")) result.ci.push({ system: "jenkins", files: ["Jenkinsfile"] });
  result.containers.dockerfiles = files.filter((f) => /(^|\/)Dockerfile(\.[^/]+)?$/.test(f));
  result.containers.compose = files.filter((f) => /(^|\/)(docker-)?compose(\.[^/]+)?\.ya?ml$/.test(f));
  if (files.some((f) => f.endsWith(".tf"))) result.iac.push("terraform");
  if (files.some((f) => /(^|\/)(k8s|kubernetes|helm|charts)\//.test(f))) result.iac.push("kubernetes");
  if (files.some((f) => /(^|\/)(serverless\.ya?ml|vercel\.json|netlify\.toml|fly\.toml|render\.yaml)$/.test(f))) result.iac.push("paas-config");

  // Data
  result.data.orm = [...new Set(cats("orm"))];
  result.data.databases = [...new Set(cats("database"))];
  for (const c of result.containers.compose) {
    const text = readText(join(root, c)) ?? "";
    for (const [img, name] of [["postgres", "PostgreSQL"], ["mysql", "MySQL"], ["mariadb", "MariaDB"], ["mongo", "MongoDB"], ["redis", "Redis"]]) {
      if (new RegExp(`image:\\s*["']?${img}`, "i").test(text) && !result.data.databases.includes(name)) result.data.databases.push(name);
    }
  }
  result.data.migrations = dirs.filter((d) => /(^|\/)(migrations|migrate|alembic|prisma\/migrations|db\/migrate)$/.test(d));

  // API
  result.api.styles = [...new Set([...(fw.some((f) => ["Express", "Fastify", "Koa", "NestJS", "Hono", "hapi", "Flask", "FastAPI", "Django", "DRF", "Gin", "Echo", "Fiber", "Actix Web", "Axum", "Rocket", "Spring Boot", "Rails", "Laravel"].includes(f.name)) ? ["rest"] : []), ...(cats("api").some((n) => /GraphQL|Apollo/.test(n)) ? ["graphql"] : []), ...(cats("api").includes("tRPC") ? ["trpc"] : []), ...(files.some((f) => f.endsWith(".proto")) ? ["grpc"] : [])])];
  result.api.route_dirs = dirs.filter((d) => /(^|\/)(api|routes|controllers|handlers|endpoints|resolvers)$/.test(d)).slice(0, 30);
  if (result.api.route_dirs.length && !result.api.styles.length) result.api.styles.push("rest");

  // Auth & integrations
  result.auth = [...new Set(cats("auth"))];
  result.integrations = [...new Set([...cats("payments"), ...cats("ai"), ...cats("realtime"), ...cats("ml"), ...cats("jobs")])];

  // UI
  result.ui.frameworks = [...new Set([...cats("frontend"), ...cats("fullstack").filter((n) => !["Django", "Rails", "Laravel"].includes(n) || files.some((f) => /\.(html|erb|blade\.php)$/.test(f))), ...cats("mobile"), ...cats("desktop")])];
  result.ui.libraries = [...new Set(cats("ui-library"))];
  result.ui.styling = [...new Set(cats("styling"))];
  result.ui.a11y_tooling = [...new Set(cats("a11y"))];
  result.ui.storybook = result.ui.storybook || cats("ui-docs").length > 0;
  result.ui.token_files = files.filter((f) => /(^|\/)(tokens?|theme|design-tokens|variables)\.(css|scss|json|ts|js)$/i.test(f) || /(^|\/)tailwind\.config\./.test(f) || /(^|\/)globals?\.css$/.test(f)).slice(0, 20);
  const htmlLike = files.filter((f) => /\.(tsx|jsx|vue|svelte|astro|html)$/.test(f)).length;
  result.ui.has_ui = result.ui.frameworks.length > 0 || htmlLike > 0;

  // Security-sensitive locations (directories and files by name)
  const sensRe = /(^|\/)(auth|authentication|authorization|login|session|sessions|security|crypto|payments?|billing|checkout|admin|middleware|permissions?|acl|uploads?|webhooks?)(\/|$|\.)/i;
  result.security_sensitive_paths = [...new Set([...dirs.filter((d) => sensRe.test(d + "/")), ...files.filter((f) => sensRe.test(f) && !/\.(md|txt)$/.test(f)).map((f) => f)])].slice(0, 40);

  // Agent configs
  result.agent_configs.claude_agents = files.filter((f) => /^\.claude\/agents\/[^/]+\.md$/.test(f)).map((f) => basename(f, ".md"));
  result.agent_configs.claude_skills = files.filter((f) => /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(f)).map((f) => f.split("/")[2]);
  result.agent_configs.claude_commands = files.filter((f) => /^\.claude\/commands\/.+\.md$/.test(f)).map((f) => basename(f, ".md"));
  result.agent_configs.claude_settings = files.filter((f) => /^\.claude\/settings(\.local)?\.json$/.test(f));
  for (const [p, name] of [[".cursor", "cursor"], [".clinerules", "cline"], [".windsurf", "windsurf"], [".agents", "agents-dir"], [".agent", "antigravity"]]) if (dirs.includes(p)) result.agent_configs.other.push(name);
  if (has(".github/copilot-instructions.md")) result.agent_configs.other.push("copilot");
  if (has("opencode.json")) result.agent_configs.other.push("opencode");
  const plugins = files.filter((f) => /(^|\/)\.claude-plugin\/plugin\.json$/.test(f));
  if (plugins.length) {
    result.agent_configs.plugin_manifests = plugins;
    result.agent_configs.plugin_components = {
      agents: files.filter((f) => /^agents\/[^/]+\.md$/.test(f)).length,
      skills: files.filter((f) => /^skills\/[^/]+\/SKILL\.md$/.test(f)).length,
      commands: files.filter((f) => /^commands\/[^/]+\.md$/.test(f)).length,
      hooks: has("hooks/hooks.json"),
    };
  }

  // Source hash: manifests + configs + top-level layout. Changes => profile stale.
  const h = createHash("sha256");
  for (const m of [...result.manifests, ...result.ci.flatMap((c) => c.files), ...result.containers.dockerfiles, ...result.containers.compose].sort()) {
    h.update(m);
    h.update((readText(join(root, m)) ?? "").replace(/\r\n?/g, "\n"));
  }
  // Exclude directories the framework itself creates, so bootstrap output
  // never makes its own profile look stale.
  const generated = new Set(["project-context", "tasks", "reports", ".claude"]);
  h.update(dirs.filter((d) => !d.includes("/") && !generated.has(d)).join(","));
  h.update(String(result.testing.test_files > 0));
  result.source_hash = h.digest("hex").slice(0, 16);
  return result;
}
