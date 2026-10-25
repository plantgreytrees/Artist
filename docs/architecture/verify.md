> **Human reference.** The loop never reads this file. What it enforces lives in
> [`verify.rules.md`](./verify.rules.md); if the two disagree, the rules file wins
> and `/architect --update verify` should be run.

# Verify architecture
_Last verified: 2026-10-25 at `88d9255` · Source ideas: [artist-ui-plugin](../ideas/artist-ui-plugin.md), [design-doc-uniformity](../ideas/design-doc-uniformity.md)_

## In plain English
`scripts/verify.mjs` is the one place artist's numbers come from. Given a local
URL, it:
1. opens the page headless at 375, 768 and 1280 px and takes screenshots;
2. runs axe-core for accessibility violations;
3. measures LCP and CLS three times and takes the median;
4. writes `report.json` and a self-contained `review.html` into
   `.artist/runs/<timestamp>/`.

The model reads the report. It never estimates the numbers itself. The two MCP
servers are for digging into why a check failed.

## How it fits
```mermaid
flowchart LR
  SK[create / verify / optimise skills] -->|node verify.mjs URL| V[scripts/verify.mjs]
  V -->|first run installs into| PD[(CLAUDE_PLUGIN_DATA/node_modules)]
  V --> PW[playwright chromium headless]
  PW --> AX[@axe-core/playwright]
  PW --> WV[web-vitals injected]
  V --> R[(.artist/runs/ts/)]
  R --> J[report.json schema 1]
  R --> P[375.png · 768.png · 1280.png]
  R --> H[review.html offline]
```

## Decisions
| id | decision | why | rejected alternatives |
|---|---|---|---|
| ARCH-VERIFY-01 | Script is the only source of reported scores | repeatable, cheap on tokens | MCP-only measurement |
| ARCH-VERIFY-02 | Versioned `report.json` schema | critic, review page and future craftsman use read one shape | ad-hoc text |
| ARCH-VERIFY-03 | 375/768/1280 default breakpoints | phone, tablet, laptop | single viewport |
| ARCH-VERIFY-04 | Loopback-only unless `--allow-remote` | Playwright's origin lists are not a security boundary | trust the URL |
| ARCH-VERIFY-05 | Pinned deps in CLAUDE_PLUGIN_DATA | never pollute the target project; survives plugin updates | install into project |
| ARCH-VERIFY-06 | Output only under `.artist/runs/` | no stray files in source | write beside components |
| ARCH-VERIFY-14 | 3 runs, median; unstable only when LCP spread is >20% AND >100 ms (supersedes 07, owner-approved 2026-10-25) | catches real jitter; a fast local page (28 ms LCP) showed 57% relative spread from millisecond noise, so pure-relative failed every fast page | pure 20% (07); 20% and >250 ms |
| ARCH-VERIFY-08 | Exit 0/1/2; crash ≠ pass | fail closed | treat crash as skip |
| ARCH-VERIFY-13/10 | Offline `review.html` with slider, scores, axe, CWV, token diff and reuse findings (13 supersedes 09) | owner wants to see every change visually | terminal only; published artifact |
| ARCH-VERIFY-12 | Deterministic `reuse-check.mjs` → `reuse.json`; blocks on unjustified new components, layouts, raw colours or dependencies, and marks a new package that duplicates an installed one's capability | owner chose a script check over model judgement, and blocking over advisory | instructions + critic only; advisory |
| ARCH-VERIFY-11 | Node ESM plus `node --test` | matches craftsman | another runtime |

## Data & flows
Runs are append-only folders. Nothing is deleted automatically; `.artist/` should
be gitignored in target projects (the `design-system init` skill offers to add it).

## Trade-offs & known limits
- **Lab metrics only.** LCP and CLS are lab metrics. INP needs real interaction,
  so it is out of scope for v1.
- **Startup cost.** The first run installs Chromium-compatible Playwright, roughly
  150 MB in `CLAUDE_PLUGIN_DATA`.

## Glossary
- **Loopback**: localhost addresses only.
- **Median of 3**: the middle value of three measurements.

## Amendment 2026-10-25: inventory and whole-project consistency

| id | decision | why | rejected alternatives |
|---|---|---|---|
| ARCH-VERIFY-15 (supersedes 12) | reuse-check schema 2: also flags every colour literal outside the token/theme files, off-scale spacing, raw durations/easings, missing reduced-motion fallbacks; `--all` scans the whole project and adds stale inventory entries and near-duplicate components | one deterministic tool enforces one consistent, re-brandable design | model-judged audit; changed files only |
| ARCH-VERIFY-16 | inventory.mjs writes docs/design/inventory.json (components with props, variants, tokens used, usage, status; layouts with routes; zod/yup/JSON Schema/TS schemas; packages) and regenerates DESIGN.md's marked sections | deep, current knowledge of what exists, readable in DESIGN.md and exact in JSON | hand-maintained tables |

**Known limit:** prop and schema extraction is static (regex and light parsing, no TypeScript compiler), so unusual patterns may be missed; the inventory marks what it could not parse.

## Amendment 2026-10-25: uniformity ratios, token resolution, design-doc renderer
Source: [design-doc-uniformity](../ideas/design-doc-uniformity.md).

```mermaid
flowchart LR
  MD[scripts/design-md.mjs<br/>tables by header name] --> INV[inventory.mjs]
  MD --> RC[reuse-check.mjs]
  MD --> DD[design-doc.mjs]
  TR[scripts/token-refs.mjs<br/>class/key → --variable] --> INV
  TR --> RC
  RC --> RJ[(reuse.json schema 3 + ratios)]
  RJ --> DD --> HTML[(design-system.html)]
```

| id | decision | why | rejected alternatives |
|---|---|---|---|
| ARCH-VERIFY-17 (supersedes 01) | Page scores come from verify.mjs; consistency findings and ratios come from reuse-check.mjs; skills never compute numbers | keeps every number reproducible by a script, now that audit reports ratios | ratios labelled "counts" outside the rule; skill-computed figures |
| ARCH-VERIFY-18 (supersedes 15) | reuse.json schema 3 adds per-category `{conforming, justified, unjustified, total}` counted per site, `component_token_literals[]` and advisory `off_token_classes[]`; a justification never makes an item conforming | per-site matches how findings are reported (`file:line`); off-token Tailwind classes inform without breaking existing create loops | additive under schema 2; per-file counting; blocking default-palette classes |
| ARCH-VERIFY-19 (supersedes 16) | tokensUsed also resolves Tailwind classes by namespace from the Semantic tokens `variable` column and RN theme keys by exact token name; config is never executed | today a Tailwind `bg-brand` button records no token use (`inventory.mjs:164`); v4 maps `--color-brand` to `bg-brand` by definition | importing `tailwind.config.js`; counting any `theme.*` chain |
| ARCH-VERIFY-20 | design-doc.mjs is deterministic, self-contained, escapes everything, allowlists swatch values, embeds an input hash and supports `--check`; it validates Decisions ids | committed file must not churn or carry stored XSS; audit can flag a stale doc | `generated_at` timestamp; JS-applied swatches |

**Shared helpers:** `design-md.mjs` (one DESIGN.md parser, by header name, which also fixes the fixture-vs-template Themes header mismatch) and `token-refs.mjs` (pure resolver with its own tests).

**Known limits:**
- Site counting is regex-based, so CSS-in-JS, Vue/Svelte SFCs and vendored CSS can be miscounted. Every ratio reports `total`, so readers can sanity-check it.
- A v3 config using `require()`d themes or closures is beyond the static parse.
