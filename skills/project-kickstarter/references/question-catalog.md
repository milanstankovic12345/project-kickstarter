# Question Catalog

~94 curated questions across 11 categories. Per round, pick 5–10 questions
targeting the lowest-scoring confidence dimensions. Every question gets
options A–D; always add the implicit **"E) Other — I'll describe it"**.
If the user picks E, capture their free-text answer verbatim in
`docs/kickstart/answers.md`.

Selection rules:
- Greenfield: ask categories 1–3 in round 1, then follow the score.
- Brownfield (codebase analyzed): skip questions already answered by code
  (mark `[inferred from code]`), prioritize contradictions instead.
- Adapt depth: for Quick tier prefer the ⭐-marked questions.

## 1. Vision & Problem (V) — 8 questions

- ⭐ **V1. Which archetype best describes the product?**
  A) B2C mobile/web app B) B2B SaaS platform C) Internal tool/dashboard D) Dev tool/API/CLI
- ⭐ **V2. What is the single core problem it solves?**
  A) Save time/automate a task B) Reduce cost C) Enable something previously impossible D) Improve an existing experience
- **V3. What is the 1-year success vision?**
  A) Profitable side business B) Funded growth startup C) Internal adoption D) Portfolio/learning project
- **V4. What differentiates it from existing solutions?**
  A) Price B) Better UX C) Unique feature/data D) Vertical specialization
- **V5. Is there a hard deadline or event?**
  A) None B) Weeks C) 1–3 months D) Fixed launch date (describe)
- **V6. Who are the competitors to beat or learn from?**
  A) None known B) 1–2 (name them) C) Several established players D) Underserved niche, no direct competitor
- **V7. Is monetization planned?**
  A) Free B) Subscription C) One-time/usage-based D) Decide later
- **V8. What is explicitly NOT this product?**
  A) No e-commerce B) No social features C) No AI features D) No mobile (pick all that apply)

## 2. Users & Market (U) — 8 questions

- ⭐ **U1. Primary user persona?**
  A) Consumer B) Business professional C) Developer/technical D) Enterprise admin
- ⭐ **U2. Expected user volume in year 1?**
  A) <100 B) 100–1k C) 1k–50k D) 50k+
- **U3. Concurrent users at peak?**
  A) <10 B) 10–100 C) 100–1k D) 1k+
- **U4. How will users reach the product?**
  A) Public web B) App store C) Behind a login/invite D) Internal network only
- **U5. Accessibility requirements?**
  A) Basic semantic HTML B) WCAG 2.1 AA C) WCAG AAA/legal mandate D) Not required
- **U6. Internationalization?**
  A) Single language B) 2–3 languages planned C) Multi-locale from day 1 D) Unknown
- **U7. Who pays (if monetized)?**
  A) End user B) Company/team plan C) Advertiser D) N/A
- **U8. Support model?**
  A) Self-serve docs B) Email/tickets C) Dedicated support D) Community

## 3. Scope & MVP (S) — 10 questions

- ⭐ **S1. MVP core feature set?**
  A) One killer feature only B) Core + auth + settings C) Broad feature set D) Full v1 vision
- ⭐ **S2. Time-to-first-usable-prototype?**
  A) Days B) 2–4 weeks C) 2–3 months D) No pressure
- **S3. Authentication needed?**
  A) None B) Email/password C) OAuth social logins D) SSO/enterprise (SAML, OIDC)
- **S4. Roles & permissions?**
  A) Single role B) User/admin C) Fine-grained RBAC D) Multi-tenant orgs with roles
- **S5. Payments in MVP?**
  A) No B) Yes, subscriptions C) Yes, one-time D) Marketplace/split payments
- **S6. Notifications?**
  A) None B) Email C) Email + push D) In-app + webhooks too
- **S7. Search complexity?**
  A) None B) Simple DB filter C) Full-text search D) Faceted/fuzzy/AI search
- **S8. File/media handling?**
  A) None B) Simple uploads C) Images/video processing D) Large-scale media pipeline
- **S9. Reporting/analytics?**
  A) None B) Basic counters C) Dashboards/charts D) Advanced BI
- **S10. Admin panel?**
  A) None B) Minimal CRUD C) Full back-office D) Self-service for customers

## 4. Features & Functionality (F) — 10 questions

- **F1. Real-time features?**
  A) None B) Live updates (polling ok) C) WebSockets/chat D) Collaborative editing
- **F2. Offline capability?**
  A) None B) Read-only cache C) Full offline mode with sync D) PWA offline-first
- **F3. Background jobs?**
  A) None B) Simple scheduled tasks C) Queues/workers D) Heavy pipelines
