# Changelog

## [Unreleased]

- Design depth and white-label theming: format-2 `DESIGN.md` with a generated component, layout, schema and package inventory, semantic tokens and per-brand light/dark themes; a platform consistency audit (`docs/design/consistency.md`); motion enforcement (motion tokens and reduced-motion fallbacks) in `create` and `optimise`; a variables-first tier (optional `## Component tokens` aliasing semantic tokens, Tailwind v4 CSS-first only); an append-only `## Decisions` table; a deterministic, script-free `docs/design/design-system.html` from `scripts/design-doc.mjs`; and per-category uniformity ratios `{conforming, justified, unjustified, total}` in `reuse.json` schema 3 with no total score. Rollback: revert the merges; Component tokens and Decisions are optional sections, and the schema-3 ratio keys appear only with `reuse-check.mjs --all`.
- Vue and Nuxt support in `inventory.mjs` and `reuse-check.mjs --all`: `.vue` components with their props, variants, tokens, usage and deprecation; Nuxt auto-import names, layouts and their page routes; and capability tags for Vue packages (Pinia, Nuxt UI, Vuetify, PrimeVue, vue-echarts, VeeValidate and others).

## [0.1.0] - 2026-10-25

First release of artist, a Claude Code plugin that designs, builds, measures and refines UI until it meets a scored quality bar.

### Added
- `design-system` skill (`init | audit`): the only writer of `docs/design/DESIGN.md`, with the colour scheme (light and dark), type scale, spacing, motion, and inventories of components, layouts and every installed package.
- `create` skill: reuses existing components, layouts, colours and installed npm packages first, then refines for up to 3 rounds. Each round runs `verify.mjs` and `reuse-check.mjs`, then an isolated read-only `design-critic` scores 8 rubric dimensions. The loop stops when every score is at least 4, axe serious and critical issues are 0, LCP is at most 2.5 s, CLS is at most 0.1, CWV is stable, and nothing new is unjustified.
- `verify` and `optimise` skills: measure a page, and fix measured performance and accessibility failures plus UI-level security smells.
- `scripts/verify.mjs`: screenshots at 375, 768 and 1280 px, axe-core at every width, median LCP/CLS over 3 loads. Only loopback URLs are measured, and redirects off loopback are blocked. Exit 0/1/2, writing `report.json` under `.artist/runs/`.
- `scripts/reuse-check.mjs`: flags new components, layouts, raw colours and dependencies missing from `DESIGN.md`, including packages that duplicate an installed one's capability.
- `scripts/review-html.mjs`: an offline `review.html` with a before/after slider, rubric per round, axe, CWV, the token diff and reuse findings.
- Bundled, version-pinned MCP servers for diagnosis: Playwright (0.0.83) and Chrome DevTools (1.12.0, usage statistics off).
- Eval cases for each skill (`claude plugin eval .`) and pinned opt-in snippets for Next DevTools, Expo, Flowbite, GSAP, shadcn, 21st and UI/UX Pro.

### Rollback
Uninstall the plugin (`/plugin uninstall artist`), or revert the release merge on `main`. The plugin has no hooks and writes only `.artist/runs/` and, through `design-system`, `docs/design/DESIGN.md` in your project.
