---
slug: design-doc-uniformity
goal: design-system init and audit produce a variables-first DESIGN.md (Component tokens, Decisions), a deterministic design-system.html, and per-category uniformity ratios from the scripts only
level: feature
priority: P1
idea: docs/ideas/design-doc-uniformity.md
classification: in-scope (docs/ideas/design-doc-uniformity.md:3 status architected; rules ARCH-PLUGIN-35..41, ARCH-VERIFY-17,18,22..27 decided)
tracker_rows: [design-doc-uniformity#design-md, design-doc-uniformity#design-doc, design-doc-uniformity#token-refs, design-doc-uniformity#inventory-tokens, design-doc-uniformity#skill-html, design-doc-uniformity#reuse-ratios, design-doc-uniformity#skills-ratios, design-doc-uniformity#docs-release]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(decomposition fixed by the architected idea and the user's slice order)
coverage:
  contract:      1.2, 3.3, 4.2, 6.2 (DESIGN.md gains Component tokens + Decisions; design-md.mjs owns parsing; tokensUsed semantics; reuse.json schema 3)
  data:          N/A(no database; files only)
  config:        5.1, 5.2 (Platform notes token files name the Tailwind v4 @theme file; tokens.css/@theme diff step)
  security:      2.1, 2.2 (escape every field, allowlisted swatches, CSP meta, no script, no network; scripts never execute project files)
  tests:         1.1, 2.1, 3.2, 4.1, 6.1 (node --test per rule check:)
  observability: N/A(offline CLI scripts; exit codes 0/1/2 already defined; --check exits 0/1/2)
  interface:     2.2, 5.2, 7.1 (design-system.html; skills init/audit steps; consistency.md four numbers)
  docs:          5.1, 7.2, 8.1, 8.2 (template, SKILL.md, README Theming + consistency, CHANGELOG; architecture docs via /architect --update)
  rollback:      8.3 (revert merges; Decisions/Component tokens are optional sections; schema-3 keys appear only with --all)
units:
  - id: 1
    scope_id: design-md
    project: "."
    depends_on: []
    module: scripts/design-md.mjs
    language: javascript (node ESM)
    security: normal
    scope:
      read: [scripts/inventory.mjs, scripts/reuse-check.mjs, scripts/inventory.test.mjs, scripts/fixtures/inventory/DESIGN.md]
      docs: [docs/architecture/verify.rules.md]
      write: [scripts/design-md.mjs, scripts/design-md.test.mjs, scripts/inventory.mjs, scripts/reuse-check.mjs]
    arch: [ARCH-VERIFY-25, ARCH-VERIFY-11]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 2
    scope_id: design-doc
    project: "."
    depends_on: [design-md]
    module: scripts/design-doc.mjs
    language: javascript (node ESM)
    security: high
    scope:
      read: [scripts/design-md.mjs, scripts/review-html.mjs, scripts/fixtures/inventory/DESIGN.md]
      docs: [docs/architecture/verify.rules.md, docs/architecture/plugin.rules.md]
      write: [scripts/design-doc.mjs, scripts/design-doc.test.mjs, scripts/fixtures/design-doc/**]
    arch: [ARCH-VERIFY-24, ARCH-VERIFY-25, ARCH-VERIFY-10, ARCH-VERIFY-11, ARCH-PLUGIN-37, ARCH-PLUGIN-39]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [test-driven-development], guards: [secrets-scan], mcp: [] }
  - id: 3
    scope_id: token-refs
    project: "."
    depends_on: [design-md]
    module: scripts/token-refs.mjs
    language: javascript (node ESM)
    security: normal
    scope:
      read: [scripts/design-md.mjs, scripts/inventory.mjs]
      docs: [docs/architecture/verify.rules.md]
      write: [scripts/token-refs.mjs, scripts/token-refs.test.mjs, scripts/design-md.mjs, scripts/design-md.test.mjs]
    arch: [ARCH-VERIFY-25, ARCH-VERIFY-26, ARCH-VERIFY-27, ARCH-VERIFY-11]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 4
    scope_id: inventory-tokens
    project: "."
    depends_on: [token-refs]
    module: scripts/inventory.mjs
    language: javascript (node ESM)
    security: normal
    scope:
      read: [scripts/token-refs.mjs, scripts/design-md.mjs, scripts/inventory.test.mjs, scripts/fixtures/inventory/**]
      docs: [docs/architecture/verify.rules.md]
      write: [scripts/inventory.mjs, scripts/inventory.test.mjs, scripts/fixtures/inventory/**]
    arch: [ARCH-VERIFY-23, ARCH-VERIFY-25, ARCH-VERIFY-26, ARCH-VERIFY-11]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 5
    scope_id: skill-html
    project: "."
    depends_on: [design-doc]
    module: skills/design-system + template + evals (slice 1)
    language: markdown
    security: normal
    scope:
      read: [skills/design-system/SKILL.md, skills/design-system/references/design-template.md, skills/create/references/web.md, evals/design-system/prompt.md, evals/design-system/graders/criteria.md]
      docs: [docs/architecture/plugin.rules.md]
      write: [skills/design-system/SKILL.md, skills/design-system/references/design-template.md, skills/create/references/web.md, evals/design-system/prompt.md, evals/design-system/graders/criteria.md]
    arch: [ARCH-PLUGIN-35, ARCH-PLUGIN-36, ARCH-PLUGIN-37, ARCH-PLUGIN-38, ARCH-PLUGIN-39, ARCH-PLUGIN-41, ARCH-PLUGIN-14, ARCH-PLUGIN-07, ARCH-PLUGIN-08, ARCH-PLUGIN-20]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [], mcp: [] }
  - id: 6
    scope_id: reuse-ratios
    project: "."
    depends_on: [inventory-tokens]
    module: scripts/reuse-check.mjs (schema 3)
    language: javascript (node ESM)
    security: normal
    scope:
      read: [scripts/reuse-check.test.mjs, scripts/inventory.mjs, scripts/token-refs.mjs, scripts/design-md.mjs, scripts/fixtures/reuse/**, scripts/fixtures/audit/**, scripts/review-html.mjs, scripts/review-html.test.mjs]
      docs: [docs/architecture/verify.rules.md]
      write: [scripts/reuse-check.mjs, scripts/reuse-check.test.mjs, scripts/fixtures/reuse/**, scripts/fixtures/audit/**, scripts/fixtures/reuse.sample.json, scripts/review-html.test.mjs]
    arch: [ARCH-VERIFY-22, ARCH-VERIFY-18, ARCH-VERIFY-25, ARCH-VERIFY-11]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 7
    scope_id: skills-ratios
    project: "."
    depends_on: [reuse-ratios, skill-html]
    module: skills design-system audit + create/optimise + references (slices 2-3)
    language: markdown
    security: normal
    scope:
      read: [skills/design-system/SKILL.md, skills/create/SKILL.md, skills/optimise/SKILL.md, skills/create/references/web.md, skills/create/references/mobile.md, skills/design-system/references/design-template.md]
      docs: [docs/architecture/plugin.rules.md, docs/architecture/verify.rules.md]
      write: [skills/design-system/SKILL.md, skills/design-system/references/design-template.md, skills/create/SKILL.md, skills/optimise/SKILL.md, skills/create/references/web.md, skills/create/references/mobile.md, evals/design-system/graders/criteria.md]
    arch: [ARCH-PLUGIN-36, ARCH-PLUGIN-40, ARCH-PLUGIN-26, ARCH-PLUGIN-24, ARCH-PLUGIN-41, ARCH-PLUGIN-38, ARCH-PLUGIN-08, ARCH-VERIFY-18]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [], mcp: [] }
  - id: 8
    scope_id: docs-release
    project: "."
    depends_on: [skills-ratios]
    module: README + CHANGELOG
    language: markdown
    security: normal
    scope:
      read: [README.md, CHANGELOG.md]
      docs: [docs/architecture/plugin.rules.md]
      write: [README.md, CHANGELOG.md]
    arch: [ARCH-PLUGIN-21, ARCH-PLUGIN-41, ARCH-PLUGIN-40]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [], mcp: [] }
---

# Plan: Variables-first design system, HTML design doc, uniformity ratios

## Outcome
`design-system init` writes a format-2 DESIGN.md with optional Component tokens and confirmed Decisions plus a deterministic `docs/design/design-system.html`; `audit` reports per-category `{conforming, justified, unjustified, total}` ratios (reuse.json schema 3) and refreshes the HTML, with every number from the scripts.

Slice order (user): 1) HTML + Decisions (units 1, 2, 5); 2) variables-first tokens + detection (3, 4); 3) ratios (6, 7). Deviation noted: `design-md.mjs` is created in slice 1 because `design-doc.mjs` must import it (ARCH-VERIFY-25 dependency direction); slice 2 extends it (token binding).

## Scope Steps (executable core)

### Step 1 — design-md (., javascript, normal)
Tooling: implementer implementer · skills test-driven-development
Depends on: none
- [ ] 1.1 Write failing `scripts/design-md.test.mjs`: `formatOf`, frontmatter parse, table parse by header name (`##` only, `###` tolerated, column reordering, both Themes shapes), Component tokens and Decisions tables → accept: tests fail (module missing) before 1.2
- [ ] 1.2 Create `scripts/design-md.mjs` (pure: no `node:fs`/`child_process`, builtins only) exporting `formatOf`, frontmatter, section and table parsers, plus accessors for tokens, Component tokens and Decisions → accept: `node --test scripts/design-md.test.mjs` exit 0; `grep -E "node:fs|child_process" scripts/design-md.mjs` empty
- [ ] 1.3 Replace `formatOf` in `scripts/inventory.mjs` with a re-export from design-md; `reuse-check.mjs` keeps working through it → accept: `node --test scripts/*.test.mjs` exit 0

### Step 2 — design-doc (., javascript, high)
Tooling: implementer implementer · gates security-auditor · skills test-driven-development · guards secrets-scan
Depends on: design-md
- [ ] 2.1 Write failing `scripts/design-doc.test.mjs`: hostile-names fixture (`<script>`, `javascript:`, `url(` in every column), idempotence (identical bytes), no `http` in src/href, swatch allowlist rejection, no `/<script/i`, CSP meta exact, duplicate Decisions id → exit 2, unresolved `supersedes` → exit 2, format 1 → exit 2, `--check` exits 0/1/2, `--reuse` renders four numbers per category, no total score → accept: red before 2.2
- [ ] 2.2 Create `scripts/design-doc.mjs`: reads DESIGN.md, optional `inventory.json`, optional `--reuse`; imports design-md (and token-refs only if needed), never reuse-check; writes only `docs/design/design-system.html`; no timestamps; manifest of inputs (paths + sha256) and renderer version; `--check` recomputes over the manifest set → accept: `node --test scripts/design-doc.test.mjs` exit 0
- [ ] 2.3 Add fixtures `scripts/fixtures/design-doc/**` (clean, hostile, duplicate-decisions) → accept: used by 2.1; `grep -n "reuse-check" scripts/design-doc.mjs` empty

### Step 3 — token-refs (., javascript, normal)
Tooling: implementer implementer · skills test-driven-development
Depends on: design-md
- [ ] 3.1 Extend `scripts/design-md.mjs` with token binding per ARCH-VERIFY-26 (semantic → `variable`; Type/Spacing/Motion → `variable` column else `--`+name with `.`→`-`; ratio category from value shape, name prefix as tie-break; `--spacing` base read statically from declared token-file text) → accept: new cases in `scripts/design-md.test.mjs` pass
- [ ] 3.2 Write failing `scripts/token-refs.test.mjs`: `supports-[display:grid]:bg-brand`, `md:hover:bg-brand/80!`, `-m-4`, `bg-(--x)`, `text-foo` (`ambiguous`), unknown (`unknown`), `p-4` with default and custom `--spacing: 4px`, `data-[size=large]:`, `bg-[#fff]` literal → accept: red before 3.3
- [ ] 3.3 Create `scripts/token-refs.mjs` (pure, builtins only) implementing the ARCH-VERIFY-27 tokenizer, namespace map and `off_token_classes` reasons → accept: `node --test scripts/token-refs.test.mjs` exit 0; grep `node:fs|child_process` empty

### Step 4 — inventory-tokens (., javascript, normal)
Tooling: implementer implementer · skills test-driven-development
Depends on: token-refs
- [ ] 4.1 Write failing inventory tests: Tailwind-utility fixture (`Button` with `bg-brand px-4` → `tokensUsed` lists bound variables), RN `theme.colors.x` member chain exact-matching a Semantic name, `Deprecate <Name>` Decisions row deprecates, "X is deprecated in favour of Y" prose deprecates neither, JSDoc `@deprecated` still works, `token files` read as text only, `inventory.json` stays `schema: 1` → accept: red before 4.2
- [ ] 4.2 Update `scripts/inventory.mjs`: `tokensUsed` via `token-refs.mjs` plus CSS `var()` normalised to the bound variable; remove the prose scan (`inventory.mjs:90`); deprecation from JSDoc or Decisions row; Component tokens and Decisions outside the markers preserved → accept: `node --test scripts/inventory.test.mjs` exit 0
- [ ] 4.3 Add a Tailwind v4 fixture under `scripts/fixtures/inventory/**` (`@theme` file plus a variant-bearing Button) → accept: used by 4.1; existing reuse-check tests still pass

### Step 5 — skill-html (., markdown, normal)
Tooling: implementer implementer
Depends on: design-doc
- [ ] 5.1 Update `skills/design-system/references/design-template.md`: optional `variable` column on Type/Spacing/Motion, `## Component tokens` and `## Decisions` outside the markers (ARCH-PLUGIN-35), Platform notes naming the Tailwind v4 `@theme` file, no `tailwind.config.js` example → accept: `grep tailwind.config` on the file empty; headers match ARCH-PLUGIN-35 verbatim
- [ ] 5.2 Update `skills/design-system/SKILL.md` init: sources list v4 `@theme` only (a v3 config → say it is not parsed, propose `@theme`), token-file diff applied only after the user accepts (`tokens.css`, `@theme static` for semantic tokens, `--bs-*`), propose Decisions with `file:line` evidence and write only confirmed ones, migrate prose deprecations to `Deprecate <Name>` rows, run `inventory.mjs` then `design-doc.mjs` once → accept: SKILL.md ≤ 500 lines; design-doc named once in init
- [ ] 5.3 Update `skills/create/references/web.md` to Tailwind v4 CSS-first only (`@theme`, `@theme inline`/`static`, `bg-(--var)`) → accept: `grep -rn "tailwind.config\|theme.extend" skills evals` finds only "unsupported" notes
- [ ] 5.4 Update `evals/design-system/prompt.md` to a v4 `@theme` fixture and `graders/criteria.md` (design-system.html written, Decisions proposed not invented) → accept: grep as 5.3; `claude plugin validate --strict .` exit 0

### Step 6 — reuse-ratios (., javascript, normal)
Tooling: implementer implementer · skills test-driven-development
Depends on: inventory-tokens
- [ ] 6.1 Write failing tests: `schema: 3`; default mode has none of the `--all` keys; with `--all` `ratios{colours,spacing,motion,reduced_motion,component_tokens,component_api}` each `{conforming,justified,unjustified,total}` with the sum invariant per category; a justification never moves an item to `conforming`; a variant-bearing component without a block is `unjustified`; a literal in a Component tokens cell → `component_token_literals`; `component_api` tie-break by smallest joined set; `<Component>.<prop>` key collision vs `new_components`; `off_token_classes` and `prop_synonyms` advisory and uncounted; `docs/design/**` never scanned; breakpoints exempt → accept: red before 6.2
- [ ] 6.2 Update `scripts/reuse-check.mjs` to schema 3 per ARCH-VERIFY-22 (schema-2 arrays and rules unchanged; ratios only with `--all`; consumes design-md/token-refs/inventory, never design-doc) → accept: `node --test scripts/reuse-check.test.mjs` exit 0
- [ ] 6.3 Update fixtures and add a schema-3 sample so `review-html.mjs` renders schema 2 and 3 reuse.json unchanged → accept: `node --test scripts/review-html.test.mjs` exit 0

### Step 7 — skills-ratios (., markdown, normal)
Tooling: implementer implementer
Depends on: reuse-ratios, skill-html
- [ ] 7.1 Update `skills/design-system/SKILL.md` audit: `inventory.mjs`, `reuse-check.mjs --all`, write `consistency.md` with per-category findings (`file:line` + fix) and the four numbers copied from `reuse.json`, then `design-doc.mjs --reuse .artist/audit/reuse.json` once; no skill-computed figures; advisory lists shown separately → accept: step order matches ARCH-PLUGIN-36; no blended or total score text
- [ ] 7.2 Update `skills/create/SKILL.md`, `skills/optimise/SKILL.md`, `references/web.md`, `references/mobile.md` to variables-first (alias component tokens, Tailwind v4 variable-backed utilities, RN theme keys, breakpoints literal), leaving the ARCH-PLUGIN-24 stop condition and critic brief unchanged → accept: `git diff` shows no change to the stop-condition and critic-brief text; each SKILL.md ≤ 500 lines
- [ ] 7.3 Update `evals/design-system/graders/criteria.md` for the audit ratios and four-number consistency.md → accept: `claude plugin validate --strict .` exit 0

### Step 8 — docs-release (., markdown, normal)
Tooling: implementer implementer
Depends on: skills-ratios
- [ ] 8.1 Update README "Theming" and "Keeping the design consistent": design-system.html, Decisions, Component tokens, Tailwind v4 only, ratios per category (no total) → accept: grep `tailwind.config` outside an unsupported note empty
- [ ] 8.2 Edit the existing `## [Unreleased]` design-depth bullet in CHANGELOG.md to cover the HTML doc, Decisions, variables-first tier and ratios (one entry per feature area) → accept: no new bullet appended; Unreleased mentions all four
- [ ] 8.3 Add a one-line rollback note (revert merges; new sections optional; schema-3 keys only with `--all`) → accept: present in CHANGELOG Unreleased or README

## Sequencing
design-md → {design-doc, token-refs} → inventory-tokens → reuse-ratios; skill-html after design-doc; skills-ratios after both slices; docs-release last. Tests first in every script unit.

## Verification background
- design-doc imports design-md only; direction design-md ← token-refs ← inventory ← reuse-check — `docs/architecture/verify.rules.md:35`
- Prose deprecation scan to remove — `scripts/inventory.mjs:84-90`; var()-only tokensUsed — `scripts/inventory.mjs:164`
- Schema-2 consumers: `scripts/review-html.mjs:14-48` read `reuse.json`; create/optimise run default mode (no `--all` keys) — `skills/create/SKILL.md:49-51`
- DESIGN.md parsers ignore unknown sections — `scripts/reuse-check.mjs:9-23`
- v3 `tailwind.config` mentions to remove — `skills/design-system/SKILL.md:15`, `skills/design-system/references/design-template.md`, `evals/design-system/prompt.md` (ARCH-PLUGIN-41)

CONSUMERS:
- `formatOf` (inventory.mjs:28) → reuse-check.mjs:7, inventory.test.mjs
- `inventory.json` schema 1 / `tokensUsed` → reuse-check.mjs (buildInventory), design-doc.mjs (new)
- `reuse.json` schema 2→3 → review-html.mjs:14,39-48, skills create/optimise/design-system, design-doc.mjs `--reuse`
- DESIGN.md sections → inventory.mjs, reuse-check.mjs, design-doc.mjs, craftsman ui-ux-reviewer (reads format; unknown sections ignored)

## Risk & rollback
Stored XSS if a field skips escaping (security-auditor gate on unit 2); the first audit flags more code; ratios invite Goodhart pressure (ARCH-PLUGIN-40 keeps them out of the loop). Revert each unit merge; the new DESIGN.md sections are optional.

## Out of scope
Live-tweak panel (ARCH-PLUGIN-37), Tailwind v3 config parsing, a blended score, `docs/architecture/*` edits (owned by /architect --update), craftsman changes.
