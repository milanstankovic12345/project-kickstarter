# States, micro-interactions and motion

## Every data-driven view has these states

| State | Requirements |
|---|---|
| Loading | Skeletons matching the final layout (no layout shift) for content; a spinner only for short, local actions; `aria-busy` on the region |
| Empty | Explain why it's empty and what to do next (primary action), with the product voice; distinguish "no data yet" from "no results for filter" |
| Error | Human message, what happened, how to recover (retry or support); keep the user's input; `role="alert"` for blocking errors |
| Partial / stale | Show cached data with an indicator; offline banner if relevant |
| Success | Confirm consequential actions (toast or inline); undo for destructive actions where possible |
| Disabled | Explain why (tooltip or helper text); not only greyed out |

Forms need inline validation on blur or submit (not on every keystroke for
first-time input), errors linked with `aria-describedby`, focus moved to
the first error on submit, preserved input, and double-submit protection.

## Micro-interactions
- **Feedback within 100 ms** for every action: pressed state, optimistic
  UI where safe.
- Hover, focus and active states are distinct. Focus style is visible and
  never removed without a replacement.
- Transitions explain change: expand/collapse, list insert/remove, page
  transitions that preserve orientation.
- Destructive actions use confirmation proportional to the risk (undo is
  better than a modal for reversible actions).

## Motion
- Durations: 100–150 ms for micro feedback, 200–300 ms for overlays and
  panels. Ease-out entering, ease-in leaving.
- Animate `transform` and `opacity` only. Avoid animating layout
  properties.
- Respect reduced motion:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
  }
  ```
  Or use the framework's equivalent (e.g. `useReducedMotion` in Framer
  Motion). No parallax, auto-playing carousels or flashing (> 3 per second).
