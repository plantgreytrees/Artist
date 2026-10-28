---
slug: scrutinise-design-directions
goal: directions.html and pick.json report contrast truthfully for every colour, Current's included (one grammar for validating and scoring colours), accept only colour shapes browsers accept, and never show zero impact when the project walk could not finish
level: feature
parent: docs/plans/design-directions.md
children: []
priority: P1
classification: in-scope (fixes to merged design-directions code; ARCH-DIRECTIONS-08/14/15 decided, docs/architecture/directions.rules.md)
tracker_rows: [scrutinise-design-directions#scrutinise-directions-parse] (rounds 1–2 rows COMPLETE or MERGED; fixes CANCELLED)
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(findings come from an isolated scrutineer over a merged range; scope is the cited lines)
coverage:
  contract:      3.2 (directions.json grammar: mixed comma/space separators and four space-separated channels now exit 2)
  data:          N/A(no database)
  config:        N/A(no flags)
  security:      3.2 (stricter grammar for untrusted token values)
  tests:         3.1–3.4 (failing-first tests in scripts/directions-colour.test.mjs and scripts/directions-walk.test.mjs)
  observability: N/A(offline CLI; exit codes 0/2)
  interface:     3.1 (Current pairs outside the grammar show as not checked instead of a wrong ratio)
  docs:          3.5 via /sync-docs --all → /architect --update (directions.rules.md governs and rule 13)
  rollback:      revert the merge
units:
  - id: 1
    scope_id: scrutinise-directions-parse
    project: "."
    depends_on: []
    module: scripts/directions.mjs (colour parsing, walk note)
    language: javascript (node ESM)
    security: high
    scope:
      read: [scripts/directions.mjs]
      docs: [docs/architecture/directions.rules.md, docs/architecture/verify.rules.md]
      write: [scripts/directions.mjs, scripts/directions-colour.test.mjs, scripts/directions-walk.test.mjs]
    arch: [ARCH-DIRECTIONS-08, ARCH-DIRECTIONS-13, ARCH-DIRECTIONS-14, ARCH-DIRECTIONS-15, ARCH-VERIFY-11, ARCH-VERIFY-18]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [test-driven-development], guards: [secrets-scan], mcp: [] }
---

# Plan: scrutinise design-directions — round 3 fixes

## Rolling summary
- Round 1 (391a9fd..eed45a8): 0 Critical, 5 Warning, 6 Suggestion, 1 UNMET → units contrast (55afd94), render (064eab1), unsupported (a282119); ARCH-DIRECTIONS-07 superseded by 15 (ced95ab).
- Round 2 (eed45a8..0bb45b0): 0 Critical, 4 Warning, 7 Suggestion → units colour (1921b61), walk (8363101); docs 4e22aef.
- Round 3 (0bb45b0..4e22aef, isolated scrutineer): 0 Critical, 1 Warning (Correctness), 6 Suggestion (1 Architecture), 0 UNMET. Findings 1 and 2 reproduced by root on main. Disputed: none. Earlier task detail is in git history.

## Scope Steps (executable core)

### Step 1 — scrutinise-directions-parse (., javascript, high)
Tooling: implementer · gates security-auditor · skills test-driven-development · guards secrets-scan
Depends on: none
- [ ] 3.1 [Warning · Correctness · ARCH-DIRECTIONS-08] `scripts/directions.mjs:306-319` `toRgba` parses colour functions with its own regex and `parseFloat`, so Current's DESIGN.md colours (never passed through `checkCssValue`) score `hsl(0.5turn 50% 50%)` as 0.5deg (5.19 vs #fff; correct 2.22) and `rgb(255abc 0 0)` as 4.00. Gate `toRgba` on `isColourFn`, so validation and scoring share one grammar and anything outside it returns null → accept: `contrast("hsl(0.5turn 50% 50%)", "#fff") === null` and `contrast("rgb(255abc 0 0)", "#fff") === null`; existing contrast reference tests green
- [ ] 3.2 [Suggestion · Correctness · ARCH-DIRECTIONS-15] `:57-67` `isColourFn` accepts shapes browsers reject: `rgb(0 0 0 0.5)`, `rgb(0, 0 0)`, `rgb(0,0,0 / .5)`. One separator style per value: comma form takes 3 or 4 comma-separated parts and no `/`; space form takes 3 space-separated parts plus an optional `/ alpha` → accept: those three exit 2 (`css-value`); `rgba(0, 0, 0, 0.5)`, `rgb(0 0 0 / 50%)`, `hsla(210, 40%, 50%, 0.8)` still accepted
- [ ] 3.3 [Suggestion · Correctness] `:517` `impactOf` defaults `limit` to `WALK_LIMIT`, so a caller passing `{ files, truncated: true }` gets a number in the note → accept: a test passing `{ files: [], truncated: true }` reads "stopped at 20000 entries"
- [ ] 3.4 [Suggestion · Test-coverage] pin the walk-limit boundary: exactly `limit` entries, fully walked, gives `truncated: false` → accept: boundary test in `scripts/directions-walk.test.mjs` green

### Not a unit — routed to /sync-docs --all design-directions (via /architect --update)
- [ ] 3.5 [Suggestion · Architecture · ARCH-DIRECTIONS-13] `docs/architecture/directions.rules.md:3` governs and rule 13 name only `scripts/directions.test.mjs`; add `scripts/directions-*.test.mjs` to governs and say `scripts/directions*.test.mjs` in rule 13 → accept: `arch-check governs scripts/directions-colour.test.mjs` lists directions.rules.md; lint PASS

## Follow-ups (PENDING, not driven)
- HTML mix impact panel shows `data.notes.impact` only when the list is empty, so the walk-stopped reason is not on the page (`directions.mjs:1042`; items still carry "[unsupported formats not counted]").
- Walk reports truncated when only empty directories remain on the stack at the limit (safe direction).
- `NOT_COMPUTED` note chosen by cause (missing dark value / unparseable / gradient or `var()`).
- Static cards show a not-checked badge when `computed === 0`; pick.json gains a computed count.
- `slotToken` tie-break by code-unit order, not `localeCompare`.
- Font magic check reads only the first 4 bytes.
- PAGE_JS mix badge logic exercised in a `vm` test instead of a source-text match.
- `none` / `transparent` keywords for no-shadow schools (needs an ARCH-DIRECTIONS-15 amendment).

## Verification background
- Residual risk (scrutineer): page not run in a browser; walk cost on >20k-entry repos unmeasured; `public`/`out`/`vendor` skips could hide a real `.svelte` file kept there; no full DESIGN.md fixture with `turn` hues or `none`.

CONSUMERS:
- `isColourFn` → scripts/directions.mjs `isColour` (checkCssValue, gradients) and, after 3.1, `toRgba`
- `toRgba` → scripts/directions.mjs `contrast`, `contrastPairs` (Current and directions); scripts/directions-colour.test.mjs and directions.test.mjs contrast tests
- `impactOf` `unsupported` → scripts/directions.mjs `resolvePick`, `renderDirections`, `main`; scripts/directions-walk.test.mjs
