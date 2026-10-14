# Frontend performance

Measure first: Lighthouse (CLI or DevTools MCP), the framework's bundle
analyzer (`next build` output, `vite-bundle-visualizer`,
`webpack-bundle-analyzer`), and the browser performance trace. Record
before and after numbers with the same method.

## Targets (Core Web Vitals, "good" thresholds at p75)
- LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.

## Checklist
- **Bundle:** avoid heavy dependencies for small needs (date, lodash,
  icons). Import per module, code-split routes, lazy-load heavy widgets
  (editors, charts, maps). Check that tree-shaking works. Watch for
  duplicate dependency versions.
- **Images:** responsive `srcset`/`sizes`, modern formats (AVIF/WebP),
  explicit width and height to prevent CLS, lazy-load below the fold,
  priority hint for the LCP image (`fetchpriority="high"` or the
  framework's priority prop).
- **Fonts:** at most two families, `font-display: swap`, preload only the
  critical weight, subset if possible, and size-adjust fallbacks to limit
  CLS.
- **Rendering:**
  - avoid re-rendering large trees: memoise when it's measured to help,
    stabilise props, split context, virtualise lists over ~100 rows;
  - keep long work off the main thread (defer, web workers);
  - avoid layout thrashing.
- **Data:** cache and dedupe requests (SWR, React Query, framework fetch
  cache); paginate; prefetch likely next routes; show skeletons rather
  than blocking.
- **Server rendering:** where the framework supports SSR/SSG/RSC, use it
  for content that doesn't need client JS. Streaming for slow sections.
- **Third parties:** load analytics and chat widgets after interaction or
  idle; audit their weight.

Never trade accessibility or correctness for a benchmark number.
