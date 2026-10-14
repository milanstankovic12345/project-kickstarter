---
description: UI/UX audit - design-system consistency, states, responsive layout, WCAG 2.2 accessibility and visual verification with browser tools when available.
argument-hint: "[route, component path or area]"
---

Scope: `$ARGUMENTS` (empty = the main UI).

1. Check that `project-context/project-profile.md` reports a UI. If the
   project has no UI, say so and stop.
2. Resolve each agent's model with
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/routing.mjs" resolve <agent> --json`.
   Then dispatch these in parallel, **in one message**. Give each the scope,
   the profile path and the plugin root (`${CLAUDE_PLUGIN_ROOT}`):
   - `project-kickstarter:accessibility-auditor`: WCAG 2.2 AA review.
     Saves with `reports.mjs save audit AUDIT-<date>-a11y ui`.
   - `project-kickstarter:visual-qa`: only if the app can be started
     locally and a browser tool is available (Playwright or Chrome
     DevTools MCP, or the project's own Playwright). Saves with
     `reports.mjs save audit AUDIT-<date>-visual visual`.
   - `project-kickstarter:ui-director`: only if `docs/design/direction.md`
     is missing or the user asked for direction. Audits token and
     component consistency using the tokens-and-systems reference of the
     premium-ui skill. It returns its findings in its final message.
3. Summarize the findings by severity. State clearly which checks were
   **not visually verified**, and why.
