---
slug: scrutinise-design-directions
goal: directions.html and pick.json report contrast truthfully for every colour a direction sets (shadcn names, alpha, gradients, hsl/oklch units), accept only numeric colour arguments, and never show zero impact when the project walk could not finish
level: feature
parent: docs/plans/design-directions.md
children: []
priority: P1
classification: in-scope (fixes to merged design-directions code; ARCH-DIRECTIONS-08/14/15 decided, docs/architecture/directions.rules.md)
tracker_rows: [scrutinise-design-directions#scrutinise-directions-colour, scrutinise-design-directions#scrutinise-directions-walk] (round 1 rows contrast, render, unsupported COMPLETE; fixes CANCELLED)
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(findings come from an isolated scrutineer over a merged range; scope is the cited lines)
coverage:
  contract:      2.1 (directions.json grammar tightened: non-numeric colour arguments and non-deg hue units now exit 2), 2.5 (unsupportedFilesOf returns {files, truncated}; impact items may carry a truncated note)
  data:          N/A(no database)
  config:        N/A(no flags)
  security:      2.1 (stricter grammar for untrusted token values)
  tests:         2.1–2.5 (failing-first tests in new scripts/directions-colour.test.mjs and scripts/directions-walk.test.mjs so each unit fits execution.unitContextBytes, ARCH-ENGINE-08; directions.test.mjs is write-only, for the :147 comment and the :494 call shape)
  observability: N/A(offline CLI; exit codes 0/2)
  interface:     2.5 (impact list shows a truncated note instead of zero)
  docs:          2.6 via /sync-docs --all (skills/create/references/directions.md is governed by plugin.rules.md, outside unit scope)
  rollback:      revert the merge
units:
  - id: 1
    scope_id: scrutinise-directions-colour
    project: "."
    depends_on: []
    module: scripts/directions.mjs (colour grammar, toRgba)
    language: javascript (node ESM)
    security: high
    scope:
      read: [scripts/directions.mjs]
      docs: [docs/architecture/directions.rules.md, docs/architecture/verify.rules.md]
      write: [scripts/directions.mjs, scripts/directions-colour.test.mjs, scripts/directions.test.mjs]
    arch: [ARCH-DIRECTIONS-08, ARCH-DIRECTIONS-13, ARCH-DIRECTIONS-15, ARCH-VERIFY-11, ARCH-VERIFY-18]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [test-driven-development], guards: [secrets-scan], mcp: [] }
  - id: 2
    scope_id: scrutinise-directions-walk
    project: "."
    depends_on: [scrutinise-directions-colour]
    module: scripts/directions.mjs (project walk, impact)
    language: javascript (node ESM)
    security: normal
    scope:
      read: [scripts/directions.mjs]
      docs: [docs/architecture/directions.rules.md, docs/architecture/verify.rules.md]
      write: [scripts/directions.mjs, scripts/directions-walk.test.mjs, scripts/directions.test.mjs]
    arch: [ARCH-DIRECTIONS-11, ARCH-DIRECTIONS-13, ARCH-DIRECTIONS-14, ARCH-VERIFY-11]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [secrets-scan], mcp: [] }
---

# Plan: scrutinise design-directions — round 2 fixes

## Rolling summary
- Round 1 (391a9fd..eed45a8): 0 Critical, 5 Warning, 6 Suggestion, 1 UNMET. Fixed by scrutinise-directions-contrast (55afd94), -render (064eab1) and -unsupported (a282119); rules synced by /architect --update (ced95ab: ARCH-DIRECTIONS-07 superseded by 15). Task detail is in git history.
- Round 2 (eed45a8..0bb45b0, isolated scrutineer): 0 Critical, 4 Warning (3 Correctness, 1 Architecture), 7 Suggestion (2 Architecture), 0 UNMET. Findings 1, 2 and 4 reproduced by root against main. Disputed: none.

## Scope Steps (executable core)