- **F4. Email capabilities?**
  A) None B) Transactional only C) Marketing + transactional D) Full automation flows
- **F5. Export/import formats?**
  A) None B) CSV/JSON C) PDF/Excel D) Custom formats (describe)
- **F6. Versioning/audit trail?**
  A) None B) Updated-at timestamps C) Full history UI D) Legal-grade audit log
- **F7. Comments/collaboration?**
  A) None B) Simple notes C) Threads/mentions D) Real-time co-editing
- **F8. API exposure?**
  A) Internal only B) Public REST C) Public REST + webhooks D) GraphQL/SDKs
- **F9. AI/LLM features?**
  A) None B) Single AI feature C) AI is core to the product D) Agentic workflows
- **F10. Feature flags/experiments?**
  A) No B) Simple on/off flags C) A/B testing D) Full experimentation platform

## 5. Data & Domain (D) — 8 questions

- ⭐ **D1. Primary data store?**
  A) Relational (Postgres/MySQL) B) Document (Mongo/Firestore) C) SQLite/embedded D) Recommend for me
- ⭐ **D2. Data relationships complexity?**
  A) Simple key-value B) Normal entity relations C) Deep relational graphs D) Event-sourced
- **D3. Expected data volume year 1?**
  A) <1GB B) 1–100GB C) 100GB–1TB D) 1TB+
- **D4. Data sensitivity?**
  A) Public B) Personal data (PII) C) Financial/health D) Regulated special category
- **D5. Existing data to migrate?**
  A) None B) Small import C) Large migration D) Ongoing sync from legacy
- **D6. Multi-tenancy?**
  A) None B) Shared schema with tenant_id C) Schema-per-tenant D) Separate DBs
- **D7. Backups/retention policy?**
  A) Daily backup B) Point-in-time recovery C) Cross-region replication D) Compliance-driven (describe)
- **D8. Soft delete / data deletion rules?**
  A) Hard delete ok B) Soft delete C) Full GDPR erasure D) Legal hold requirements

## 6. Integrations (I) — 6 questions

- ⭐ **I1. Third-party integrations needed?**
  A) None B) Auth only C) Payments D) List them (Stripe, Slack, etc.)
- **I2. Email provider?**
  A) None B) Resend/SES C) SendGrid/Mailgun D) Recommend
- **I3. File storage?**
  A) None B) S3-compatible C) CDN-backed media D) Recommend
- **I4. External APIs with webhooks?**
  A) None B) 1–2 inbound C) Many inbound D) Bidirectional sync
- **I5. Analytics/telemetry?**
  A) None B) Privacy-friendly (Plausible) C) Full product analytics D) Data warehouse
- **I6. Legacy/enterprise systems?**
  A) None B) REST integration C) SOAP/EDI D) On-prem connectors

## 7. Tech & Architecture (T) — 12 questions

- ⭐ **T1. Frontend preference?**
  A) React/Next.js B) Vue/Nuxt C) Svelte/Solid D) Recommend
- ⭐ **T2. Backend preference?**
  A) Node/TS (NestJS/Express) B) Python (FastAPI/Django) C) Go/Rust/Java D) Recommend
- ⭐ **T3. Full-stack framework vs split?**
  A) Full-stack framework (Next/Nuxt/Laravel/Rails) B) Separate SPA + API C) Server-rendered monolith D) Microservices from day 1
- **T4. Hosting preference?**
  A) Vercel/Netlify/Render B) AWS/GCP/Azure C) VPS/Docker self-host D) On-prem
- **T5. Monorepo vs single repo?**
  A) Single repo B) Monorepo (pnpm/turborepo) C) Multi-repo D) Recommend
- **T6. Type safety level?**
  A) JavaScript B) TypeScript strict C) TS + Zod/schema validation everywhere D) End-to-end types (tRPC/GraphQL)
- **T7. Realtime infrastructure?**
  A) None B) Server-sent events C) WebSockets (self-hosted) D) Managed (Pusher/Ably/Supabase)
- **T8. Caching strategy?**
  A) None needed B) HTTP caching C) Redis D) Multi-layer cache
- **T9. Testing strategy?**
  A) Minimal smoke tests B) Unit + integration C) Full pyramid + E2E (Playwright) D) Contract/property testing
- **T10. Monorepo tooling / build system?**
  A) Default tooling B) Turborepo/Nx C) Bazel-grade D) N/A
- **T11. Mobile strategy?**
  A) None/web only B) Responsive PWA C) React Native/Flutter D) Native apps
