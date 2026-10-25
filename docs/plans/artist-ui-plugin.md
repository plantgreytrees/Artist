---
slug: artist-ui-plugin
goal: Ship the artist plugin, which designs, builds, measures and refines UI until it meets a scored quality bar, plus the small craftsman change that lets both share one DESIGN.md
level: feature
priority: P1
idea: docs/ideas/artist-ui-plugin.md
classification: in-scope (docs/ideas/artist-ui-plugin.md:3 status architected; owner "Please build it", 2026-10-25)
tracker_rows: [artist-ui-plugin#scaffold, artist-ui-plugin#verify-tests, artist-ui-plugin#verify-impl, artist-ui-plugin#review-html, artist-ui-plugin#skills-core, artist-ui-plugin#skill-create, artist-ui-plugin#evals-readme, artist-ui-plugin#craftsman-seam, artist-ui-plugin#integration]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: pending
coverage:
  contract:      2.1, 3.1, 5.3, 8.1, 8.2 (report.json schema 1 and verify CLI exit codes are the only internal contract; DESIGN.md format 1 is read by craftsman ui-ux-reviewer + design-review)
  data:          N/A(no database; files only: .artist/runs/<ts>/ and docs/design/DESIGN.md in target projects)
  config:        1.1, 1.3, 8.3 (plugin.json, .mcp.json flags, craftsman execution.builtinAgents documented)
  security:      2.1, 3.1, 1.3, 5.1, 6.3 (loopback-only URL guard, telemetry off, pinned deps, untrusted-content sentence, read-only critic)
  tests:         2.1, 2.2, 4.2, 7.1, 8.4, 9.1, 9.2
  observability: 3.1 (report.json is the structured record of every run; cwv.unstable flag)
  interface:     4.1, 5.1-5.3, 6.1 (four skills = CLI surface; review.html = visual surface, offline, keyboard-operable slider)
  docs:          7.2, 8.3, 8.5, 9.3
  rollback:      9.4 (artist: uninstall plugin / revert merge; craftsman: revert one commit, 3 files + CHANGELOG)
units:
  - id: 1
    scope_id: scaffold
    project: artist
    depends_on: []
    module: plugin manifests + script deps
    language: json
    security: normal
    scope:
      read: []
      docs: [docs/architecture/plugin.rules.md, docs/architecture/verify.rules.md]
      write: [.claude-plugin/plugin.json, .claude-plugin/marketplace.json, .mcp.json, scripts/package.json, scripts/package-lock.json, .gitignore]
    arch: [ARCH-PLUGIN-03, ARCH-PLUGIN-04, ARCH-PLUGIN-05, ARCH-PLUGIN-06, ARCH-PLUGIN-19, ARCH-VERIFY-05]
    tooling: { implementer: implementer, gates: [dependency-auditor], skills: [], guards: [secrets-scan], mcp: [] }
  - id: 2
    scope_id: verify-tests
    project: artist
    depends_on: [scaffold]
    module: scripts (tests first)
    language: javascript (node ESM)
    security: high
    scope:
      read: [scripts/package.json]
      docs: [docs/architecture/verify.rules.md]
      write: [scripts/verify.test.mjs, scripts/fixtures/clean.html, scripts/fixtures/axe-violation.html]
    arch: [ARCH-VERIFY-02, ARCH-VERIFY-03, ARCH-VERIFY-04, ARCH-VERIFY-06, ARCH-VERIFY-07, ARCH-VERIFY-08, ARCH-VERIFY-11]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 3
    scope_id: verify-impl
    project: artist
    depends_on: [verify-tests]
    module: scripts/verify.mjs
    language: javascript (node ESM)
    security: high
    scope:
      read: [scripts/verify.test.mjs, scripts/fixtures/clean.html, scripts/fixtures/axe-violation.html, scripts/package.json]
      docs: [docs/architecture/verify.rules.md]
      write: [scripts/verify.mjs, scripts/verify.test.mjs]
    arch: [ARCH-VERIFY-01, ARCH-VERIFY-02, ARCH-VERIFY-03, ARCH-VERIFY-04, ARCH-VERIFY-05, ARCH-VERIFY-06, ARCH-VERIFY-07, ARCH-VERIFY-08, ARCH-VERIFY-11]
    tooling: { implementer: implementer, gates: [security-auditor, performance-reviewer], skills: [test-driven-development, systematic-debugging], guards: [], mcp: [] }
  - id: 4
    scope_id: review-html
    project: artist
    depends_on: [verify-tests]
    module: scripts/review-html.mjs
    language: javascript (node ESM)
    security: normal
    scope:
      read: [scripts/verify.test.mjs]
      docs: [docs/architecture/verify.rules.md]
      write: [scripts/review-html.mjs, scripts/review-html.test.mjs, scripts/fixtures/report.sample.json]
    arch: [ARCH-VERIFY-02, ARCH-VERIFY-09, ARCH-VERIFY-10, ARCH-VERIFY-11]
    tooling: { implementer: implementer, gates: [ui-ux-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 5
    scope_id: skills-core
    project: artist
    depends_on: [verify-impl]
    module: skills/design-system, skills/verify, skills/optimise
    language: markdown
    security: normal
    scope:
      read: [scripts/verify.mjs]
      docs: [docs/architecture/plugin.rules.md, docs/architecture/verify.rules.md]
      write: [skills/design-system/SKILL.md, skills/design-system/references/design-template.md, skills/verify/SKILL.md, skills/optimise/SKILL.md]
    arch: [ARCH-PLUGIN-07, ARCH-PLUGIN-08, ARCH-PLUGIN-14, ARCH-PLUGIN-15, ARCH-PLUGIN-17, ARCH-PLUGIN-18, ARCH-VERIFY-01]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [], mcp: [] }
  - id: 6
    scope_id: skill-create
    project: artist
    depends_on: [verify-impl, review-html]
    module: skills/create + agents/design-critic
    language: markdown
    security: normal
    scope:
      read: [scripts/verify.mjs, scripts/review-html.mjs]
      docs: [docs/architecture/plugin.rules.md]
      write: [skills/create/SKILL.md, skills/create/references/rubric.md, skills/create/references/web.md, skills/create/references/mobile.md, agents/design-critic.md]
    arch: [ARCH-PLUGIN-07, ARCH-PLUGIN-08, ARCH-PLUGIN-09, ARCH-PLUGIN-10, ARCH-PLUGIN-11, ARCH-PLUGIN-12, ARCH-PLUGIN-13, ARCH-PLUGIN-16, ARCH-PLUGIN-17]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [], mcp: [] }
  - id: 7
    scope_id: evals-readme
    project: artist
    depends_on: [skills-core, skill-create]
    module: evals + README
    language: markdown/json
    security: normal
    scope:
      read: [skills/design-system/SKILL.md, skills/create/SKILL.md, skills/verify/SKILL.md, skills/optimise/SKILL.md, .mcp.json]
      docs: [docs/architecture/plugin.rules.md]
      write: [evals/design-system.json, evals/create.json, evals/verify.json, evals/optimise.json, README.md]
    arch: [ARCH-PLUGIN-01, ARCH-PLUGIN-02, ARCH-PLUGIN-20, ARCH-PLUGIN-21]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [], mcp: [] }
  - id: 8
    scope_id: craftsman-seam
    project: craftsman
    depends_on: []
    module: agents/ui-ux-reviewer.md, skills/design-review, EXTENDING.md
    language: markdown
    security: normal
    scope:
      read: [scripts/doc-size-policy.mjs, scripts/wiring.test.mjs]
      docs: [docs/architecture/slim.rules.md]
      write: [agents/ui-ux-reviewer.md, skills/design-review/SKILL.md, EXTENDING.md, CHANGELOG.md]
    arch: [ARCH-SLIM-01, ARCH-SLIM-02, ARCH-SLIM-06, ARCH-SLIM-08]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [doc-size-policy], mcp: [] }
  - id: 9
    scope_id: integration
    project: artist
    depends_on: [scaffold, verify-impl, review-html, skills-core, skill-create, evals-readme, craftsman-seam]
    module: whole plugin
    language: mixed
    security: normal
    scope:
      read: [.claude-plugin/plugin.json, .mcp.json, scripts/verify.mjs, scripts/review-html.mjs]
      docs: [docs/architecture/plugin.rules.md, docs/architecture/verify.rules.md]
      write: [CHANGELOG.md]
    arch: [ARCH-PLUGIN-20, ARCH-VERIFY-08]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [verification-before-completion], guards: [secrets-scan], mcp: [] }
