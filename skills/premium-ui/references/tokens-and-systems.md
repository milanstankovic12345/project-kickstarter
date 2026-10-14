# Tokens, typography, spacing, components

## Token layers
1. **Primitive:** raw values (`--gray-50 … --gray-950`, `--blue-600`,
   `--space-1 = 4px`).
2. **Semantic:** purpose (`--color-bg`, `--color-fg-muted`,
   `--color-border`, `--color-accent`, `--color-danger`,
   `--radius-control`, `--shadow-overlay`).
3. **Component** (only when needed): `--button-primary-bg`.

Components use semantic tokens only. Themes such as dark mode remap the
semantic layer, so components never change per theme.

Keep tokens in the project's existing source of truth: CSS custom
properties, `tailwind.config` `theme.extend`, a theme object, or Style
Dictionary JSON. Don't create a second source.

## Typography
- Use a modular scale (e.g. 12/14/16/18/20/24/30/36/48) with explicit
  line-heights: about 1.5 for body text and 1.1–1.25 for headings.
- Body text is at least 16px on mobile. Lines are 45–75 characters.
- Weights: two or three per family. Use `font-variant-numeric:
  tabular-nums` for figures that are compared.
- Font loading: `font-display: swap`, subset if possible, preload the
  primary weight only.

## Spacing and layout
- Use a 4px base scale (4, 8, 12, 16, 24, 32, 48, 64). No arbitrary values
  like 13px.
- Spacing communicates grouping: related items sit closer than unrelated
  ones.
- Prefer layout primitives (Stack, Cluster, Grid, Container) over ad-hoc
  margins.
- Design mobile-first, with breakpoints matching the project's config. Use
  container queries where components live in variable-width slots.

## Components
- **Find before building:** search the codebase and the library (e.g.
  `Glob **/Button*`) before creating a new component.
- **API:** small and typed props; variants via an explicit prop
  (`variant="primary|secondary|ghost"`); composition over configuration;
  forward refs; spread native attributes.
- **States in the API:** `loading`, `disabled`, `error`, `selected`, and
  each needs a visual.
- **Documentation:** if the project uses Storybook or a similar tool, add
  stories for every state and variant.
- **Never fork a library component.** Wrap it or theme it.

## Consistency audit (for ui-audit)
Grep for hardcoded colours (`#[0-9a-fA-F]{3,8}`, `rgb(`), pixel values
outside the scale, inline styles, duplicate components (`Button`,
`Btn`, `PrimaryButton`). Report counts and locations as findings, with
severity medium or low unless they cause accessibility failures.
