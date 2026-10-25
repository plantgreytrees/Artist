---
slug: scrutinise-artist-ui-plugin
goal: Fix the 5 warnings and 7 suggestions from the first independent review of artist, so no check can wrongly pass or fail
level: feature
parent: artist-ui-plugin
priority: P1
classification: in-scope (/scrutinise round 1, isolated scrutineer, range f2a2f4c..e70dd8a; all findings verified at file:line, none disputed)
tracker_rows: [scrutinise-artist-ui-plugin#fix-reuse-check, scrutinise-artist-ui-plugin#fix-verify, scrutinise-artist-ui-plugin#fix-review-html, scrutinise-artist-ui-plugin#fix2-scan, scrutinise-artist-ui-plugin#fix2-review-html, scrutinise-artist-ui-plugin#fix2-skills]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(decomposition supplied by the isolated scrutineer; three units with disjoint files)
  strategist: skipped(same reason; recorded so it is visible)
coverage:
  contract:      2.2 (report.json gains axe.violations[].targets; consumers listed below)
  data:          N/A(no persistence)
  config:        N/A(no config surface)
  security:      2.1 (sub-frame navigations off loopback aborted without failing the run; main-frame guard unchanged)
  tests:         1.1, 2.1, 2.4, 3.1
  observability: 2.3 (CLI prints a report path only when the report exists)
  interface:     3.1 (review.html shows an unreadable reuse.json and fails the verdict)
  docs:          N/A(skill wording already asks for selectors; it becomes true)
  rollback:      revert the three fix merges; each is self-contained
units:
  - id: 1
    scope_id: fix-reuse-check
    project: "."
    depends_on: []
    module: scripts/reuse-check.mjs
    language: javascript (node ESM)
    security: normal
    scope:
      read: [scripts/reuse-check.mjs, scripts/reuse-check.test.mjs, scripts/fixtures/reuse/DESIGN.md]
      docs: [docs/architecture/verify.rules.md, docs/architecture/plugin.rules.md]
      write: [scripts/reuse-check.mjs, scripts/reuse-check.test.mjs]
    arch: [ARCH-VERIFY-12, ARCH-VERIFY-08, ARCH-PLUGIN-23, ARCH-PLUGIN-24]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 2
    scope_id: fix-verify
    project: "."
    depends_on: []
    module: scripts/verify.mjs
    language: javascript (node ESM)
    security: high
    scope:
      read: [scripts/verify.mjs, scripts/verify.test.mjs, scripts/fixtures/report.sample.json]
      docs: [docs/architecture/verify.rules.md]
      write: [scripts/verify.mjs, scripts/verify.test.mjs, scripts/fixtures/iframe.html]
    arch: [ARCH-VERIFY-01, ARCH-VERIFY-02, ARCH-VERIFY-04, ARCH-VERIFY-08]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 3
    scope_id: fix-review-html
    project: "."
    depends_on: [fix-verify]
    module: scripts/review-html.mjs
    language: javascript (node ESM)
    security: normal
    scope:
      read: [scripts/review-html.mjs, scripts/review-html.test.mjs, scripts/verify.mjs]
      docs: [docs/architecture/verify.rules.md]
      write: [scripts/review-html.mjs, scripts/review-html.test.mjs]
    arch: [ARCH-VERIFY-13, ARCH-VERIFY-10, ARCH-VERIFY-08]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 4
    scope_id: fix2-scan
    project: "."
    depends_on: []
    module: scripts/reuse-check.mjs + scripts/inventory.mjs
    language: javascript (node ESM)
    security: normal
    scope:
      read: [scripts/reuse-check.mjs, scripts/reuse-check.test.mjs, scripts/inventory.mjs, scripts/inventory.test.mjs]
      docs: [docs/architecture/verify.rules.md, docs/architecture/plugin.rules.md]
      write: [scripts/reuse-check.mjs, scripts/reuse-check.test.mjs, scripts/inventory.mjs, scripts/inventory.test.mjs, scripts/fixtures/audit/DESIGN.md, scripts/fixtures/audit/src/components/Hero.tsx, scripts/fixtures/audit/src/ui/Hero.tsx, scripts/fixtures/audit/src/components/Banner.tsx, scripts/fixtures/audit/src/components/Promo.tsx, scripts/fixtures/audit/src/styles/tokens.css, scripts/fixtures/audit/NOTES.md, scripts/fixtures/audit/public/logo.svg]
    arch: [ARCH-VERIFY-15, ARCH-VERIFY-16, ARCH-VERIFY-11, ARCH-PLUGIN-27]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 5
    scope_id: fix2-review-html
    project: "."
    depends_on: []
    module: scripts/review-html.mjs
    language: javascript (node ESM)
    security: normal
    scope:
      read: [scripts/review-html.mjs, scripts/review-html.test.mjs, scripts/verify.mjs]
      docs: [docs/architecture/verify.rules.md]
      write: [scripts/review-html.mjs, scripts/review-html.test.mjs, scripts/verify.mjs]
    arch: [ARCH-VERIFY-13, ARCH-VERIFY-08, ARCH-PLUGIN-24]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 6
    scope_id: fix2-skills
    project: "."
    depends_on: [fix2-scan]
    module: skills/create + skills/optimise
    language: markdown
    security: normal
    scope:
      read: [skills/create/SKILL.md, skills/optimise/SKILL.md, scripts/reuse-check.mjs]
      docs: [docs/architecture/plugin.rules.md]
      write: [skills/create/SKILL.md, skills/optimise/SKILL.md]
    arch: [ARCH-PLUGIN-26, ARCH-PLUGIN-08]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [], mcp: [] }