---

# Plan: Build the artist UI plugin

## Outcome
The artist plugin is installable from its own marketplace. It can record a design system, build UI, measure it (screenshots at three widths, axe, LCP/CLS), have an isolated critic score it, refine for up to three rounds, and write an offline `review.html`. craftsman's UI reviewer reads the same `DESIGN.md`.

## Scope Steps (executable core)

### Step 1 — scaffold (artist, json, normal)
Tooling: implementer · gates dependency-auditor · guards secrets-scan
Depends on: none
- [ ] 1.1 Write `.claude-plugin/plugin.json`:
  - name `artist`, displayName `Artist`, version `0.1.0`
  - one-sentence description, author `{name: "Kieran"}`, license MIT, keywords
  - no `dependencies`, no `hooks`, no `commands` key

  → accept: `claude plugin validate .` passes (warnings allowed until Step 9); `grep -c craftsman .claude-plugin/plugin.json` = 0
- [ ] 1.2 Write `.claude-plugin/marketplace.json` listing exactly one plugin, `artist`, with source `./` → accept: `claude plugin validate .claude-plugin/marketplace.json` passes; one entry
- [ ] 1.3 Write `.mcp.json` with no env secrets and two servers:
  - `playwright` = `npx -y @playwright/mcp@0.0.83 --headless --isolated`
  - `chrome-devtools` = `npx -y chrome-devtools-mcp@1.12.0 --headless --isolated --no-usage-statistics`

  → accept: exactly 2 servers; every package arg ends `@<x.y.z>`; no `latest`
