# Visual verification

## Rule
Each visual claim ("looks right", "responsive", "matches the direction")
needs a screenshot taken **in this session**, with its path recorded. With
no browser tooling or no runnable app, report **"not visually verified:
<reason>"** and say nothing about how it looks.

## Tooling, in order of preference
1. **The project's own visual tests**, if present: Playwright
   `toHaveScreenshot`, Storybook + Chromatic/Loki, Percy. Run them, and
   update baselines only when the change is intentional and reviewed.
2. **Browser MCP tools available in the session**: Playwright MCP
   (`browser_navigate`, `browser_resize`, `browser_take_screenshot`,
   `browser_snapshot`) or Chrome DevTools MCP (`navigate_page`,
   `resize_page`, `take_screenshot`, `emulate`, `lighthouse_audit`). Tool
   names vary by installation; check which ones are available.
3. **A one-off Playwright script** run with the project's installed
   Playwright, in a test or verification task.

## Procedure
1. Start the app with the profile's dev command, in the background. Wait
   until the URL responds. Never point at production.
2. For each changed screen, capture:
   - widths 360, 768, 1024 and 1440 px;
   - light and dark theme, if supported;
   - each state you can trigger: loading, empty, error, populated, long
     content;
   - a keyboard focus pass on the primary flow.
3. Save the screenshots under `reports/screenshots/TASK-NNN/<screen>-<width>-<theme>.png`
   (or the tool's output dir) and list the paths in the review.
4. Compare against the direction document or baseline. Look for: overflow
   and clipping, misalignment, inconsistent spacing or type, contrast
   problems, layout shift between states, focus visibility, truncated text.
5. Findings take severity by user impact. A broken layout on mobile in the
   primary flow is high; a 2px misalignment is low.

## Regression
When baselines exist, a visual diff above the project's threshold is a
finding unless the task intended it. For intended changes, list the
updated baselines so the reviewer can inspect them.
