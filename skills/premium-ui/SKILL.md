---
name: premium-ui
description: Product-specific, premium UI/UX design and implementation - analyzing the existing product and design system, visual direction, typography, spacing, design tokens, reusable components, responsive layouts, WCAG 2.2 AA accessibility, keyboard navigation, reduced motion, micro-interactions, loading/empty/error states, visual verification and frontend performance. Use for any UI design, UI implementation, UI review or /project-kickstarter:ui-audit work, especially to avoid generic AI-looking interfaces.
---

# Premium UI

"Premium" here means **specific to this product, consistent, complete in
every state, accessible and fast**. It doesn't mean decoration. Generic AI
UI is the default failure mode: centered hero, purple gradient, glassmorphism
cards, emoji icons, one radius on everything, no empty or error states. The
fix is evidence about this product, not a different trend.

## Always start with the existing product

1. Read the UI system section of `project-context/project-profile.md`:
   framework, component library, token source, CSS approach.
2. Open the existing tokens (CSS variables, Tailwind config, theme files)
   and 2–3 representative screens and components. Reuse comes before
   creation.
3. If a running app is available and browser tools exist, screenshot the
   current state first. This is your baseline.

## Load references as needed

| Work | Reference |
|---|---|
| Setting or evolving visual direction | [references/design-direction.md](references/design-direction.md) |
| Tokens, typography, spacing, components | [references/tokens-and-systems.md](references/tokens-and-systems.md) |
| States, micro-interactions, motion | [references/states-and-motion.md](references/states-and-motion.md) |
| Accessibility (always for UI changes) | [references/accessibility.md](references/accessibility.md) |
| Screenshots, visual regression, responsive checks | [references/visual-verification.md](references/visual-verification.md) |
| Bundle, rendering, Core Web Vitals | [references/frontend-performance.md](references/frontend-performance.md) |

## Definition of done for a UI change

- [ ] Uses existing tokens and components; any new token is added to the
      token source, not inlined.
- [ ] Loading, empty, error, success and disabled states all exist (and
      partial or offline where relevant).
- [ ] Responsive at 360, 768, 1024 and 1440 px widths, with no horizontal
      scroll and touch targets of at least 24×24 CSS px (44 preferred).
- [ ] Keyboard: logical tab order, visible focus, no traps; Esc closes
      overlays; focus is managed on route or dialog change.
- [ ] Semantics: real buttons and links, labelled inputs, headings in
      order, `alt` text, live regions for async status.
- [ ] Contrast ≥ 4.5:1 for text and ≥ 3:1 for UI and large text, in every
      theme.
- [ ] `prefers-reduced-motion` respected; no animation is required to
      understand state.
- [ ] Verified visually (screenshots taken in this session, paths listed),
      or explicitly reported as **not visually verified** with the reason.

## Honesty about verification

Visual quality can't be judged from code alone. Without a browser tool
(Playwright MCP, Chrome DevTools MCP, or the project's own
Playwright/Storybook test runner) and a runnable app, write "not visually
verified". The orchestrator treats that as an open item.
