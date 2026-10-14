# Accessibility (WCAG 2.2 AA)

Report findings with the success criterion number (e.g. 1.4.3) and the
exact element or location. List which checks were automated, which were
manual, and which were **not** performed.

## High-impact checks

| Area | Check | SC |
|---|---|---|
| Semantics | Native elements (`button`, `a href`, `label`, `table`); landmarks (`header`, `nav`, `main`); one `h1`; heading order | 1.3.1, 2.4.6 |
| Names | Every control has an accessible name (label, `aria-label`, alt); icon-only buttons are labelled | 4.1.2, 1.1.1 |
| Keyboard | Everything operable by keyboard; logical order; no traps; skip link | 2.1.1, 2.1.2, 2.4.3, 2.4.1 |
| Focus | Visible focus indicator; not obscured by sticky headers; focus moved into dialogs and restored on close | 2.4.7, 2.4.11, 2.4.3 |
| Contrast | Text ≥ 4.5:1 (large ≥ 3:1); UI components and focus indicators ≥ 3:1 — in all themes | 1.4.3, 1.4.11 |
| Resize/reflow | Usable at 200% zoom and at 320 CSS px width without horizontal scroll | 1.4.4, 1.4.10 |
| Forms | Labels, required indication, errors identified in text, suggestions given; autocomplete attributes on personal data | 3.3.1–3.3.3, 1.3.5 |
| Status | Async results announced (`role="status"` / `aria-live="polite"`); errors `role="alert"` | 4.1.3 |
| Targets | Pointer targets ≥ 24×24 CSS px or spaced | 2.5.8 |
| Dragging | Drag interactions have a single-pointer alternative | 2.5.7 |
| Motion | Reduced motion respected; nothing flashes more than 3 times per second | 2.3.1, 2.3.3 (AAA, recommended) |
| Auth | No cognitive tests without an alternative; paste allowed in password fields | 3.3.8 |
| Colour | Information not conveyed by colour alone | 1.4.1 |

## ARIA rules
Use no ARIA when native HTML works. Never put `role="button"` on a `div`
when a `button` works. Custom widgets (combobox, tabs, menu, dialog) follow
the WAI-ARIA Authoring Practices patterns, including keyboard interaction.
`aria-hidden` must never hide focusable content.

## Tooling (use what exists; record what ran)
- **Automated:** `@axe-core/playwright`, `jest-axe`, `vitest-axe`,
  `eslint-plugin-jsx-a11y`, `pa11y`, a Lighthouse accessibility audit
  (Chrome DevTools MCP `lighthouse_audit` if available). Automated tools
  find roughly a third of issues. Passing them is not compliance.
- **Manual:** keyboard-only walkthrough of the changed flow; zoom to 200%;
  check the reduced-motion setting; inspect names and roles in the
  accessibility tree (browser snapshot tools).
