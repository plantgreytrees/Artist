# Design directions (`create --directions`)

Optional step before the build loop (ARCH-DIRECTIONS-01). This file holds the fixed school list and the data contract that `scripts/directions.mjs` enforces. Directions are written in-session as perspectives. Never dispatch agents for them, and the design critic never scores them.

## Design schools

The ten ids below are the only schools. `SCHOOLS` in `scripts/directions.mjs` must equal this table, and a test asserts it. A direction may adapt a school's values to the project but must not invent an eleventh school. The ambitious column marks the schools that may fill the ambitious slot.

| id | school | ambitious | palette | type | shape & depth | motion |
| --- | --- | --- | --- | --- | --- | --- |
| minimalist | Minimalist | no | near-monochrome, one accent | one sans, few sizes | flat, hairline borders | subtle fades |
| swiss | Swiss / International | no | high-contrast neutrals, one strong accent | grotesk, strict scale, grid-led | sharp corners, no shadow | almost none |
| material | Material (M3) | no | tonal palettes from a seed colour | Roboto-class sans, type roles | rounded, elevation tiers | standard easing, ripple and state layers |
| flat | Flat | no | bright saturated solids | friendly sans | no shadow or gradient | quick, simple |
| neumorphism | Neumorphism (soft UI) | no | one muted base hue | soft sans | extruded and inset dual shadows | gentle press states (WCAG contrast risk) |
| glassmorphism | Glassmorphism | yes | translucent layers over vivid backdrop | clean sans | backdrop blur, light borders | parallax, depth shifts (needs reduced-transparency fallback) |
| brutalist | Brutalist / Neo-brutalist | no | raw high-contrast, clashing accents | mono or system, oversized | thick borders, hard offset shadows, no radius | abrupt, none |
| editorial | Editorial | no | restrained, ink-on-paper | serif display plus sans body, large scale | generous whitespace, rules | slow reveals |
| retro-futurist | Retro-futurist / Cyberpunk | yes | dark base, neon accents | geometric or mono | glow, scanlines, angled cuts | glitch, flicker (reduced-motion fallback) |
| aurora | Aurora / gradient glow | yes | dark base, radial multi-hue gradients | modern sans | soft glows, glass cards | staggered cascade entrances |

## directions.json (schema 1)

```json
{
  "schema": 1,
  "current": { "school": "minimalist", "concept": "…", "evidence": ["docs/design/DESIGN.md: Semantic tokens color.text", "src/App.tsx:12"] },
  "directions": [
    { "id": "bold", "school": "brutalist", "brief": "…",
      "palette": { "color.accent": { "light": "#ff3b00", "dark": "#ff6a3d" } },
      "type": { "body": "16px" }, "shape": { "radius.md": "0px" }, "motion": { "dur.fast": "0ms" },
      "base": { "space.4": "20px" } }
  ]
}
```

- `current` names the present concept with `file:line` or DESIGN.md row evidence. It is a judgement, never a score, and carries no token values: Current's values are read from `docs/design/DESIGN.md` (format 2) by the script.
- 3 to 5 directions, distinct schools, none equal to `current.school`, at least one ambitious school. Direction ids are lowercase (`a-z`, digits, `-`) and `current` is reserved.
- Each axis maps a DESIGN.md token name (Semantic, Type scale, Spacing, Motion) or a Component token variable to a value, or a new name with `"proposed": true`. A colour token carries both `light` and `dark`. `base` holds only Spacing and Component tokens, never markup or layout.
- Values must match the strict CSS grammar: hex, `rgb()`, `hsl()`, `oklch()`, linear and radial gradients of those, numbers with `px`, `rem`, `em`, `ms`, `%`, `cubic-bezier()`, and font family names. Anything else exits 2.

## Pick

The page hands a pick back as `artist-pick v1 base=<id> palette=<id> type=<id> shape=<id> motion=<id>` (`current` is a valid id). Resolve it with `node "${CLAUDE_PLUGIN_ROOT}/scripts/directions.mjs" --resolve "<line>" --directions <json> --project <dir>`; add `--reuse <reuse.json>` only if it came from `reuse-check --all`. The script writes `pick.json` and reports every number; do not compute any yourself.
