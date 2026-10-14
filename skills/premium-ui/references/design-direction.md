# Design direction (ui-director)

Output: `docs/design/direction.md`. Keep it short enough that implementers
actually read it, about one or two screens.

## 1. Evidence first
- **Product:** who uses it, in what context (desk or mobile, glanceable or
  focused, novice or expert), and what feeling it should create (calm,
  dense, energetic, trustworthy). Cite the PRD, README or uiux doc.
- **What exists:** current palette, type, spacing, radii, shadows,
  iconography, component library. What is consistent and what is drifting?
  List any inconsistencies you find (e.g. 7 greys, 4 border radii).
- **Constraints:** brand assets, the existing component library (MUI,
  shadcn, Chakra, Vuetify…), dark-mode requirement, i18n/RTL, density.

## 2. Decide (explicitly, with reasons)

| Axis | Decide |
|---|---|
| Personality | 3 adjectives, plus 1 the product must **not** feel like |
| Density | Compact, comfortable or spacious, chosen per surface (tables vs marketing) |
| Type | One or two families; a scale with concrete sizes and line-heights; the numeric style for data (tabular figures) |
| Colour | Neutral ramp, a single primary accent, semantic colours (success/warn/danger/info), dark-theme mapping |
| Shape | Radius scale (e.g. 4/8/12), border vs shadow strategy, elevation levels |
| Iconography | One icon set, stroke width, sizes |
| Motion | Purpose (feedback, orientation), durations (100–250 ms), easing, reduced-motion behaviour |
| Imagery | Illustration, photo or none, and how empty states look |

## 3. Anti-generic checklist
Reject a design that relies on:
- Gradient blobs, glass cards or neon glows as the main idea.
- Emoji as icons; stock "rocket" metaphors.
- Every card with the same shadow, radius and padding, regardless of
  hierarchy.
- Center-aligned long text; walls of equal-weight content; no hierarchy.
- Placeholder copy ("Lorem ipsum", "Welcome to your dashboard!").
- Missing empty, error and loading states.

Prefer instead:
- Hierarchy through type scale, weight and spacing before colour.
- One accent colour used sparingly, for the primary action and the
  current state.
- Real content and edge-case content (long names, zero items, 10k items).
- Product-specific details: domain-appropriate data formatting, helpful
  empty states that show the next action.

## 4. Deliver
- The direction document, with a component inventory that maps each needed
  component to an existing one, an extension, or a new one (justified).
- A token proposal as a diff to the existing token source, not a parallel
  file.
- 2–3 key screen descriptions or wireframes (ASCII or mermaid), only if no
  design files exist.