---

# Plan: Fix the first review's findings in artist

## Outcome
Every artist check reports the truth: `reuse-check` works in monorepos and through symlinked paths, and ignores its own run artefacts; `verify` measures pages with third-party iframes; the review page never says PASS for unreadable input.

## Scope Steps (executable core)

### Step 1 — fix-reuse-check (node ESM)
Tooling: implementer · skills test-driven-development
- [ ] 1.1 Add failing tests first to `scripts/reuse-check.test.mjs`:
  - **W1:** a git repo with the project in a subdirectory (`mono/web`), a committed component edited to add `#123456` → reported, exit 1.
  - **W2:** running the CLI through a symlinked directory still writes `reuse.json` and exits by result.
  - **W4:** untracked `.artist/runs/x/375.png` (random bytes) and `.artist/runs/x/review.html` → not scanned.
  - **S6:** `href="#feed"` and `hsl(var(--primary))` → not reported.

  → accept: each new case fails before the fix
- [ ] 1.2 Fix `scripts/reuse-check.mjs`:
  - `git diff --name-only --relative <base>`, run with `cwd` at `--project`; `ls-files --others --exclude-standard` already runs from the project.
  - A listed name that cannot be read → exit 2 with the name, never silently dropped.
  - Always skip `.artist/**` and binary extensions (png, jpg, jpeg, webp, gif, ico, avif, woff, woff2, ttf, otf, mp4, webm, pdf, zip).
  - Skip colour functions whose arguments contain `var(`; skip `#hex` directly after `href=`/`id=` (quoted or not).
  - Main-module check: `fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)`.

  → accept: `node --test scripts/reuse-check.test.mjs` passes

### Step 2 — fix-verify (node ESM, high)
Tooling: implementer · gates security-auditor · skills test-driven-development
- [ ] 2.1 **W3:** add `scripts/fixtures/iframe.html` (a local page with `<iframe src="http://example.invalid/">`) and a browser test: `run()` on it exits by thresholds (0 or 1), not 2. Then change `guardNavigation` so only main-frame navigations of the measured page set `state.blocked`; off-loopback sub-frame and popup navigations are still aborted but do not fail the run → accept: test fails first, then passes; the redirect-off-loopback test still exits 2
- [ ] 2.2 **W5:** add `targets` (up to 5 CSS selectors, `node.target.join(" ")`) to each entry in `axe.violations[]`; assert it in the axe-violation browser test → accept: test asserts `targets` is a non-empty string array
- [ ] 2.3 **S7, S8:** a page with neither LCP nor FCP reports `lcp_ms: null`, and `exitCodeFor` treats null LCP as missed (1); the CLI prints the report path only when `report.json` was written → accept: unit tests for both
- [ ] 2.4 **S12:** `run()` with an injected `launch` that throws after deps resolve → exit 2 with an error → accept: test passes

### Step 3 — fix-review-html (node ESM)
Tooling: implementer · skills test-driven-development
Depends on: fix-verify
- [ ] 3.1 Failing tests first, then fix `scripts/review-html.mjs`:
  - **S9:** a corrupt `reuse.json` shows "reuse.json unreadable" and makes the verdict NEEDS WORK.
  - **S10:** thresholds come from `import { THRESHOLDS } from "./verify.mjs"`, not repeated literals.
  - **W2:** main-module check uses `fs.realpathSync(process.argv[1])`.
  - Render `axe.violations[].targets` when present.

  → accept: `node --test scripts/review-html.test.mjs` passes; full suite green

## Round 2 (scrutineer range e70dd8a..43fa780: 0 Critical, 5 Warning, 4 Suggestion)

