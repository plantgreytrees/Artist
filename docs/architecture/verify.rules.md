---
area: verify
governs: ["scripts/**"]
human: docs/architecture/verify.md
source: docs/ideas/artist-ui-plugin.md
verified_at: b56571e61ee3a649f150b50ba42cc114b26d6f33
updated: 2026-10-25
---
# ARCH verify — enforced rules

- **ARCH-VERIFY-01** [decided] Every score artist reports (axe counts, LCP, CLS, screenshots) MUST come from `scripts/verify.mjs`; MCP tools MAY be used only to diagnose a failed check, never as the source of a reported number — check: create/verify/optimise SKILL.md cite verify.mjs output for scores — cite: docs/architecture/verify.rules.md:11
- **ARCH-VERIFY-02** [decided] `verify.mjs` MUST write `report.json` with a top-level `schema: 1`, `url`, `breakpoints[]`, `axe{critical,serious,moderate,minor,violations[]}`, `cwv{lcp_ms,cls,runs,spread}`, `screenshots{<width>: <file>}` — check: schema test in `scripts/verify.test.mjs` — cite: docs/architecture/verify.rules.md:12
- **ARCH-VERIFY-03** [decided] Default breakpoints MUST be 375, 768, 1280 px, overridable with `--breakpoints` — check: arg parsing test — cite: docs/architecture/verify.rules.md:13
- **ARCH-VERIFY-04** [decided] `verify.mjs` MUST refuse any URL whose host is not loopback (`localhost`, `127.0.0.0/8`, `::1`) unless `--allow-remote` is passed explicitly — check: unit test rejects `https://example.com` without the flag — cite: docs/architecture/verify.rules.md:14 (playwright-mcp README: origins not a security boundary)
- **ARCH-VERIFY-05** [decided] Runtime dependencies (`playwright`, `@axe-core/playwright`, `web-vitals`) MUST be pinned exactly in `scripts/package.json` with a committed lockfile and installed into `${CLAUDE_PLUGIN_DATA}`, never into the target project — check: package.json has no `^`/`~`; install path uses CLAUDE_PLUGIN_DATA — cite: docs/architecture/verify.rules.md:15 (plugins-reference: CLAUDE_PLUGIN_DATA for node_modules)
- **ARCH-VERIFY-06** [decided] All output MUST go under `<project>/.artist/runs/<UTC-timestamp>/`; `verify.mjs` MUST NOT write anywhere else in the project — check: test asserts written paths — cite: docs/architecture/verify.rules.md:15
- **ARCH-VERIFY-07** [decided] CWV MUST be measured over 3 runs and reported as the median; if (max−min)/median > 0.20 for LCP, the report MUST mark `cwv.unstable: true` and the loop MUST NOT treat CWV as passed — check: unit test with synthetic samples — cite: docs/ideas/artist-ui-plugin.md:160
- **ARCH-VERIFY-08** [decided] Exit codes MUST be 0 = all thresholds met, 1 = thresholds missed, 2 = tool error; a crashed browser or failed install MUST exit 2 and never report a pass — check: tests per exit path — cite: docs/architecture/verify.rules.md:18 (craftsman CHANGELOG.md L68 crashed tool is unavailable)
- **ARCH-VERIFY-09** [superseded by ARCH-VERIFY-13]
- **ARCH-VERIFY-10** [decided] `review.html` MUST be self-contained (inline CSS/JS, images by relative path) and make no network requests — check: test greps output for `http://`/`https://` in src/href — cite: docs/architecture/verify.rules.md:19
- **ARCH-VERIFY-11** [decided] Scripts MUST be Node ESM `.mjs` with tests run by `node --test scripts/*.test.mjs`, matching craftsman's convention — check: file extensions; test command in README — cite: docs/ideas/artist-ui-plugin.md:95
- **ARCH-VERIFY-12** [decided] `scripts/reuse-check.mjs` MUST be deterministic: from DESIGN.md, the changed files and `justifications.json` it writes `reuse.json` (`schema: 1`; `new_components[]`, `new_layouts[]`, `raw_colours[]`, `new_packages[]`, each `{name or value, file, line, justified, reason?, duplicates?}`; `unjustified` count) beside report.json, flagging new component or layout files absent from the inventories, colour literals (hex, rgb/hsl, Tailwind arbitrary `[#…]`) that match no token value, and dependencies added to any package.json versus the Packages inventory, marking `duplicates` when a fixed capability map shows an installed package already covers the same capability (e.g. recharts beside chart.js); exit 0 = none unjustified, 1 = some unjustified, 2 = tool error — check: `scripts/reuse-check.test.mjs` with fixtures — cite: docs/architecture/verify.rules.md:22
- **ARCH-VERIFY-13** [decided] Each run MUST also write `review.html`: per-breakpoint before/after screenshots with a slider, rubric scores per round, axe and CWV results, the DESIGN.md token diff, and the reuse findings from `reuse.json` when present — check: file present; sections present in test fixture — cite: docs/architecture/verify.rules.md:23