### Step 1 — scrutinise-directions-colour (., javascript, high)
Tooling: implementer · gates security-auditor · skills test-driven-development · guards secrets-scan
Depends on: none
- [x] 2.1 [Warning · Architecture · ARCH-DIRECTIONS-15] `scripts/directions.mjs:52` `COLOUR_FN` (`[0-9a-z.,%\s/+-]*`) accepts letters, so `rgb(abc def ghi)`, `hsl(abc 50% 50%)` and `rgb(none 0 0)` pass `checkCssValue`, though rule 15 allows numeric arguments only. Restrict each argument to a number, a percentage or (hue only) a `deg` angle, with an optional `/ alpha`; reject other units (`turn`, `rad`, `grad`) → accept: those three values and `hsl(0.5turn 50% 50%)` exit 2 with reason `css-value`; existing grammar tests green
- [x] 2.2 [Warning · Correctness · ARCH-DIRECTIONS-08] `:302-308`, `:328` `toRgba` returns a colour for a NaN hsl hue (`contrast("#ffffff", "hsl(abc 50% 50%)")` = 10.41; null before eed45a8). Restore a per-part NaN guard so any unparsable part returns null → accept: test asserts `contrast("#ffffff", "hsl(abc 50% 50%)") === null`
- [x] 2.3 [Warning · Correctness · ARCH-DIRECTIONS-08] `:302-304`, `:314-315` units ignored: oklch `%` chroma is read raw (`oklch(50% 40% 120)` vs #000 = 15.30, correct ≈ 3.66) and hsl saturation/lightness are not clamped (`hsl(0 50% 150%)`). Map oklch `%` chroma as `p / 100 * 0.4`; clamp hsl s and l to 0..1 → accept: reference-value tests to 2 dp for an oklch `%` chroma and an over-100% hsl lightness (equal to `#ffffff`)
- [x] 2.4 [Suggestion · Architecture] `:1`, `:49` and `scripts/directions.test.mjs:147` comments cite ARCH-DIRECTIONS-07 (superseded) → point at ARCH-DIRECTIONS-15 → accept: `grep -n "ARCH-DIRECTIONS-07" scripts/directions.mjs scripts/directions.test.mjs` finds nothing

### Step 2 — scrutinise-directions-walk (., javascript, normal)
Tooling: implementer · skills test-driven-development · guards secrets-scan
Depends on: scrutinise-directions-colour
- [x] 2.5 [Warning · Correctness · ARCH-DIRECTIONS-14] `:465`, `:472`, `:481` `unsupportedFilesOf` stops silently at `WALK_LIMIT` (20000) and returns what it found, so a large project can show zero impact. Return `{ files, truncated }` with an injectable limit (`unsupportedFilesOf(project, { limit })`); when truncated, `impactOf` marks each changed token's impact not computed with note `project walk stopped at <n> entries`; add `vendor`, `public`, `out`, `.venv`, `.turbo`, `.output`, `.vercel` to `SKIP_DIRS`; update the render and `--resolve` callers (`:1295`) and the existing test (`directions.test.mjs:494`) → accept: a test with a low injected limit shows the truncated note in the impact list and in pick.json, never zero; existing unsupported tests green

### Not a unit — routed to /sync-docs --all design-directions
- [x] 2.6 [Suggestion · Architecture] `skills/create/references/directions.md:76` Apply step 1 does not describe `contrastWarnings` entries with `ratio: null` (`directions.mjs:435`). Say such an entry is a pair that was not checked and to show its `note` → accept: the reference pack says so

## Follow-ups (PENDING, not driven)
- `NOT_COMPUTED` note chosen by cause: missing dark value, unparseable colour, or gradient/`var()` (`directions.mjs:388`, `:410-413`).
- Static cards show a not-checked badge when `computed === 0`, and pick.json gains a computed count (`:1018-1020` vs `:1174`).
- `slotToken` tie-break by code-unit order, not `localeCompare` (`:770`; determinism, ARCH-DIRECTIONS-06).
- Font magic check reads only the first 4 bytes (`:895`).
- PAGE_JS mix badge logic exercised in a `vm` test instead of a source-text match.
- Carried from round 1: `none` / `transparent` keywords for no-shadow schools (needs an ARCH-DIRECTIONS-15 amendment).

## Verification background
- Residual risk (scrutineer): page not run in a browser (alias `var()` validity, mix badge logic); walk order and cost on large repos unmeasured; compositing checked only against WCAG reference ratios; theoretical TOCTOU between `realInside` and `copyFileSync` needs local write access.

CONSUMERS:
- `checkCssValue` / `COLOUR_FN` → scripts/directions.mjs:92 (`isColour`), validateDirections; directions.json authored per skills/create/references/directions.md (grammar line already lists only numeric forms)
- `toRgba` / `contrast` → scripts/directions.mjs:347-348, :398 (contrastPairs); scripts/directions.test.mjs contrast tests
- `unsupportedFilesOf` → scripts/directions.mjs:1295 (main, feeds render and --resolve); scripts/directions.test.mjs:20, :494
- pick.json `impact` notes → skills/create/references/directions.md Apply step 1 (shown verbatim); not read by design-system
