---
slug: scrutinise-design-doc-uniformity
goal: design-system.html renders the real inventory, --check is safe and truthful after an audit, and every script reads DESIGN.md through design-md.mjs
level: feature
parent: design-doc-uniformity
children: []
priority: P1
idea: docs/ideas/design-doc-uniformity.md
classification: in-scope (fixes to merged design-doc-uniformity units; no decided rule changes)
tracker_rows: [scrutinise-design-doc-uniformity#design-doc-hardening, scrutinise-design-doc-uniformity#reuse-check-design-md, scrutinise-design-doc-uniformity#review-html-literals]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(decomposition fixed by the isolated /scrutinise round 1 report; every task maps to one finding)
coverage:
  contract:      2.1, 2.4, 2.5 (design-md gains tokenFilesOf; token-refs gains tokenRefsIn; reuse.json schema 3 unchanged)
  data:          N/A(no database; files only)
  config:        2.4 (Platform notes token files line parsed once)
  security:      1.3 (--check validates manifest roles and paths)
  tests:         1.1-1.6, 2.1-2.5, 3.1 (node --test per finding)
  observability: N/A(offline CLI; exit codes 0/1/2 unchanged in meaning)
  interface:     1.1, 3.1 (design-system.html inventory cells; review.html group)
  docs:          1.2 (README sentence on --check after an audit); architecture docs via /architect --update
  rollback:      N/A(revert the merges; no data or schema change)
units:
  - id: 1
    scope_id: design-doc-hardening
    project: "."
    depends_on: []
    module: scripts/design-doc.mjs
    language: javascript (node ESM)
    security: high
    scope:
      read: [scripts/design-doc.mjs, scripts/design-doc.test.mjs, scripts/design-md.mjs, scripts/inventory.mjs, README.md]
      docs: [docs/architecture/verify.rules.md, docs/architecture/plugin.rules.md]
      write: [scripts/design-doc.mjs, scripts/design-doc.test.mjs, scripts/fixtures/design-doc/**, README.md]
    arch: [ARCH-VERIFY-24, ARCH-VERIFY-22, ARCH-VERIFY-25, ARCH-PLUGIN-37, ARCH-PLUGIN-39, ARCH-PLUGIN-40]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [test-driven-development], guards: [secrets-scan], mcp: [] }
  - id: 2
    scope_id: reuse-check-design-md
    project: "."
    depends_on: []
    module: scripts/reuse-check.mjs + design-md/token-refs shared helpers
    language: javascript (node ESM)
    security: normal
    scope:
      read: [scripts/reuse-check.mjs, scripts/reuse-check.test.mjs, scripts/design-md.mjs, scripts/design-md.test.mjs, scripts/token-refs.mjs, scripts/token-refs.test.mjs, scripts/inventory.mjs, scripts/inventory.test.mjs, scripts/fixtures/reuse/**]
      docs: [docs/architecture/verify.rules.md, docs/architecture/plugin.rules.md]
      write: [scripts/reuse-check.mjs, scripts/reuse-check.test.mjs, scripts/design-md.mjs, scripts/design-md.test.mjs, scripts/token-refs.mjs, scripts/token-refs.test.mjs, scripts/inventory.mjs, scripts/inventory.test.mjs, scripts/fixtures/reuse/**]
    arch: [ARCH-VERIFY-25, ARCH-VERIFY-22, ARCH-VERIFY-23, ARCH-VERIFY-26, ARCH-PLUGIN-35, ARCH-PLUGIN-38]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 3
    scope_id: review-html-literals
    project: "."
    depends_on: []
    module: scripts/review-html.mjs
    language: javascript (node ESM)
    security: normal
    scope:
      read: [scripts/review-html.mjs, scripts/review-html.test.mjs, scripts/fixtures/reuse/reuse.sample3.json]
      docs: [docs/architecture/verify.rules.md]
      write: [scripts/review-html.mjs, scripts/review-html.test.mjs]
    arch: [ARCH-VERIFY-17, ARCH-VERIFY-22]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
---

# Plan: scrutinise-design-doc-uniformity — round 1 fixes

## Outcome
Close the /scrutinise round 1 findings on design-doc-uniformity (main at 1c5a5eb): 0 Critical, 4 Warning (one Architecture), 9 Suggestion, 20/20 criteria MET, none disputed. Tests first in every unit.

## Rolling summary
- Round 1 (isolated scrutineer, ranges ebc68cc, 691a55f, 6435189, 5dba627, 92d0650, d50633f, 1d268e4, 1c5a5eb): Warnings in design-doc.mjs (inventory props, `--check` after audit, manifest path trust) and reuse-check.mjs (own DESIGN.md parser, ARCH-VERIFY-25). Suggestions grouped into the same units.

## Step 1 — design-doc-hardening (., javascript, high)
Tooling: implementer · gate security-auditor · TDD
- [ ] 1.1 [Warning] `scripts/design-doc.mjs:95-98` renders inventory `props` (objects `{name,type,optional}` from `scripts/inventory.mjs:96`, `:260`) as `[object Object]` and drops `variants`. Render object array items by `name`, `variants` as `prop: a|b` → accept: test with object props and variants shows names and `size: sm|lg`, never `[object Object]`
- [ ] 1.2 [Warning] Resolve `--reuse` against `--project` (not cwd) and drop the dead ternary at `:206`; in `--check`, a missing `reuse` input exits 2 with `reuse input <path> absent; rerun audit to re-verify` (a missing design or inventory input stays stale = 1); add one README sentence saying so → accept: tests for cwd-independent manifest path and exit 2 on absent reuse input; README mentions it
- [ ] 1.3 [Warning][Security] `--check` trusts manifest role and path (`:192` readEntry, `:248`). Allow roles only `design|inventory|reuse`; `design` ∈ {`DESIGN.md`, `docs/design/DESIGN.md`}; `inventory` = `docs/design/inventory.json`; reject absolute paths and any path whose `relative(project, abs)` starts with `..`; `lstat` and require a regular file; violations exit 2 → accept: tests for unknown role, absolute path, `../` path and non-regular file each exit 2 without reading
- [ ] 1.4 [Suggestion] `:82` require a `supersedes` id to name an earlier row (append-only, ARCH-PLUGIN-39); forward reference or cycle exits 2 → accept: test
- [ ] 1.5 [Suggestion] `:115` reject a ratio whose `conforming + justified + unjustified !== total` (ARCH-VERIFY-22) with exit 2 → accept: test
- [ ] 1.6 [Test-coverage] hostile strings in inventory.json keys/values and reuse.json category keys are escaped → accept: test asserts no raw `<script`/`javascript:` in output

## Step 2 — reuse-check-design-md (., javascript, normal)
Tooling: implementer · TDD
- [ ] 2.1 [Warning][Architecture] Replace `scripts/reuse-check.mjs:11-32` `sections()` (used `:206`) with `tableOf` from `scripts/design-md.mjs`, reading Components/Layouts/Packages by `name`/`path` and Spacing/Motion by `value` (ARCH-VERIFY-25) → accept: no `function sections` in reuse-check; existing reuse-check tests pass unchanged in intent; new tests for a fenced `## Spacing` and reordered columns
- [ ] 2.2 [Suggestion] `:234` count Component tokens variables as token references (ARCH-PLUGIN-35): add Component tokens rows to `varCat` with the category of the token their `semantic` names → accept: test where `var(--chip-bg)` aliasing a colour token counts as `conforming` in `ratios.colours`
- [ ] 2.3 [Suggestion] `:396`, `:429` justify `component_tokens` and `component_api` items by `name` only, not `file` → accept: test where a file-path justification does not justify `<Component>.<prop>`
- [ ] 2.4 [Suggestion][Cross-unit] Export pure `tokenFilesOf(md)` from design-md.mjs and use it in `scripts/inventory.mjs:737` and reuse-check `tokenFiles()` (`:82`); callers keep file-system expansion → accept: design-md test covers `token files`, `theme files`, `**token files**:`; one parser in scripts/
- [ ] 2.5 [Suggestion][Cross-unit] Move the shared logic of `inventory.mjs:146` `tokensIn` and `reuse-check.mjs:177` `varRefs` into pure `tokenRefsIn(content, ctx)` in token-refs.mjs; both import it → accept: token-refs test; inventory and reuse-check tests pass unchanged in intent; token-refs stays free of `node:fs`/`child_process`

## Step 3 — review-html-literals (., javascript, normal)
Tooling: implementer · TDD
- [ ] 3.1 [Suggestion][Cross-unit] `scripts/review-html.mjs:64-74` add `["Component token literals", "component_token_literals"]`, shown only when the key is present, so the listed unjustified items match the count → accept: `scripts/review-html.test.mjs` schema-3 test lists the literal item and default-mode output is unchanged

## Sequencing
All three units are independent. Whole-plan: `node --test scripts/*.test.mjs` exits 0 on the merged result. No CHANGELOG task: the `[Unreleased]` design-depth bullet already covers this unreleased feature.

## Verification background
CONSUMERS:
- `design-doc.mjs` CLI (`--reuse`, `--check`) → skills/design-system/SKILL.md init step 9 and audit step 4 (paths unchanged; behaviour on absent reuse input documented in README)
- `scripts/design-md.mjs` exports (+`tokenFilesOf`) → scripts/inventory.mjs, scripts/reuse-check.mjs, scripts/token-refs.mjs, scripts/design-doc.mjs
- `scripts/token-refs.mjs` exports (+`tokenRefsIn`) → scripts/inventory.mjs, scripts/reuse-check.mjs, scripts/design-doc.mjs (ARCH-VERIFY-25 direction design-md ← token-refs ← inventory ← reuse-check preserved)
- `reuse.json` schema 3 (unchanged shape) → scripts/review-html.mjs, scripts/design-doc.mjs, skills/design-system/SKILL.md audit step 3

Disputed: none. Residual risks noted by the scrutineer and not planned (by rule wording or out of scope): line-ending rewrites affecting byte-identical `--check`; `--check` recomputes only the manifest's inputs (ARCH-VERIFY-24 "same set"); token-refs heuristics proven only on fixtures.