- **T12. Existing codebase constraints?**
  A) None (greenfield) B) Keep current stack C) Migrate gradually D) Full rewrite

## 8. UX / UI (X) — 10 questions

- ⭐ **X1. Design system approach?**
  A) shadcn/ui + Tailwind B) MUI/Chakra MUI-style library C) Custom design system D) Recommend
- ⭐ **X2. Visual style?**
  A) Minimal/clean B) Bold/branded C) Dense/data-heavy D) Playful
- **X3. Dark mode?**
  A) No B) Yes, toggle C) System-preference auto D) Dark-only
- **X4. Primary platform?**
  A) Desktop-first web B) Mobile-first web C) Equal priority D) Native app first
- **X5. Key screens in MVP?**
  A) 1–3 screens B) 4–8 screens C) 9–20 screens D) Enumerate them
- **X6. Complex UI elements?**
  A) Forms/tables only B) Charts/visualizations C) Drag-and-drop/canvas D) Real-time collaborative UI
- **X7. Onboarding flow?**
  A) None B) Simple signup C) Guided wizard D) Interactive product tour
- **X8. Empty/error states priority?**
  A) Basic B) Polished with illustrations C) Skeleton loaders + optimistic UI D) Full state machine per screen
- **X9. Design references to imitate?**
  A) None B) Linear-style C) Notion-style D) Specific site (name it)
- **X10. Prototype fidelity before build?**
  A) Go straight to code B) Wireframe specs in uiux.md C) HTML mockup pages D) Figma-first

## 9. Security & Compliance (C) — 8 questions

- ⭐ **C1. Security posture?**
  A) Standard best practices B) Hardened (rate limits, CSP, audits) C) Security-certified pipeline D) Regulated industry (describe)
- **C2. Compliance requirements?**
  A) None B) GDPR C) HIPAA/SOC2 D) PCI-DSS/payments
- **C3. Secrets management?**
  A) .env files B) Platform secrets manager C) Vault-grade D) Recommend
- **C4. Rate limiting / abuse protection?**
  A) None B) Basic per-IP C) Per-user quotas D) WAF + bot protection
- **C5. Data encryption at rest?**
  A) Provider default B) Field-level for sensitive data C) Full BYOK D) N/A
- **C6. Dependency/SCA policy?**
  A) Manual updates B) Automated (Dependabot/Renovate) C) Locked + audited D) Supply-chain verified
- **C7. Pen-test / audit plan?**
  A) None B) Pre-launch self-audit C) Third-party pen-test D) Continuous bounty program
- **C8. Data residency?**
  A) Any region B) EU only C) Specific country D) Multi-region with residency rules

## 10. Ops, Deployment & Observability (O) — 8 questions

- ⭐ **O1. CI/CD expectation?**
  A) Manual deploy B) GitHub Actions basic C) Full pipeline w/ previews D) Enterprise release management
- **O2. Environments?**
  A) Local + prod B) + staging C) + preview per PR D) Multi-region prod
- **O3. Error monitoring?**
  A) Console only B) Sentry/similar C) Full APM D) SLO-driven alerting
- **O4. Logging strategy?**
  A) Print/stdout B) Structured JSON logs C) Centralized (Loki/Datadog) D) Audit-grade retention
- **O5. Feature rollback policy?**
  A) Redeploy previous build B) Blue-green C) Canary/progressive D) DB-migration-aware deploys
- **O6. Infrastructure as code?**
  A) Console-managed B) Terraform/Pulumi C) Full GitOps D) N/A
- **O7. Container strategy?**
  A) None B) Dockerfile for portability C) docker-compose for local + prod D) Kubernetes
- **O8. Cost sensitivity?**
  A) Free tier maximum B) <€50/mo C) €50–500/mo D) Cost is not a constraint

## 11. Constraints & Process (P) — 6 questions

- ⭐ **P1. Team size working with these agents?**
  A) Just me B) 2–4 devs C) 5–15 D) 15+
- **P2. Review strictness for agent-written code?**
  A) Trust but verify at the end B) Per-task review C) Mandatory reviewer agent per task D) Human approves every commit
- **P3. Git workflow?**
  A) Direct commits to main B) Feature branches + squash C) Trunk-based with flags D) GitFlow
- **P4. Commit/PR conventions?**
  A) Conventional Commits B) Free-form C) PR templates + checklists D) Signed commits required
- **P5. Documentation culture?**
  A) Minimal B) README + ADRs C) Docs-as-code with tests D) Full docs site
- **P6. Budget for third-party services?**
  A) $0 — free tiers only B) <$100/mo C) $100–1k/mo D) Unlimited
