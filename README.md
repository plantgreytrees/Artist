# Artist

Artist is a Claude Code plugin that designs, builds, measures and refines web and mobile UI until it meets a scored quality bar. It keeps one source of truth, `docs/design/DESIGN.md`, and measures every page with a script instead of guessing.

## Install

```
/plugin marketplace add plantgreytrees/Artist
/plugin install artist@artist-marketplace
```

## Skills

| Skill | What it does |
| --- | --- |
| `design-system` | Derives, audits and maintains `docs/design/DESIGN.md` (tokens, components, layouts, packages) from your code. It is the only writer of that file. |
| `create` | Builds or refines UI against DESIGN.md in up to three measured rounds, scored by an isolated design critic and a reuse check. |
| `verify` | Measures a running page with `scripts/verify.mjs` (screenshots, axe, Core Web Vitals) and explains each failed threshold. |
| `optimise` | Fixes measured performance and accessibility failures and UI-level security smells. |

### Reuse rule

Reuse first: existing components, layouts, colours and installed npm packages come before anything new. Anything new, including a new dependency, needs a one-line justification and is proposed as an inventory or token addition.

## Theming and white-labelling

`DESIGN.md` is format 2: Primitives (palette and scales), Semantic tokens mapped to CSS variables or theme keys, and Themes with one set per brand, each with light and dark values. Components use semantic tokens only, so adding a brand means adding a theme set, never new literals. On web, switch brands with `[data-theme]` / `[data-brand]` attributes; on React Native, use one theme object per brand with `useColorScheme`. Every animation uses the Motion tokens and has a reduced-motion fallback.

## Keeping the design consistent

`design-system init` and `audit` run `scripts/inventory.mjs`, which regenerates the Components (props, variants), Layouts, Schemas and Packages inventory in `DESIGN.md` between the `artist:inventory` markers. `audit` also runs `reuse-check.mjs --all` and writes `docs/design/consistency.md`, grouped by category (raw colours, off-scale spacing, raw motion, missing reduced-motion fallbacks, near-duplicate components, stale inventory entries, new components and packages), each item with `file:line` and a suggested fix. A format-1 `DESIGN.md` is migrated by `init`.

### Vue and Nuxt

The inventory reads `.vue` single-file components as well as React files. Props come from `defineProps<T>()` (inline, a local `interface`/`type`, or a type exported by another project file, `&` intersections included), runtime `defineProps({...})` / `defineProps([...])`, or an Options API `props:`. In a Nuxt app (a `package.json` that depends on `nuxt`), components get their auto-import names (`components/shared/SectionCard.vue` is `SharedSectionCard`), usage counts `<SharedSectionCard>`, `<shared-section-card>` and `<LazySharedSectionCard>` as well as explicit `.vue` imports, `layouts/*.vue` are layouts listing the `pages/` routes that use them through `definePageMeta({ layout })`, and `pages/`, `app.vue` and `error.vue` are not components. A component file is deprecated when it opens with an `<!-- @deprecated -->` comment or puts `/** @deprecated */` on its `defineProps`, `defineOptions` or `export default`. Components rendered only through `<component :is>` count as unused.

## First run

`verify.mjs` needs its own dependencies (Playwright and axe). When they are missing it prints the exact `npm ci --prefix ...` command to run; run it once and retry.

## Craftsman setup

Artist works without craftsman. If you use craftsman, add the design critic to its config, keeping `Explore` in the list:

```json
{ "execution": { "builtinAgents": ["Explore", "artist:design-critic"] } }
```

## Opt-in integrations

Artist bundles only the `playwright` and `chrome-devtools` MCP servers. The following are never bundled; add the ones you want to your project `.mcp.json` or with `claude mcp add`. Check each project's docs for the current version and pin an exact one.

### Next DevTools

```json
{
  "mcpServers": {
    "next-devtools": {
      "command": "npx",
      "args": ["-y", "next-devtools-mcp@0.4.0"],
      "env": { "NEXT_TELEMETRY_DISABLED": "1" }
    }
  }
}
```

Shell form: `NEXT_TELEMETRY_DISABLED=1 npx -y next-devtools-mcp@0.4.0`

### Expo

```
claude mcp add --transport http expo https://mcp.expo.dev/mcp
```

Then run `/mcp` in Claude Code to sign in with your Expo account (OAuth). Some tools need a paid EAS plan.

### Flowbite

```
claude mcp add flowbite -- npx -y flowbite-mcp@1.1.5
```

### GSAP

GSAP ships skills, not an MCP server:

```
/plugin marketplace add greensock/gsap-skills
```

### shadcn

Run in your project:

```
npx shadcn@4.22.1 mcp init --client claude
```

### 21st

```
npx @21st-dev/cli@1.18.0 init --client claude
```

The CLI asks for your 21st.dev API key. Never paste the key into a command or a committed file.

### UI/UX Pro

```
claude mcp add ui-ux-pro -- npx -y ui-ux-pro-mcp@1.5.0 --stdio
```

## Development

Run the tests:

```
node --test scripts/*.test.mjs
```

Run the evals (one case per workflow skill under `evals/`; results go to the git-ignored `evals/results/`):

```
claude plugin eval .
```

## License

MIT
