# Web reference (React, Next.js, Tailwind, shadcn)

Load this for web stacks. Reuse first: check the DESIGN.md Components, Layouts and Packages inventories before adding anything.

## React and Next.js
- Prefer Server Components; add `"use client"` only for state, effects or browser APIs.
- Use `next/image` with explicit width and height (or `fill` with a sized parent) to avoid CLS; mark the LCP image `priority`.
- Use `next/font` for fonts with `display: swap`; never load fonts via render-blocking links.
- Use `next/link` for navigation and semantic landmarks (`header`, `nav`, `main`, `footer`).

## Tailwind
- Map each DESIGN.md semantic token to a CSS variable and to the Tailwind theme: `colors: { action: { primary: "var(--color-action-primary)" } }`. Use token classes, not raw hex values or arbitrary `[...]` values.
- Switch brands and light/dark by attribute sets that redefine the variables, for example `[data-theme="dark"]` and `[data-brand="acme"]` blocks in the token file. Components never change; only the variable values do.
- A needed one-off value is proposed as a token, not hard-coded.
- Use responsive prefixes for the verified widths (375, 768, 1280); design mobile-first.
- Use `motion-safe:` / `motion-reduce:` variants (or `@media (prefers-reduced-motion: reduce)`) for every animation, with durations and easings from the Motion tokens.

## shadcn/ui
- If the Components inventory lists shadcn components, compose them rather than rebuilding buttons, dialogs, inputs or menus.
- Add a new shadcn component only with a justification line; keep it under the project's components path and inventory it via a proposal.
- Keep Radix semantics and focus handling intact when restyling.

## Installed packages
Use the package that covers the need: chart.js for charts, the installed icon set for icons, the installed animation or date library where present.

## Opt-in: Next DevTools MCP
Diagnosis only, never a source of scores. Opt in by adding the server yourself, with telemetry disabled:

```
NEXT_TELEMETRY_DISABLED=1 npx -y next-devtools-mcp@0.4.0
```