- [ ] 1.4 Write `scripts/package.json` (`"type": "module"`, `private: true`) with exact deps:
  - `playwright` `1.62.1` (matches cached chromium-1234)
  - `@axe-core/playwright` `4.14.0`
  - `web-vitals` `6.2.3`

  → accept: no `^`/`~` in the file
- [ ] 1.5 Generate `scripts/package-lock.json` with `npm install --package-lock-only --prefix scripts`. This is a network step: run it in root, outside the sandbox (craftsman `_network.md`) → accept: the lockfile resolves those three exact versions
- [ ] 1.6 Write `.gitignore` with `node_modules/` and `.artist/` → accept: file has both lines

### Step 2 — verify-tests (artist, node ESM, high), tests first and failing
Tooling: implementer · gates security-auditor · skills test-driven-development
Depends on: scaffold
- [ ] 2.1 Write `scripts/verify.test.mjs` (node:test). It imports named exports from `./verify.mjs`: `parseArgs`, `isLoopback`, `summariseCwv`, `exitCodeFor`, `resolveDeps`, `run`. `run(opts)` returns `{exitCode, runDir, error?}` and never calls `process.exit`; `opts.launch` is injectable (defaults to Playwright's `chromium.launch`). Unit cases:
  - `parseArgs`: default breakpoints `[375,768,1280]`; `--breakpoints 320,1024` overrides them.
  - `isLoopback`: true for `localhost`, `127.0.0.1`, `127.9.9.9`, `[::1]`; false for `example.com`, `10.0.0.1`, `localhost.evil.com`.
  - `run({url:"https://example.com", launch})` without `allowRemote` → `exitCode` 2, and the injected `launch` (which throws if called) is never called.
  - `resolveDeps({CLAUDE_PLUGIN_DATA: <empty tmp dir>})` → `{ok:false, installCommand}` where the command names `npm ci --prefix`.
  - `summariseCwv`: takes injected samples `[{lcp_ms,cls}×3]` → median, `spread=(max−min)/median`, and `unstable` true when LCP spread > 0.20.
  - `exitCodeFor`: 0 when all thresholds are met; 1 when any is missed or CWV is unstable; 2 on tool error.

  → accept: `node --test scripts/verify.test.mjs` fails only on the missing `./verify.mjs` import
- [ ] 2.2 Add browser integration cases to the same file. Start `node:http` on `127.0.0.1:0` serving `scripts/fixtures/`.
  - `run()` on `clean.html` → exit 0, and `report.json` has:
    - `schema: 1`, `url`, `breakpoints`
    - `axe{critical,serious,moderate,minor,violations}`
    - `cwv{lcp_ms,cls,runs:3,spread,unstable}`
    - `screenshots{375,768,1280}`, each file present
  - `run()` on `axe-violation.html` → exit 1, and `axe.serious + axe.critical ≥ 1`.
  - Every written path is under `<tmp project>/.artist/runs/`.

  → accept: the cases exist, and they are skipped (not failed) only when `ARTIST_SKIP_BROWSER=1`
- [ ] 2.3 Write two fixtures:
  - `scripts/fixtures/clean.html`: semantic, labelled, contrast ≥ 4.5:1, no external requests.
  - `scripts/fixtures/axe-violation.html`: an unlabelled button and low-contrast text.

  → accept: neither references `http://` or `https://`

### Step 3 — verify-impl (artist, node ESM, high), make Step 2 pass
Tooling: implementer · gates security-auditor, performance-reviewer · skills test-driven-development, systematic-debugging
Depends on: verify-tests
- [ ] 3.1 Write `scripts/verify.mjs`, exporting the functions Step 2 imports plus a CLI: `node scripts/verify.mjs <url> [--breakpoints a,b,c] [--allow-remote] [--project <dir>]`. Behaviour:
  - The loopback guard runs before any browser launch, and again on the final URL after navigation (a redirect off loopback → exit 2).
  - Each page load has a 30 s timeout; the browser is closed in a `finally`.
  - The run folder is created with an exclusive `mkdir`; on `EEXIST` it appends a short suffix, so concurrent runs never share a folder.
  - One screenshot per breakpoint.
  - axe via `@axe-core/playwright`.
  - LCP/CLS: inject `web-vitals/dist/web-vitals.umd.cjs`, read `onLCP`/`onCLS` with `reportAllChanges`, over 3 fresh page loads; report the median.
  - Write `report.json` (schema 1) under `<project>/.artist/runs/<UTC-compact-timestamp>/`.
  - Catch every browser or launch error → exit 2 with a message on stderr; never exit 0 on an error.

  → accept: `node --test scripts/verify.test.mjs` passes in full, browser cases included
- [ ] 3.2 In `scripts/verify.mjs`, export `resolveDeps(env)`:
  - Resolve deps from `${CLAUDE_PLUGIN_DATA}/node_modules` when that variable is set; otherwise fall back to `scripts/node_modules`. Load them with dynamic `import()` from the resolved path.
  - When the deps are missing, return `{ok:false, installCommand}` (`npm ci --prefix "$CLAUDE_PLUGIN_DATA"`, after copying this package.json and lockfile there); the CLI prints it and exits 2.
  - Never install into the target project.

  → accept: the `resolveDeps` case in 2.1 passes

### Step 4 — review-html (artist, node ESM, normal)
Tooling: implementer · gates ui-ux-reviewer · skills test-driven-development
Depends on: verify-tests
- [ ] 4.1 Write `scripts/review-html.mjs`, exporting `renderReview({rounds:[{runDir, report, scores?, critique?, isolated?}], tokenDiff?, outDir})` → HTML string. Image paths are computed relative to `outDir`, so earlier rounds' screenshots (`../<ts>/375.png`) resolve offline. CLI, two forms:
  - `node review-html.mjs <runDir>` → one round from that folder's `report.json`; writes `<runDir>/review.html`.
  - `node review-html.mjs --rounds <rounds.json> --out <dir>` → `rounds.json` lists `{runDir, scores?, critique?, isolated?}` per round plus optional `tokenDiff`; the create skill writes it.

  Sections:
  - header: url, time, final verdict
  - per-breakpoint before/after view with a keyboard-operable, labelled range slider (only the latest round when there is no "before")
  - rubric table per round: 8 dimensions, plus a NOT ISOLATED badge when `isolated === false`
  - axe counts and top violations
  - CWV: median, spread, unstable flag
  - DESIGN.md token diff

  Use inline CSS and JS, images by relative path, and light/dark via `prefers-color-scheme` → accept: 4.2 passes
- [ ] 4.2 Write `scripts/review-html.test.mjs` and `scripts/fixtures/report.sample.json`. Check that:
  - the output has every section heading;
  - no `src=`/`href=` value starts with `http`;
  - the slider has a `<label>`;
  - violation text containing `<script>` is escaped.

  → accept: `node --test scripts/review-html.test.mjs` passes

### Step 5 — skills-core (artist, markdown, normal)
Depends on: verify-impl
- [ ] 5.1 Write `skills/design-system/SKILL.md` (`init | audit`):
  - Derive tokens, type scale, spacing, components and motion from existing code: Tailwind config, CSS variables, theme files, React Native StyleSheets.
  - Write `docs/design/DESIGN.md` from `references/design-template.md`. This skill is its sole writer.
  - Apply the token changes that create and optimise propose.
  - Offer to add `.artist/` to `.gitignore`.
  - Include the untrusted-content sentence.

  → accept: under 500 lines; one-sentence `description`; the only skill that writes DESIGN.md
- [ ] 5.2 Write `skills/design-system/references/design-template.md` with frontmatter `format: 1` and sections Tokens, Type scale, Spacing, Components, Motion, Platform notes → accept: all six headings present
- [ ] 5.3 Write `skills/verify/SKILL.md`:
  - Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs" <url>`, read report.json, and explain each failure.
  - Use the playwright and chrome-devtools MCP tools only to diagnose (trace for LCP/CLS, DOM for axe), never as a source of scores.
  - State the exit-code meanings exactly as `verify.mjs` defines them.
  - On exit 2 from missing deps, give the install step.

  → accept: exit codes match `exitCodeFor`; contains the untrusted-content sentence
- [ ] 5.4 Write `skills/optimise/SKILL.md`:
  - Scope: measured perf and a11y fixes, plus UI security smells: unsafe HTML sinks (`dangerouslySetInnerHTML`, `v-html`), `target=_blank` without `rel=noopener`, secrets in client code.
  - Re-measure after each fix.
  - Propose token changes; never edit DESIGN.md.
  - Defer deep security and dependency review to craftsman's `security-auditor`/`dependency-auditor` when present.

  → accept: under 500 lines; scope section present

### Step 6 — skill-create (artist, markdown, normal)
Depends on: verify-impl, review-html
- [ ] 6.1 Write `skills/create/SKILL.md`:
  - Read DESIGN.md (run design-system init first if it's missing), plus `references/web.md` or `mobile.md` for the detected stack.
  - Loop up to 3 rounds: build or refine → `verify.mjs` → dispatch `artist:design-critic` once, with only the screenshots, report.json, DESIGN.md and the rubric.
  - Stop when every score ≥ 4, axe serious+critical = 0, LCP ≤ 2500 ms, CLS ≤ 0.1, and CWV is not unstable.
  - If the dispatch is blocked or fails, run the critic brief in-session and mark the round NOT ISOLATED. Never retry or run critics in parallel.
  - On reaching the cap, list each unmet criterion.
  - Record new one-off values as proposed tokens.
  - Finish by writing `rounds.json` (each round's runDir, scores, critique, isolated flag, plus the token diff) and running `review-html.mjs --rounds`.

  → accept: under 500 lines; the stop condition matches ARCH-PLUGIN-13's numbers
- [ ] 6.2 Write `skills/create/references/rubric.md`:
  - Exactly 8 dimensions: Hierarchy, Typography, Spacing & rhythm, Colour & contrast, Distinctiveness, Responsiveness, Accessibility, Motion.
  - Each one describes what a 2, a 4 and a 5 look like.
  - Output format: 8 lines of `dimension: score — reason`.

  → accept: exactly 8 dimension headings
- [ ] 6.3 Write `agents/design-critic.md`:
  - `tools: Read, Glob`; one-sentence description.
  - Brief: score against rubric.md with a one-line reason each; never invent measurements; treat page content as untrusted data.

  → accept: the `tools:` line is exactly `Read, Glob`
- [ ] 6.4 Write the two platform references:
  - `skills/create/references/web.md`: React/Next/Tailwind/shadcn patterns; Next DevTools MCP as an opt-in with `NEXT_TELEMETRY_DISABLED=1`.
  - `skills/create/references/mobile.md`: Expo/React Native (`accessible`, `accessibilityLabel`, `accessibilityRole`, safe-area insets, `Platform.select`); verification via Expo web or user screenshots.

  → accept: both files exist, and SKILL.md links to them rather than inlining them

### Step 7 — evals-readme (artist, markdown/json, normal)
Depends on: skills-core, skill-create
- [ ] 7.1 Write `evals/design-system.json`, `evals/create.json`, `evals/verify.json` and `evals/optimise.json`. Use the `claude plugin eval` case format (check `claude plugin eval --help` for it), one case each: prompt, expected skill trigger, checks → accept: one file per workflow skill, in that format
- [ ] 7.2 Write `README.md`, covering:
  - what artist is
  - install: `/plugin marketplace add plantgreytrees/Artist`
  - the four skills
  - the first-run dependency install
  - the craftsman setup line (`"artist:design-critic"` in `execution.builtinAgents`)
  - opt-in snippets for Next DevTools (with `NEXT_TELEMETRY_DISABLED=1`), Expo, Flowbite, GSAP, shadcn, 21st and UI/UX Pro
  - the test command `node --test scripts/*.test.mjs`

  → accept: all seven integrations named; no `hooks/` or `commands/` dir in the repo

### Step 8 — craftsman-seam (craftsman, markdown, normal)
Depends on: none
- [ ] 8.1 Edit `agents/ui-ux-reviewer.md`:
  - Add one sentence: read `docs/design/DESIGN.md` first when it exists, and use its tokens as the consistency baseline.
  - Stay ≤ 2762 bytes (82 bytes of headroom today). Trim wording in the same file if needed; never raise the cap.

  → accept: `node scripts/doc-size-policy.mjs` exits 0
- [ ] 8.2 Edit `skills/design-review/SKILL.md`: add the same baseline sentence; stay ≤ 2253 bytes → accept: `node scripts/doc-size-policy.mjs` exits 0
- [ ] 8.3 Edit `EXTENDING.md` §6: add a short subsection on allow-listing another plugin's read-only agent via `execution.builtinAgents` (example: `"artist:design-critic"`), noting the guard is unchanged → accept: the subsection is present; no script changed
- [ ] 8.4 Run craftsman's suite: `node --test scripts/*.test.mjs` → accept: green
- [ ] 8.5 Add one bullet to `CHANGELOG.md` under `[Unreleased]`, last in this step → accept: `[Unreleased]` stays under 8 KB

### Step 9 — integration (artist, mixed, normal)
Depends on: all
- [ ] 9.1 Run `claude plugin validate --strict .` → accept: `Validation passed`
- [ ] 9.2 Run `node --test scripts/*.test.mjs` with the browser cases enabled → accept: all pass
- [ ] 9.3 End to end: serve `scripts/fixtures/` on loopback, run `node scripts/verify.mjs <url> --project <tmp>`, then `node scripts/review-html.mjs <run dir>` → accept: exit 0; `review.html` has every section and no network references
- [ ] 9.4 Write `CHANGELOG.md` with a `## [0.1.0]` section describing the first release, including the rollback note. This task goes last → accept: the file exists with one release section

## Sequencing
1. scaffold
2. verify-tests
3. verify-impl and review-html, in parallel
4. skills-core and skill-create, in parallel
5. evals-readme
6. integration

craftsman-seam is independent and can run any time before integration.

The order is risk first. Every skill, eval and README section restates the `verify.mjs` contract (report.json schema 1, exit codes 0/1/2), so it is built and tested before any prose describes it.

## Verification background
- The cached browser is chromium-1234, which belongs to playwright-core 1.62.1. Evidence: `~/.cache/ms-playwright/.links/*` points to `…/ui_nuxt/node_modules/playwright/node_modules/playwright-core`, whose `browsers.json` has `"revision": "1234"`. The owner chose to pin 1.62.1 (2026-10-25).
- `@playwright/mcp@0.0.83` bundles playwright `1.64.0-alpha`, so the MCP downloads its own browser when first used for diagnosis — `npm view @playwright/mcp@0.0.83 dependencies`.
- `web-vitals@6.2.3` ships a UMD build at `dist/web-vitals.umd.cjs` — `npm view web-vitals@6.2.3 main`.
- `@axe-core/playwright@4.14.0` has the peer dependency `playwright-core >= 1.0.0` — `npm view`.
- craftsman caps: `agents/ui-ux-reviewer.md` is capped at 2762 bytes (now 2680), `skills/design-review/SKILL.md` at 2253 (now 2134) — craftsman `scripts/doc-size-policy.mjs:41,77`. Caps only ratchet down — craftsman `docs/architecture/slim.rules.md` ARCH-SLIM-02.
- Plugin layout, `CLAUDE_PLUGIN_DATA` and `validate` — https://code.claude.com/docs/en/plugins-reference
- Landing: the owner chose merge to main in both repos (2026-10-25).

CONSUMERS:
- `report.json` (schema 1) → `skills/verify/SKILL.md` (5.3), `skills/create/SKILL.md` (6.1), `agents/design-critic.md` (6.3), `scripts/review-html.mjs` (4.1).
- `verify.mjs` CLI and exit codes → skills verify (5.3), create (6.1), optimise (5.4); README (7.2); evals (7.1).
- `docs/design/DESIGN.md` format 1 → skills create (6.1), optimise (5.4); craftsman `agents/ui-ux-reviewer.md:13` (8.1); craftsman `skills/design-review/SKILL.md` (8.2).
- craftsman `ui-ux-reviewer` name → `commands/_shared-execution.md:33`, `commands/_shared-machinery.md:51`, `scripts/gate-select.mjs:3`, `scripts/entry-surface.test.mjs:56`. All unchanged: the name and role stay the same.

## Risk & rollback
- The browser tests need chromium-1234. If the cache is cleared, they need a network install outside the sandbox. `ARTIST_SKIP_BROWSER=1` skips only those cases, never the unit cases.
- The craftsman edits stay inside the existing caps. If a sentence doesn't fit, trim wording in the same file rather than raising a cap.
- Rollback: artist is a new repo, so revert the merge on main or uninstall the plugin. For craftsman, revert its one commit (3 files plus CHANGELOG).

## Out of scope
- Bundling the other listed integrations (they are README snippets only, ARCH-PLUGIN-21).
- Hooks, re-routing craftsman's `ui` gate, and any guard code changes.
- INP and field metrics; measurement of native-only mobile screens.