### Step 4 — fix2-scan (node ESM)
Tooling: implementer · skills test-driven-development
- [ ] 4.1 Tests first. Add fixture `scripts/fixtures/audit/`:
  - a format-2 `DESIGN.md` naming `src/styles/tokens.css` as the token file
  - the same `Hero` at `src/components/Hero.tsx` and `src/ui/Hero.tsx`
  - `Banner.tsx` and `Promo.tsx` with identical prop names
  - `NOTES.md` containing "fixes #123" and `13px`
  - `public/logo.svg` with `fill="#ff0000"`

  Each test copies the fixture into a temp git repo and commits it. Cases:
  - **W1:** run `inventory.mjs`, then `reuse-check --all` → `near_duplicates` includes Hero (same name) and Banner/Promo (prop overlap).
  - **W1:** an inventory entry whose file was then deleted → `stale_inventory`; a fresh inventory → no stale entries.
  - **W3:** a tracked file deleted without staging → `--all` still exits by result, not 2.
  - **W4:** `NOTES.md`, `logo.svg` and a written `docs/design/consistency.md` produce no findings.
  - **W5:** a git-ignored `dist/Foo.tsx` (created at runtime, ignored via `.gitignore`) is neither inventoried nor flagged.
  - **S6:** the Unparsed table never appears as package rows.

  → accept: the new cases fail first
- [ ] 4.2 Implement:
  - Export one `listProjectFiles(project)` from `scripts/inventory.mjs`: `git ls-files --cached --others --exclude-standard` inside a repo (existing regular files only), filesystem walk outside git, always skipping `node_modules/`, `.artist/`, `.git/`, `.worktrees/`. Both scripts use it.
  - Near-duplicates are computed pairwise over current components. Stale entries are inventory paths missing from the file list.
  - The colour, spacing and motion scans cover only code and style extensions (`.js .jsx .ts .tsx .mjs .cjs .css .scss .sass .less .vue .svelte .html`) and always exclude `docs/design/**`.
  - Unparsed is rendered as `## Unparsed`.
  - `CAPS`, `capOf` and `formatOf` are exported once from `inventory.mjs` and imported by `reuse-check.mjs`.

  → accept: `node --test scripts/reuse-check.test.mjs scripts/inventory.test.mjs` passes; full suite green

### Step 5 — fix2-review-html (node ESM)
Tooling: implementer · skills test-driven-development
- [ ] 5.1 **W2:** first a failing test: a report with `cwv.lcp_ms: null`, all scores 5 and axe 0 renders NEEDS WORK. Then export `cwvPasses(cwv)` from `scripts/verify.mjs` (used by `exitCodeFor`) and use it in `review-html.mjs`'s `passes()` → accept: test fails first, then passes; full suite green

### Step 6 — fix2-skills (markdown)
Depends on: fix2-scan
- [ ] 6.1 **S8:** in `skills/create/SKILL.md` and `skills/optimise/SKILL.md`, list every valid justification key:
  - component, layout or package name
  - colour, spacing or motion value as reported (for example `13px`, `cubic-bezier(...)`)
  - file path for `missing_reduced_motion`

  → accept: both files name all of them

## Sequencing
fix-reuse-check and fix-verify are independent; fix-review-html follows fix-verify because it imports `THRESHOLDS` and renders `targets`.

## Verification background
- W1–W5 and S6–S12 verified by the scrutineer by running each case; citations re-checked by root: `scripts/reuse-check.mjs:156-160,167`, `scripts/verify.mjs:121-130,205,239`, `scripts/review-html.mjs:123`, `skills/verify/SKILL.md:47`.
- Plan drift for `/sync-docs`: `docs/plans/artist-ui-plugin.md` task 7.1 said `evals/<skill>.json`; shipped format `evals/<case>/prompt.md` + `graders/*.md` is the correct `claude plugin eval` layout.

CONSUMERS:
- `report.json` `axe.violations[]` (adds `targets`) → `scripts/review-html.mjs` (3.1), `skills/verify/SKILL.md:47`, `skills/optimise/SKILL.md`, `agents/design-critic.md` (reads report.json).
- `THRESHOLDS` export of `scripts/verify.mjs` → `scripts/review-html.mjs` (3.1).

## Risk & rollback
Sub-frame aborts may hide an embedded widget from screenshots; that is acceptable (the measured page is still loopback-only). Revert any fix merge independently.

## Out of scope
- Remote subresource loading by local pages (residual risk noted by the scrutineer; deliberate).
- craftsman-seam (blocked on workspace manifest; tracked in the parent plan).
