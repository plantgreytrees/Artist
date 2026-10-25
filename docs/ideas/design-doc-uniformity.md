---
slug: design-doc-uniformity
status: pursue-with-changes
verdict: pursue-with-changes
confidence: medium
depth: standard
isolation: isolated
created: 2026-10-25
updated: 2026-10-25
related: [docs/ideas/artist-ui-plugin.md, docs/plans/artist-ui-plugin.md, docs/architecture/plugin.rules.md, docs/architecture/verify.rules.md]
touches: [skills/design-system/SKILL.md, skills/design-system/references/design-template.md, skills/create/SKILL.md, skills/create/references/web.md, skills/create/references/mobile.md, skills/optimise/SKILL.md, scripts/design-doc.mjs, scripts/design-doc.test.mjs, scripts/inventory.mjs, scripts/inventory.test.mjs, scripts/reuse-check.mjs, scripts/reuse-check.test.mjs, scripts/fixtures/**, evals/design-system/**, README.md, CHANGELOG.md, docs/architecture/plugin.rules.md, docs/architecture/plugin.md, docs/architecture/verify.rules.md, docs/architecture/verify.md]
---

# Idea: Variables-first design system with an HTML design doc, recorded decisions and per-category uniformity ratios

## Proposal (neutral restatement)
**Problem.** In a project using artist, the design system lives only as
markdown (`docs/design/DESIGN.md`) and the audit only as a list of findings
(`docs/design/consistency.md`). There is (a) no visual, browsable document of
colours, type, spacing, motion and components; (b) no place to record *why* a
value exists, only a short `use` note
(`skills/design-system/references/design-template.md:25`); (c) no measure of how
uniform the UI is relative to its size, because `reuse.json` counts only
violations (`scripts/reuse-check.mjs:145`, `:230-231`); and (d) values are not
guaranteed to be variables at every tier, so a global change can still need
edits in many places. Who hits it: the maintainer and teammates who review a
project's UI. Frequency: UNPROVEN.
**Claimed benefit.** One `design-system init` produces a complete DESIGN.md
and a team-readable HTML doc. Every visual value is a variable that can be
changed globally or per component. An audit reports how uniform the UI is, per
category.
**Who benefits.** The maintainer, teammates and stakeholders reading the HTML
doc (user answer, 2026-10-25), and `create`/`optimise`, which gain rationale
and a cleaner token contract.
**Done.** `design-system init` writes DESIGN.md (with Decisions and Component
tokens) and `docs/design/design-system.html`. Every colour, spacing, radius,
type and motion value used by components resolves to a CSS variable (or an RN
theme key). `audit` reports per-category `{conforming, total}` ratios, including
component-API consistency, and never a single blended number.

## Verdict
**PURSUE-WITH-CHANGES** (medium). The HTML doc and Decisions are cheap, fit
existing patterns (`scripts/review-html.mjs:1-10`), and were verified not to
break the parsers. The variables-first tier is what makes the ratios
computable: under Tailwind v4 every token is a `:root` variable and utilities
map to it by namespace (`--color-brand` → `bg-brand`), so token use can be
counted deterministically (https://tailwindcss.com/docs/theme). Today that
count is wrong on the main supported stack: a Tailwind fixture `Button` gets
`tokensUsed: []` (`scripts/inventory.mjs:164`, verified). **Most likely to flip
it:** whether Tailwind v3 JS configs (`tailwind.config.js`, the repo's own eval
fixture `evals/design-system/prompt.md`) can be resolved statically. If not,
the ratios are v4/CSS-variable/RN-only, and v3 projects get findings without
ratios.

| criterion | score 1–5 | evidence |
|---|---|---|
| value (problem is real and frequent) | 3 | team readers named by the user; rationale has no home today (design-template.md:25); frequency UNPROVEN |
| system fit (aligns with architecture + direction) | 4 | extends design-system init/audit (SKILL.md:24-59) and the semantic-token rule ARCH-PLUGIN-26 (plugin.rules.md:36); the ratios need an ARCH-VERIFY-01 amendment (verify.rules.md:11, SKILL.md:63) |
| cost (build + maintain) — 5 = cheap | 2 | HTML + Decisions are small (review-html.mjs is 128 lines); class→variable resolution, component-token tier and schema-3 counts are the bulk |
| risk (blast radius, failure modes) — 5 = low | 3 | stored XSS in a committed HTML file if any field skips escaping; Goodhart pressure on the ARCH-PLUGIN-24 loop; template change ripples to create/optimise |
| reversibility — 5 = trivially undone | 4 | new optional sections and a new script; a reuse.json schema bump is the stickiest part |
| evidence strength (research + repo proof) | 3 | parser tolerance and the Tailwind zero-count verified on a fixture; Tailwind v4 and Bootstrap 5.3 docs primary; adoption-rate figures UNPROVEN |

## Overlap & prior work
**Extends** shipped work; not a duplicate.
- `design-system init` already writes DESIGN.md (`skills/design-system/SKILL.md:24-39`); `audit` writes `consistency.md` with counts per category (`:41-59`).
- `docs/ideas/artist-ui-plugin.md` (architected) and plans `docs/plans/artist-ui-plugin.md`, `docs/plans/scrutinise-artist-ui-plugin.md`. Open tracker rows: `fix4` IN_PROGRESS, `followup-cwv-flake` and `craftsman-seam` PENDING (`docs/plans/TRACKER.md`).
- **Constraints it must respect or amend:**
  - ARCH-PLUGIN-01 (no `commands/`, so "init command" = the existing `design-system init`, plugin.rules.md:11).
  - ARCH-PLUGIN-07 (exactly four workflow skills, :17).
  - ARCH-PLUGIN-14 (only design-system writes DESIGN.md, :24).
  - ARCH-PLUGIN-25 (format-2 section list, :35; needs amending for Decisions and Component tokens).
  - ARCH-PLUGIN-27 (:37).
  - ARCH-VERIFY-01 (all scores from verify.mjs, verify.rules.md:11; **conflicts** with any audit figure unless amended).
  - ARCH-VERIFY-10 (self-contained HTML, :20).
  - ARCH-VERIFY-15/16 (deterministic reuse-check and inventory, :25-26).
- Plan memory (`artist-ui-plugin`): decision "verify.mjs sole score source".
- Searched: `docs/ideas/*`, `docs/plans/*` goal lines and TRACKER.md (no TRACKER-archive.md), `docs/architecture/*.rules.md`, CHANGELOG `[Unreleased]`, README skills table, plan memory for both plans.

## System fit (whole project)
- **Contract ripple:**
  - DESIGN.md gains `## Decisions` and `## Component tokens`. Both parsers split by `##` heading and ignore unknown sections (`scripts/reuse-check.mjs:9-23`). Verified: a fixture with an appended Decisions table passes `inventory.mjs` (exit 0) and `reuse-check --all` (exit 0), and the section is preserved.
  - `reuse.json` would go to schema 3 with `{conforming, total}` per category; consumers are `review-html.mjs` (reuse section) and the create/optimise/design-system skills.
- **Data:** N/A (no database; the files are the data).
- **Config & flags:** Platform notes `token files` (`SKILL.md:29`) must also name the Tailwind v4 `@theme` file or v3 config. Breakpoints stay literal, because CSS variables do not work in media queries (https://getbootstrap.com/docs/5.3/customize/css-variables/), so they must be an explicit exemption.
- **Security:**
  - The HTML renders untrusted repo text (component names, `use` notes, decisions). Every field must go through the `esc` helper pattern (`scripts/review-html.mjs:10`).
  - Swatch `style=` values must be allowlisted (hex/rgb/hsl/oklch/var).
  - No network (ARCH-VERIFY-10).
- **Tests:**
  - New `scripts/design-doc.test.mjs` with a hostile-names fixture and a no-`http` grep.
  - Inventory tests for class→variable resolution.
  - Reuse-check tests for ratio counts.
  - Update `evals/design-system/prompt.md`.
- **Observability:** N/A (offline CLI scripts; exit codes 0/1/2 already defined).
- **UI:**
  - The generated `docs/design/design-system.html` itself.
  - `create` output shifts to variables-first (component tokens), via `skills/create/references/web.md` and `mobile.md`.
- **Docs:** README "Theming" and "Keeping the design consistent" sections, CHANGELOG, plugin.md/plugin.rules.md (ARCH-PLUGIN-25/27 amendments), verify.md/verify.rules.md (ARCH-VERIFY-01/15/16 amendments).

**Second-order effects:**
- A third template tier makes DESIGN.md longer and `create` more constrained.
- The committed HTML is a second artefact that can drift if DESIGN.md is hand-edited between runs.
- Ratios add a target the create loop can be tempted to game via `justifications.json`.
- Stricter variable rules flag more existing code on the first audit.

**Stack:** Node ESM `.mjs` scripts with `node --test` (ARCH-VERIFY-11); skills in markdown.

## Research
- **Tailwind v4 `@theme`:**
  - Every theme variable becomes a `:root` CSS variable (only used ones are emitted unless `@theme static`).
  - Utilities derive from namespaces: `--color-*`, `--spacing-*`, `--text-*`, `--radius-*`, `--ease-*`, `--animate-*`, `--breakpoint-*`.
  - Tokens may reference other variables; `@theme inline` resolves the reference where the utility is used, avoiding a known fallback trap.
  - Source: https://tailwindcss.com/docs/theme
- **Bootstrap 5.3:**
  - Root `--bs-*` variables, with dark mode as a `[data-bs-theme=dark]` scope.
  - Component-level local variables (e.g. `.navbar`, tables, gutters) let you override per component or globally.
  - Caveats: Sass still sets defaults; variables cannot be used in media queries.
  - Source: https://getbootstrap.com/docs/5.3/customize/css-variables/
- **What "best of both" means here:** Tailwind's variable-backed utilities plus Bootstrap's component-scoped variable tier and theme scopes. This is a pattern, not a dependency: running both frameworks would duplicate base resets and CSS (UNPROVEN size; artist's reuse rule already prefers the installed stack, README "Reuse rule").
- **Token coverage** = share of styling values that reference tokens. A 375-site audit reports an average of 40.4% and a median of 38% (https://www.designsystemscollective.com/design-token-drift-we-audited-375-sites-only-7-5-got-it-right-78890bfbb9de; page returned 403, figures from a search snippet, UNPROVEN). Definitions differ by tool, so fix one denominator (https://atomize.tools/blog/figma-coverage-audit-vs-untokenized-values/).
- **Project Wallace** treats unique colours and font sizes vs total as a drift signal (https://www.projectwallace.com/docs/metrics/values-colors-totalunique, https://blog.openreplay.com/audit-stylesheet-project-wallace/).
- **Omlet** measures component adoption by code scanning (https://blog.zeplin.io/meet-omlet-component-analytics-for-developers). Counting use misses whether components are used *correctly* (https://www.supernova.io/blog/how-documentation-analytics-can-help-you-prioritize-design-system-improvements).
- **Token-to-HTML docs:** Style Dictionary exports tokens to HTML docs (https://github.com/amzn/style-dictionary); tokvista generates visual token docs (https://libraries.io/npm/tokvista). Both are prior art for the HTML doc; neither is needed as a dependency given `review-html.mjs`.
- **Google Stitch DESIGN.md** (alpha, Apache-2.0) pairs tokens with prose rationale (https://the-decoder.com/googles-open-source-design-md-gives-ai-agents-a-prompt-ready-blueprint-for-brand-consistent-design/). ADR practice: append-only records with superseded-by links (https://learn.microsoft.com/en-us/azure/well-architected/architect-role/architecture-decision-record).
- **Goodhart:** single metrics used aggressively get gamed; pair indicators (https://getdx.com/blog/two-design-flaws-make-your-metrics-easy-game-laura-tacho/).

## Critique
- **Steelman.** All inputs for the HTML already exist in init's sources and the inventory (`SKILL.md:20-39`). A self-contained renderer pattern exists (`review-html.mjs`). Rationale is what stops `create` and humans from "fixing" a deliberate choice. Raw counts without a denominator are meaningless across project sizes. A variables-first tier turns "change the brand" into a one-line edit, and makes token use countable.
- **Strongest case against.**
  - The score half needs real parser work: Tailwind class→variable resolution and RN theme keys, because `inventory.mjs:164` sees only `var(--…)`.
  - It needs two rule amendments (ARCH-VERIFY-01, ARCH-PLUGIN-25).
  - It invites gaming of the create loop.
  - Demand for the HTML beyond the maintainer is asserted, not observed.
- **Hidden assumptions:**
  - Tailwind token use can be counted deterministically. True for v4 by namespace (tailwindcss.com/docs/theme); v3 JS config UNPROVEN. Test: resolve `bg-brand` on the eval fixture.
  - The extra sections don't break the parsers. **Tested, holds** (fixture run, 2026-10-25).
  - The team will open the HTML. Test: is it linked from a README or PR within a month?
  - Ratios will change decisions. Test: does anyone compare audits across runs?
- **Failure modes:**
  - Stored XSS from an unescaped field.
  - Ratios artificially low on unsupported stacks, so they lose credibility.
  - The HTML goes stale after hand edits.
  - The component-token tier becomes ceremony: a variable per property per component, which bloats CSS and DESIGN.md.
- **Kill criteria:**
  - Class→variable resolution needs heuristics that misclassify on fixtures: drop ratios for that stack.
  - The HTML fails the hostile-name or no-network test.
  - Ratios move without code changes (only `justifications.json` edits).
  - No one but the maintainer opens the HTML after a month: stop committing it.
- **Cheaper alternatives:**
  - Do nothing: DESIGN.md renders on GitHub, and `consistency.md` has counts.
  - **Smallest useful slice:** Decisions section + `design-doc.mjs` HTML.
  - Ratios without component tokens: count only existing semantic-token use.
  - Full proposal as stated.

## Disputed
- **Critic: "Tailwind/RN token counting is a real parser project, not a field addition."** *Softened.* For Tailwind v4 it is a deterministic namespace lookup (`bg-brand` ↔ `--color-brand`, https://tailwindcss.com/docs/theme). It remains open for v3 JS configs and RN theme objects.
- **Critic: "Generate the HTML into `.artist/design/` rather than `docs/` to avoid drift."** *Overridden by user intent:* the doc is for the team and is committed (answer, 2026-10-25). Drift is mitigated instead by regenerating on both init and audit and by a staleness check (see Recommendations).
- **Critic assumption: "parsers may not tolerate a `## Decisions` section."** *Resolved:* tested on a fixture; both scripts exit 0 and keep the section.

## Recommendations
1. **Sequence the work as 1) HTML + Decisions, 2) variables-first tier + token detection, 3) ratios.** Slice 1 ships value regardless of whether the denominator work succeeds.
2. **Variables-first, Tailwind × Bootstrap patterns, additively (no format 3):**
   - Keep the Primitives → Semantic tokens → Themes chain, every entry backed by a CSS variable (RN: theme key).
   - Add an optional `## Component tokens` section (`| component | variable | semantic | use |`, e.g. `--button-padding-x → space.4`), Bootstrap-style, scoped on the component root.
   - Record the Tailwind v4 utility namespace per semantic token so `bg-brand` resolves.
   - Breakpoints are an explicit literal exemption (no variables in media queries).
   - Themes switch by `[data-theme]`/`[data-brand]` scopes, as now.
   - Component tokens only where a component has real variants or brand overrides, to avoid ceremony.
   - Never require both frameworks: map onto whichever is installed (`--bs-*` for Bootstrap projects, `@theme` for Tailwind).
3. **Decisions, proposed by init and confirmed by the user:** `| decision | why | date | supersedes |`, append-only. init proposes candidates inferred from code (e.g. "single brand, dark via `.dark`") and writes only those the user confirms.
4. **HTML doc** `docs/design/design-system.html`:
   - Rendered by a deterministic `scripts/design-doc.mjs` from DESIGN.md + `inventory.json`.
   - Regenerated on every init and audit.
   - Self-contained, with the `esc` pattern from `review-html.mjs` and allowlisted swatch values.
   - Stamped with the DESIGN.md hash so audit can flag a stale doc.
   - Because everything is a variable, the doc can offer an offline live-tweak panel: edit a variable, see swatches and type update, and copy the override block. Optional, and kept out of slice 1 if it grows.
5. **Ratios, never blended:**
   - `reuse.json` schema 3 with `{conforming, total}` for colours, spacing, motion, reduced-motion and component-token use.
   - Plus component-API consistency from the inventory: shared prop names and variant vocabularies across components, e.g. `size` values `sm|md|lg` vs `small|large`, and `variant` vs `kind`.
   - Amend ARCH-VERIFY-01 to name `reuse-check.mjs` as the source of consistency ratios. `verify.mjs` stays the source of rendered scores.
6. **Anti-gaming:** report justified items separately from conforming ones, so `justifications.json` cannot raise a ratio.
7. **Spike first (half a day):** resolve Tailwind v4 classes and a v3 `tailwind.config.js` object literal to variables on the eval fixture. Its result decides which stacks get ratios.

## Open questions
- Score form? → **Per-category ratios, no blended number** (answered 2026-10-25).
- "Models, objects" meaning? → **Component APIs (prop/variant consistency)**, not data schemas (answered 2026-10-25).
- HTML reader and location? → **Team, committed at `docs/design/`** (answered 2026-10-25).
- Decisions source? → **Proposed by init, confirmed by the user** (answered 2026-10-25).
- Variables-first focus? → **Yes: extremely variable-driven for global change, combining Tailwind and Bootstrap strengths** (user, 2026-10-25). Interpreted as patterns, not installing both frameworks.
- Open: must Tailwind v3 (JS config) projects get ratios, or is v4/CSS-variables/RN enough? Settle with the spike in rec. 7.
- Open: is the live-tweak panel in the HTML wanted in slice 1, or later?

## Next step
`/architect design-doc-uniformity --deep` (cross-cutting: template format, two
ARCH rule amendments, three scripts, three skills).
