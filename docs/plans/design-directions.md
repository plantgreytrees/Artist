---
slug: design-directions
goal: create --directions names the current design concept, writes 3–5 contrasting directions from 10 fixed schools, renders an offline directions.html (final result, specimen, pick & mix), and applies the pasted pick project-wide through design-system
level: feature
priority: P2
idea: docs/ideas/design-directions.md
classification: in-scope (docs/ideas/design-directions.md:3 status architected; ARCH-DIRECTIONS-01..14 decided, docs/architecture/directions.rules.md)
tracker_rows: [design-directions#directions-core, design-directions#directions-fonts, design-directions#directions-render, design-directions#directions-skills, design-directions#directions-evals-docs]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(agent dispatch blocked by root-only scope guard); diffed against the architected idea `touches:` — web.md excluded (no rule needs it), architecture docs left to /architect --update
coverage:
  contract:      1.4, 1.7, 4.3 (new directions.json schema 1, pick.json schema 1 with rounds.json-shaped tokenDiff; read-only consumer of inventory.json schema 1 and reuse.json --all; no existing contract changes)
  data:          N/A(no database; run artefacts under <project>/.artist/directions/<UTC ts>/ only)
  config:        4.2 (opt-in `create --directions [n]`; default flow unchanged)
  security:      1.4, 1.7, 3.3, 3.4 (strict CSS-value grammar exit 2, HTML-escape every value, CSP meta, no network, inline script only switches precomputed values; pick line untrusted)
  tests:         1.1, 2.1, 3.1, 4.4, 5.1 (node --test scripts/directions.test.mjs per ARCH-DIRECTIONS-13; evals/create --directions case)
  observability: N/A(offline CLI script; exit codes 0/2 with stderr reasons)
  interface:     3.2, 3.3, 3.4, 3.5, 4.1, 4.2 (directions.html three views + light/dark, reduced-motion, reduced-transparency previews, contrast badges, live diff/impact; create step 0; design-system apply)
  docs:          4.1, 5.2, 5.3 (directions.md reference pack, README create row, CHANGELOG; architecture docs via /architect --update)
  rollback:      5.3 (revert the merges; opt-in behind --directions, no existing artefact schema changes)
units:
  - id: 1
    scope_id: directions-core
    project: "."
    depends_on: []
    module: scripts/directions.mjs (core)
    language: javascript (node ESM)
    security: high
    scope:
      read: [scripts/design-md.mjs, scripts/inventory.mjs, scripts/review-html.mjs, scripts/fixtures/inventory/DESIGN.md, scripts/fixtures/reuse.sample.json, skills/create/SKILL.md]
      docs: [docs/architecture/directions.rules.md, docs/architecture/verify.rules.md, docs/architecture/plugin.rules.md, docs/ideas/design-directions.md]
      write: [scripts/directions.mjs, scripts/directions.test.mjs, scripts/fixtures/directions/**, skills/create/references/directions.md]
    arch: [ARCH-DIRECTIONS-02, ARCH-DIRECTIONS-03, ARCH-DIRECTIONS-04, ARCH-DIRECTIONS-05, ARCH-DIRECTIONS-07, ARCH-DIRECTIONS-08, ARCH-DIRECTIONS-09, ARCH-DIRECTIONS-11, ARCH-DIRECTIONS-13, ARCH-DIRECTIONS-14, ARCH-PLUGIN-35, ARCH-VERIFY-11, ARCH-VERIFY-18, ARCH-VERIFY-23]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [test-driven-development], guards: [secrets-scan], mcp: [] }
  - id: 2
    scope_id: directions-fonts
    project: "."
    depends_on: [directions-core]
    module: scripts/assets/fonts
    language: javascript (node ESM) + binary assets
    security: normal
    network: root (downloads OFL woff2 files outside the sandbox, commands/_network.md)
    scope:
      read: [scripts/directions.mjs, scripts/directions.test.mjs]
      docs: [docs/architecture/directions.rules.md, docs/architecture/verify.rules.md]
      write: [scripts/assets/fonts/**, scripts/directions.mjs, scripts/directions.test.mjs]
    arch: [ARCH-DIRECTIONS-12, ARCH-DIRECTIONS-13, ARCH-VERIFY-10, ARCH-VERIFY-11]
    tooling: { implementer: implementer, gates: [dependency-auditor], skills: [test-driven-development], guards: [secrets-scan], mcp: [] }
  - id: 3
    scope_id: directions-render
    project: "."
    depends_on: [directions-core, directions-fonts]
    module: scripts/directions.mjs (renderer + CLI)
    language: javascript (node ESM)
    security: high
    scope:
      read: [scripts/directions.mjs, scripts/directions.test.mjs, scripts/review-html.mjs, scripts/design-md.mjs, scripts/assets/fonts/fonts.json, scripts/fixtures/directions/**]
      docs: [docs/architecture/directions.rules.md, docs/architecture/verify.rules.md, docs/architecture/plugin.rules.md]
      write: [scripts/directions.mjs, scripts/directions.test.mjs, scripts/fixtures/directions/**]
    arch: [ARCH-DIRECTIONS-06, ARCH-DIRECTIONS-07, ARCH-DIRECTIONS-08, ARCH-DIRECTIONS-09, ARCH-DIRECTIONS-11, ARCH-DIRECTIONS-12, ARCH-DIRECTIONS-13, ARCH-DIRECTIONS-14, ARCH-PLUGIN-28, ARCH-PLUGIN-35, ARCH-VERIFY-10, ARCH-VERIFY-11, ARCH-VERIFY-18]
    tooling: { implementer: implementer, gates: [security-auditor, ui-ux-reviewer], skills: [test-driven-development], guards: [secrets-scan], mcp: [] }
  - id: 4
    scope_id: directions-skills
    project: "."
    depends_on: [directions-render]
    module: skills/create + skills/design-system
    language: markdown
    security: normal
    scope:
      read: [skills/create/SKILL.md, skills/design-system/SKILL.md, skills/create/references/directions.md, skills/create/references/web.md, skills/create/references/mobile.md, skills/create/references/rubric.md, scripts/directions.mjs, scripts/directions.test.mjs]
      docs: [docs/architecture/directions.rules.md, docs/architecture/plugin.rules.md, docs/architecture/verify.rules.md, docs/ideas/design-directions.md]
      write: [skills/create/references/directions.md, skills/create/SKILL.md, skills/design-system/SKILL.md, scripts/directions.test.mjs]
    arch: [ARCH-DIRECTIONS-01, ARCH-DIRECTIONS-02, ARCH-DIRECTIONS-03, ARCH-DIRECTIONS-04, ARCH-DIRECTIONS-08, ARCH-DIRECTIONS-09, ARCH-DIRECTIONS-10, ARCH-DIRECTIONS-11, ARCH-PLUGIN-07, ARCH-PLUGIN-09, ARCH-PLUGIN-10, ARCH-PLUGIN-11, ARCH-PLUGIN-14, ARCH-PLUGIN-24, ARCH-PLUGIN-26, ARCH-PLUGIN-28, ARCH-PLUGIN-35, ARCH-PLUGIN-38, ARCH-VERIFY-18]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [], mcp: [] }
  - id: 5
    scope_id: directions-evals-docs
    project: "."
    depends_on: [directions-skills]
    module: evals/create + README + CHANGELOG
    language: markdown
    security: normal
    scope:
      read: [evals/create/prompt.md, evals/create/graders/criteria.md, evals/create/graders/skill-fired.md, README.md, CHANGELOG.md, skills/create/references/directions.md]
      docs: [docs/architecture/directions.rules.md, docs/architecture/plugin.rules.md]
      write: [evals/create/**, README.md, CHANGELOG.md]
    arch: [ARCH-DIRECTIONS-01, ARCH-DIRECTIONS-13, ARCH-PLUGIN-20]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [], mcp: [] }
---

# Plan: design directions for create

## Outcome
`create --directions` names the project's current design concept with evidence, writes Current plus 3–5 contrasting directions from the ten fixed schools (at least one ambitious), renders an offline `directions.html` with final-result, specimen and pick & mix views, and the pasted pick line resolves to `pick.json` whose `tokenDiff` `design-system` applies once to the current theme before `create` builds through its unchanged loop.

## Scope Steps (executable core)

### Step 1 — directions-core (., javascript, high)
Tooling: implementer · gates security-auditor · skills test-driven-development · guards secrets-scan
Depends on: none
- [ ] 1.1 Write failing tests in `scripts/directions.test.mjs` for SCHOOLS, schema validation, CSS grammar, contrast, resolve and impact → accept: `node --test scripts/directions.test.mjs` fails only on the missing exports
- [ ] 1.2 Add fixtures under `scripts/fixtures/directions/`: a format-2 DESIGN.md; a valid directions.json (4 directions, one ambitious); invalid variants (2 directions, duplicate school, no ambitious, Current's school reused, unknown school, missing dark value, unknown unproposed token, non-token `base` key, values containing `;` `}` `url(` `expression(`); a 3:1 contrast pair; inventory.json; a `--all` reuse.json; an inventory using an unsupported component extension → accept: fixtures contain no `http://`/`https://`
- [ ] 1.3 Export `SCHOOLS` (exactly the ten ids; `ambitious: true` on glassmorphism, retro-futurist, aurora) and write the Design schools table in `skills/create/references/directions.md` → accept: test asserts the constant equals the table ids; an unknown `school` exits 2
- [ ] 1.4 Implement `validateDirections` (schema 1; 3–5 distinct schools, none equal to Current's, ≥1 ambitious; axes palette/type/shape/motion/base map DESIGN.md token names or `proposed: true` names; colour tokens need light and dark; `base` only spacing and component tokens) and the strict CSS-value grammar. Error model: exported functions throw an `Error` carrying `exitCode: 2` and a named reason; only the CLI `main()` maps it to stderr and the exit code (as `verify.mjs` `run()` never calls `process.exit`) → accept: each invalid fixture exits 2 with a named reason
- [ ] 1.5 Implement `readCurrent(project)` through `design-md.mjs` (format 2, else exit 2); Current's values never come from directions.json → accept: a directions.json carrying Current token values is rejected; the script imports design-md.mjs
- [ ] 1.6 Implement WCAG 2.x `contrast(fg, bg)` and the pair set (text, muted text, link, accent-text on background and surface, light and dark) → accept: ratios equal reference values to 2 dp; a 3:1 pair is returned as a warning, never thrown
- [ ] 1.7 Implement `parsePickLine` and `resolvePick` → `pick.json` schema 1 (`pick`, `tokenDiff{added,removed,changed}` in the rounds.json shape, `contrastWarnings`, `impact`, `wontCarry`) → accept: tests for a valid line, an unknown id, extra keys and injected text (exit 2)
- [ ] 1.8 Implement `impactOf` joining `inventory.json` `tokensUsed`/`usage` to each changed token; absent inventory → section says so (exit 0); absent reuse.json → "not checked — run `design-system audit`"; an unsupported component format → "unsupported", never zero; `wontCarry` only from a supplied `--all` reuse.json (`raw_colours`, `raw_spacing`, `raw_motion`, `component_token_literals`) with `file:line`; a reuse.json without the `--all` keys counts as not checked → accept: impact tests pass, including a non-`--all` reuse.json

### Step 2 — directions-fonts (., javascript + assets, normal) — network, runs in root
Tooling: implementer · gates dependency-auditor · skills test-driven-development · guards secrets-scan
Depends on: directions-core
- [ ] 2.1 Write failing test: every `fonts.json` entry (family, weights, source URL, version, sha256, licence file) has its woff2 file with a matching sha256 and an OFL licence file; ≤ 2 families per school → accept: fails before the assets exist
- [ ] 2.2 Download latin-subset OFL woff2 files for the families the schools use into `scripts/assets/fonts/` with their `OFL.txt`; write `fonts.json` → accept: 2.1 passes; assets total < 2 MB
- [ ] 2.3 Map each SCHOOLS entry to its families in `directions.mjs` → accept: test asserts every school's families exist in fonts.json

### Step 3 — directions-render (., javascript, high)
Tooling: implementer · gates security-auditor, ui-ux-reviewer · skills test-driven-development · guards secrets-scan
Depends on: directions-core, directions-fonts
- [ ] 3.1 Write failing render tests: writes only `directions.html` and `fonts/` under `<project>/.artist/directions/<UTC ts>/`; two runs byte-identical (timestamp injectable); every view present; exact CSP meta; no `http:`/`https:` in src, href or url(); fonts referenced only under `fonts/` → accept: fail before the renderer exists
- [ ] 3.2 Render the fixed sample screen (sign-in form plus a small dashboard: nav, card, list, badges, primary and secondary buttons) defined in the script, styled only through CSS variables, for Current and every direction → accept: no input path accepts HTML
- [ ] 3.3 Render the final-result view (side-by-side grid and one-at-a-time) and the specimen view (swatches, type ramp, spacing/radius/elevation, motion samples; cells differing from Current highlighted), HTML-escaping every value → accept: a `<script>` in a brief renders escaped
- [ ] 3.4 Render pick & mix: base selector, then palette, type, shape and motion from any direction; live preview beside Current; light/dark switch; reduced-motion and reduced-transparency preview toggles; live token diff, impact list and contrast badges; copyable `artist-pick v1 …` line. Inline script only switches precomputed per-axis values (no `eval`, `Function`, `innerHTML` from data) → accept: test greps the script for those calls
- [ ] 3.5 Contrast badges: a pair under 4.5:1 shows a visible badge naming the pair and ratio for that direction and in the mix; rendering and picking continue → accept: the 3:1 fixture renders the badge and exits 0
- [ ] 3.6 CLI: `--directions <json> --project <dir> [--reuse <reuse.json>]` renders (inventory read from `<project>/docs/design/inventory.json`); `--resolve "<line>" --directions <json> --project <dir>` writes pick.json into the same run dir; React Native projects labelled as a web approximation; only the fonts a run uses are copied; the project's current fonts load by relative path when found through Platform notes token files, else a labelled fallback stack → accept: CLI tests for both modes, exit codes 0/2

### Step 4 — directions-skills (., markdown, normal)
Tooling: implementer
Depends on: directions-render
- [ ] 4.1 Complete `skills/create/references/directions.md`: name the current concept citing DESIGN.md rows or code `file:line`, labelled a judgement, not a score; pick 3–5 contrasting schools from the fixed ten, ≥1 ambitious, none equal to Current's; write directions in-session (no Agent/Task dispatch; the critic never scores directions); the ambitious brief carries contrast scrims, reduced-motion and reduced-transparency fallbacks and the LCP budget; run `directions.mjs`, give the page path, ask the user to paste the pick line, run `--resolve`, hand `pick.json` `tokenDiff` to design-system → accept: grep finds no Agent/Task dispatch; the schools table still matches SCHOOLS
- [ ] 4.2 Add an optional step 0 to `skills/create/SKILL.md` naming `--directions [n]` and linking directions.md only; the Loop and Stop condition sections stay byte-unchanged → accept: the diff touches neither section; `argument-hint` names `--directions`
- [ ] 4.3 Extend `skills/design-system/SKILL.md` init step 8 (apply proposed token changes): a `pick.json` `tokenDiff` is shown as one diff to the current theme (no new `data-brand` set), applied once after acceptance (ARCH-PLUGIN-38), then its `wontCarry` items are listed for tokenising → accept: only design-system SKILL.md instructs writing DESIGN.md or token files
- [ ] 4.4 Run the SCHOOLS/directions.md table test against the final reference pack → accept: `node --test scripts/directions.test.mjs` green

### Step 5 — directions-evals-docs (., markdown, normal)
Tooling: implementer
Depends on: directions-skills
- [ ] 5.1 Add a `--directions` case under `evals/create/` (prompt plus graders: current concept named with evidence; Current + 3–5 distinct schools incl. an ambitious one; runs directions.mjs; asks for the pick line; resolves it; hands tokenDiff to design-system; no agent dispatch; no DESIGN.md write outside design-system) → accept: `ls evals/create` shows the case; `claude plugin validate --strict .` passes
- [ ] 5.2 Update the README create row with `--directions` and `directions.html` → accept: README names both
- [ ] 5.3 Add one CHANGELOG `[Unreleased]` entry (opt-in; rollback by revert; no existing artefact schema changed), sequenced last → accept: one bullet; `node --test scripts/*.test.mjs` exit 0

## Sequencing
core (schema, grammar, contrast, resolve, impact) → fonts (network, root) → renderer + CLI → skills → evals/docs. The first three all edit `scripts/directions.mjs` and its test, so they run strictly in order; the skills unit needs the final CLI; docs come last.

## Verification background
- DIRECTIONS-14 preconditions met on main: `scripts/reuse-check.mjs:315` lists `component_token_literals`; the Vue inventory merged at ff5018b.
- design-system "apply proposed token changes" is init step 8, `skills/design-system/SKILL.md:34`. ARCH-DIRECTIONS-10's check says "step 7" and cites `:36`: numbering drift for `/architect --update`, not a decision change.
- create Loop and Stop condition: `skills/create/SKILL.md` sections "Loop (max 3 rounds)" and "Stop condition"; the rounds.json `tokenDiff` shape is Finish step 1.
- Parser API: `formatOf`, `tokensOf`, `componentTokensOf`, `bindTokens`, `tokenFilesOf` at `scripts/design-md.mjs:18,115,126,149,179`.
- Self-contained renderer and escaping pattern: `scripts/review-html.mjs:18-22,123`.
- inventory `tokensUsed`/`usage`: `scripts/inventory.mjs:356` (`buildInventory`).

CONSUMERS:
- directions.json (new) → scripts/directions.mjs; produced in-session per skills/create/references/directions.md
- pick.json (new) → skills/design-system/SKILL.md init step 8; skills/create/references/directions.md
- inventory.json schema 1 (unchanged, read-only) → existing consumers unchanged; plus scripts/directions.mjs
- reuse.json `--all` (unchanged, read-only) → existing consumers unchanged; plus scripts/directions.mjs
- scripts/design-md.mjs exports (unchanged) → inventory.mjs, reuse-check.mjs, design-doc.mjs; plus directions.mjs

## Risk & rollback
Opt-in behind `--directions`; the default create flow is unchanged. Fonts add OFL binary assets (< 2 MB). Pick & mix must not precompute every 5^5 combination: precompute one CSS variable block per (axis, direction) and compose by switching per-axis attributes. Revert the five merges to roll back.

## Out of scope
Rendering directions on the project's real pages (Alternative C), a council of agents, user-defined schools, cross-repo propagation, any change to verify.mjs, reuse-check.mjs, inventory.mjs or their schemas.
