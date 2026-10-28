---
slug: scrutinise-design-directions
goal: directions.html and pick.json report contrast truthfully for every colour a direction sets (shadcn names, alpha, gradients), and the sample screen shows shape, motion and spacing changes whatever the project's token names
level: feature
parent: docs/plans/design-directions.md
children: []
priority: P1
classification: in-scope (fixes to merged design-directions code; ARCH-DIRECTIONS-06/08 decided, docs/architecture/directions.rules.md)
tracker_rows: [scrutinise-design-directions#scrutinise-directions-contrast, scrutinise-design-directions#scrutinise-directions-render] (scrutinise-directions-fixes CANCELLED: split per ARCH-ENGINE-08, 179 KB over the 122 KB unit budget)
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(findings come from an isolated scrutineer over a merged range; scope is the cited lines)
coverage:
  contract:      1.1, 1.3 (directions.json gains one rejection, colour-off-palette; pick.json schema 1 keeps its keys, contrastWarnings entries may carry ratio null with a not-computed note)
  data:          N/A(no database)
  config:        N/A(no flags)
  security:      1.6 (project font lookup resolves symlinks before containment)
  tests:         1.1–1.6 (each fix ships a failing-first test in scripts/directions.test.mjs)
  observability: N/A(offline CLI; exit codes 0/2)
  interface:     1.3, 1.4 (contrast badges, all-pass note, sample screen aliases)
  docs:          /sync-docs --all adds the palette-only colour line to skills/create/references/directions.md (governed by plugin.rules.md, kept out of unit scope for size); 1.7, 1.8 via /architect --update
  rollback:      revert the merge
units:
  - id: 1
    scope_id: scrutinise-directions-contrast
    project: "."
    depends_on: []
    module: scripts/directions.mjs (contrast)
    language: javascript (node ESM)
    security: high
    scope:
      read: [scripts/directions.mjs, scripts/directions.test.mjs, scripts/fixtures/directions/DESIGN.md, scripts/fixtures/directions/directions.json, scripts/fixtures/directions/low-contrast.json, scripts/fixtures/directions/invalid/unknown-token.json]
      docs: [docs/architecture/directions.rules.md, docs/architecture/verify.rules.md]
      write: [scripts/directions.mjs, scripts/directions.test.mjs, scripts/fixtures/directions/**]
    arch: [ARCH-DIRECTIONS-05, ARCH-DIRECTIONS-08, ARCH-DIRECTIONS-13, ARCH-VERIFY-11, ARCH-VERIFY-18]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [test-driven-development], guards: [secrets-scan], mcp: [] }
  - id: 2
    scope_id: scrutinise-directions-render
    project: "."
    depends_on: [scrutinise-directions-contrast]
    module: scripts/directions.mjs (aliases, resolve, project font)
    language: javascript (node ESM)
    security: high
    scope:
      read: [scripts/directions.mjs, scripts/directions.test.mjs, scripts/fixtures/directions/DESIGN.md, scripts/fixtures/directions/directions.json, scripts/fixtures/directions/project/**]
      docs: [docs/architecture/directions.rules.md, docs/architecture/verify.rules.md]
      write: [scripts/directions.mjs, scripts/directions.test.mjs, scripts/fixtures/directions/**]
    arch: [ARCH-DIRECTIONS-06, ARCH-DIRECTIONS-09, ARCH-DIRECTIONS-12, ARCH-DIRECTIONS-13, ARCH-VERIFY-11]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [test-driven-development], guards: [secrets-scan], mcp: [] }
  - id: 3
    scope_id: scrutinise-directions-unsupported
    project: "."
    depends_on: [scrutinise-directions-render]
    module: scripts/directions.mjs (impact, unsupported formats)
    language: javascript (node ESM)
    security: normal
    scope:
      read: [scripts/directions.mjs, scripts/directions.test.mjs, scripts/fixtures/directions/inventory.json, scripts/fixtures/directions/inventory-unsupported.json, scripts/fixtures/directions/DESIGN.md]
      docs: [docs/architecture/directions.rules.md, docs/architecture/verify.rules.md]
      write: [scripts/directions.mjs, scripts/directions.test.mjs, scripts/fixtures/directions/**]
    arch: [ARCH-DIRECTIONS-11, ARCH-DIRECTIONS-13, ARCH-DIRECTIONS-14, ARCH-VERIFY-11, ARCH-VERIFY-23]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [secrets-scan], mcp: [] }
---

# Plan: scrutinise design-directions — round 1 fixes

## Rolling summary
Round 1 (`/scrutinise design-directions`, isolated scrutineer, range 391a9fd..eed45a8): 0 Critical, 5 Warning (4 Correctness, 1 Architecture), 6 Suggestion, 1 UNMET (design-directions acceptance: "a pair under 4.5:1 renders a visible badge … per direction and in the live mix", unticked). Disputed: none.

## Scope Steps (executable core)

### Step 1 — scrutinise-directions-contrast (., javascript, high)
Tooling: implementer · gates security-auditor · skills test-driven-development · guards secrets-scan
Depends on: none
- [ ] 1.1 [Warning · Correctness · ARCH-DIRECTIONS-08] `scripts/directions.mjs:193-223` `checkEntry` accepts a colour (light/dark) token on `type`, `shape` or `motion`, but `contrastFor` (`:374-377`) reads only `palette`, so #eee text on #fff set on `shape` renders with no badge and no `contrastWarnings`. Reject a colour token on any axis but `palette` (exit 2, reason `colour-off-palette`) → accept: new invalid fixture exits 2 naming `colour-off-palette`; existing tests green
- [ ] 1.2 [Warning · Correctness · ARCH-DIRECTIONS-08] `:334-342` `ROLES`: in shadcn naming `muted` and `accent` are backgrounds (foregrounds are `muted-foreground`, `accent-foreground`), giving false 1.1:1 warnings on Current. Prefer `muted-foreground`/`accent-foreground`, prefer `primary` over bare `accent`, try bare `muted`/`accent` last; roles resolve in list order, not map order → accept: a shadcn-named fixture yields the reference ratios and no false warning
- [ ] 1.3 [Warning · Correctness · ARCH-DIRECTIONS-08, ARCH-VERIFY-18] `:271-327` and PAGE_JS (~`:872`): alpha colours are scored as opaque and gradient/`var()` pairs are skipped while the page still prints "All text pairs are at least 4.5:1". Composite an alpha foreground or surface over the resolved opaque background (page background for surface); a pair that cannot be computed is reported as not computed, naming the pair (pick.json: `ratio: null` with a `note`); the all-pass note shows only when every role pair was computed, per direction and in the mix → accept: tests for an rgba surface (composited ratio), a gradient background (not-computed entry, no all-pass note)

### Step 2 — scrutinise-directions-render (., javascript, high)
Tooling: implementer · gates security-auditor · skills test-driven-development · guards secrets-scan
Depends on: scrutinise-directions-contrast
- [ ] 1.4 [Warning · Correctness · ARCH-DIRECTIONS-06] `:603-638` `aliasDecls` reads only `space.2`, `space.4`, `radius.md`, `body`, `heading`, `dur.fast`, `ease.out`, `shadow.md`, `blur`, so for other naming the sample screen shows no shape, motion or spacing change. Pick each alias from Current's tokens by category (DESIGN.md section and value kind via `currentFrom`), falling back to the fixed defaults → accept: render test with a DESIGN.md using different names shows a direction's radius, duration and spacing values reaching the sample-screen aliases
- [ ] 1.5 [Suggestion · Correctness · ARCH-DIRECTIONS-09] `:1146-1154` `--resolve` writes into the lexicographically last directory; consider only names matching `/^\d{8}T\d{6}Z$/` → accept: a stray `old/` directory is ignored
- [ ] 1.6 [Suggestion · Security · ARCH-DIRECTIONS-12] `:740`, `:747-749` `findProjectFont`: `realpathSync` root and candidate before the containment check, and require a regular file whose first bytes are a woff (`wOFF`) or woff2 (`wOF2`) signature → accept: a symlink pointing outside the project is not copied; existing font tests green

### Step 3 — scrutinise-directions-unsupported (., javascript, normal) — added by /architect --update (ARCH-DIRECTIONS-14 VIOLATED; user: proceed with the recommended fix)
Tooling: implementer · skills test-driven-development · guards secrets-scan
Depends on: scrutinise-directions-render
- [ ] 1.9 [Warning · Architecture · ARCH-DIRECTIONS-14] `inventory.mjs:419` keeps only tsx/jsx/ts/js/vue files, so `impactOf`'s unsupported branch (`directions.mjs:463-486`) never fires on real inventory output and a Svelte or Astro project gets "no component uses it" (zero). Scan the project itself (bounded walk, skipping `node_modules`, `.git`, `.artist`, `dist`, `build`) for component files in formats inventory does not support (`.svelte`, `.astro`, `.marko`, `.riot`) and pass them to `impactOf`, which marks impact unsupported; the render and `--resolve` CLI both pass them → accept: a project with `src/Card.svelte` and no inventory entry for it shows the unsupported note in the impact list and pick.json, never zero

### Not a unit — routed to /sync-docs --all design-directions
- [ ] 1.7 [Warning · Architecture · ARCH-DIRECTIONS-10] `docs/architecture/directions.rules.md:20` check says design-system "init step 7"; the code, directions.md, eval grader and test use step 8, which is right (`skills/design-system/SKILL.md:34`). No code task: pre-approved doc-stale fix in `/sync-docs --all design-directions` via `/architect --update` → accept: rule text says step 8
- [ ] 1.8 [Suggestion · Architecture · ARCH-DIRECTIONS-07] the rule's grammar list omits `rgba`/`hsla`, `cubic-bezier()`, easing keywords, bare numbers and `deg` in gradients that the code accepts (all safe; directions.md documents cubic-bezier). Route to `/architect --update` in `/sync-docs`; if judged a decision change, ask the user → accept: rule and code agree

## Follow-ups (PENDING, not driven)
- `none` / `transparent` keywords so no-shadow schools can write `shadow.md: none` (needs an ARCH-DIRECTIONS-07 amendment).

## Verification background
- Residual risk (scrutineer): `font-src 'self'` on file:// varies by browser; mix cascade and reduced-transparency untested in a real browser; `oklch()` percentage chroma and unit-less `hsl()` ratios unverified.

CONSUMERS:
- directions.json (validation tightened) → scripts/directions.mjs `validateDirections`; produced in-session per skills/create/references/directions.md
- contrastFor / contrastPairs / roleOf → scripts/directions.mjs:378, :506 (resolvePick), :613 (aliasDecls), :1007-1008 (render); scripts/directions.test.mjs:232, :241
- pick.json `contrastWarnings` → skills/create/references/directions.md Apply step 1 (shown verbatim); not read by design-system
- findProjectFont → scripts/directions.mjs:1104
