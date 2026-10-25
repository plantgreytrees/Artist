> **Human reference.** The loop never reads this file. What it enforces lives in
> [`verify.rules.md`](./verify.rules.md); if the two disagree, the rules file wins
> and `/architect --update verify` should be run.

# Verify architecture
_Last verified: 2026-10-25 at `38431ca` · Source idea: [artist-ui-plugin](../ideas/artist-ui-plugin.md)_

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
| ARCH-VERIFY-07 | 3 runs, median, flag >20% spread | the idea's kill criterion for noisy perf | single run |
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
