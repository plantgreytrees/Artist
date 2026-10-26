---
slug: design-directions
status: architected
verdict: pursue-with-changes
confidence: medium
depth: standard
isolation: isolated
created: 2026-10-25
updated: 2026-10-26
related: [docs/architecture/directions.rules.md, docs/architecture/directions.md, docs/ideas/artist-ui-plugin.md, docs/ideas/design-doc-uniformity.md, docs/plans/design-doc-uniformity.md, docs/architecture/plugin.rules.md, docs/architecture/verify.rules.md]
touches: [skills/create/SKILL.md, docs/design/inventory.json (read, in target projects), skills/create/references/directions.md (new), skills/create/references/web.md, skills/design-system/SKILL.md, scripts/directions.mjs (new), scripts/directions.test.mjs (new), scripts/fixtures/directions/**, evals/create/**, README.md, CHANGELOG.md, docs/architecture/plugin.rules.md, docs/architecture/plugin.md, docs/architecture/verify.rules.md, docs/architecture/verify.md]
---

# Idea: Contrasting design directions, rendered as a token specimen, before create builds

## Proposal (neutral restatement)
**Problem.** `create` builds exactly one design per request, anchored to the
project's existing `docs/design/DESIGN.md`, and refines it for at most three
rounds (`skills/create/SKILL.md:37-68`). Nothing in the flow (a) names the
project's current aesthetic (minimalist, brutalist, editorial, glass…) with
evidence, (b) proposes contrasting directions, including one deliberately
ambitious "showcase" treatment, or (c) shows them side by side with per-axis
differences and lets the user pick or combine choices before building. The
rubric already scores Distinctiveness (`skills/create/references/rubric.md:25-28`)
but nothing produces it. Who hits it: the maintainer and users building
frontends with artist. Frequency: UNPROVEN.
**Claimed benefit.** More distinctive, more ambitious UI, and a user-curated
choice of direction instead of one converged output.
**Who benefits.** Anyone running `create` on a new page or redesign.
**Done.** One invocation yields (1) a stated reading of the current concept
with `file:line` token evidence; (2) three or more contrasting directions, each
a per-axis token delta; (3) a self-contained HTML specimen rendering every
direction on the same sample components, with differences highlighted and
token axes mixable; (4) the chosen combination handed on as proposed tokens or
a theme set, which `design-system` applies and `create` then builds through the
unchanged loop.

## Verdict
**PURSUE-WITH-CHANGES** (medium). The problem is real and well documented:
LLM UI output converges on defaults, and the remedy the research gives is to
present contrasting alternatives anchored to brand tokens. Peer tools ship
this. As pitched, though (a council of agents, N full page builds, a free-form
composer), it breaks ARCH-PLUGIN-07/09/10 and multiplies cost by N. The shape
the user confirmed keeps most of the value at about 1× cost and breaks no
decided rule: perspectives written in-session, directions as token deltas, one
deterministic specimen page, one ambitious direction held to the same gates.
**Most likely to flip it:** real use showing users keep the current direction
>70% of the time (→ DEFER), or asking to see directions on the real page
(→ promote rendered theme-set builds, Alternative C).

| criterion | score 1–5 | evidence |
|---|---|---|
| value (problem is real and frequent) | 3 | homogenisation documented (https://arxiv.org/html/2603.13036v1, https://arxiv.org/pdf/2607.22928); peer tools ship it (0xdesign, AI Studio); frequency UNPROVEN |
| system fit (aligns with architecture + direction) | 4 | directions map onto Themes/semantic tokens (ARCH-PLUGIN-35, `plugin.rules.md:45`; `skills/design-system/SKILL.md:20,28,39`); lives in `create` as a reference pack (ARCH-PLUGIN-07 untouched); renderer follows review-html's self-contained pattern (ARCH-VERIFY-10) |
| cost (build + maintain) — 5 = cheap | 4 | one script + test + reference pack + eval case; no N-way build/verify/critic; can reuse `design-md.mjs` parser (in flight) |
| risk (blast radius, failure modes) — 5 = low | 4 | additive and opt-in; risks: convergent directions, incoherent mixes, collision with in-flight plan files |
| reversibility — 5 = trivially undone | 4 | delete reference pack + script; one ARCH amendment to supersede |
| evidence strength (research + repo proof) | 3 | repo claims verified; exemplar located locally; style classification and user demand UNPROVEN |

Full proposal as pitched scored 3/2/2/2/3/2 (critic).

## Overlap & prior work
- **Novel** in this repo. Searched: `docs/ideas/*.md` (artist-ui-plugin, design-doc-uniformity; neither rejected nor covering variants), `docs/plans/TRACKER.md`, plan `goal:` lines (`docs/plans/*.md:3`), `CHANGELOG.md` `[Unreleased]`, README skills table, plan memory recall for both plans ("design variants style concept create critic rubric distinctiveness"): no hit.
- **Extends** `create` (`skills/create/SKILL.md:26-68`), the Distinctiveness dimension (`rubric.md:25-28`), the Themes model (ARCH-PLUGIN-35) and the self-contained renderer pattern of `scripts/review-html.mjs:40,121,152`.
- **Adjacent opt-in**: UI/UX Pro MCP style catalogue (`README.md:103-107`), kept opt-in, never bundled (ARCH-PLUGIN-21).
- **Conflicts (as pitched)**: ARCH-PLUGIN-07 (`plugin.rules.md:17`, exactly four workflow skills) if a new skill; ARCH-PLUGIN-09/10 (`:19-20`, one agent, one critic per round, never parallel) if a council of agents or a critic call per direction; ARCH-PLUGIN-14 (`:24`) if directions write DESIGN.md directly. The recommended shape avoids all three.
- **Sequencing conflict**: the in-flight plan design-doc-uniformity (12 of 13 units PENDING, `design-md` IN_PROGRESS) writes `skills/create/SKILL.md`, `skills/design-system/**`, `skills/create/references/web.md` and `scripts/reuse-check.mjs` (`docs/plans/design-doc-uniformity.md:86,99,112`).

## System fit (whole project)
- **contract ripple** — the renderer reads `docs/design/inventory.json` (`tokensUsed`, `usage`) for the impact list, read-only, so `schema: 1` is unchanged (ARCH-VERIFY-23); `create` gains an optional step 0 (`skills/create/SKILL.md:17-24` Setup); the pick feeds the existing `tokenDiff` in `rounds.json` (`:72-77`) and `design-system`'s token proposals (ARCH-PLUGIN-14). No change to `report.json`, `reuse.json` or critic I/O.
- **data** — N/A (no DB). New run artefacts: `directions.json` and `directions.html` under `.artist/directions/<UTC ts>/` (ARCH-VERIFY-06 constrains only verify's output).
- **config & flags** — an opt-in trigger (e.g. `create --directions [n]`); default flow unchanged.
- **security** — the specimen is generated by a script from token values, never from model-written HTML; it must escape every value (as `review-html.mjs:18-22`), make no network requests (ARCH-VERIFY-10) and treat token values as untrusted (ARCH-PLUGIN-17). Inline JS only for axis toggles.
- **tests** — `scripts/directions.test.mjs` under `node --test` (ARCH-VERIFY-11): deterministic output, escaping, no external URLs, mix produces a valid token set; an `evals/create` case for the direction step (ARCH-PLUGIN-20).
- **observability** — N/A (local CLI artefacts only).
- **UI** — the directions page itself: final-result view per direction, specimen view and a pick & mix composer with live preview (rec. 3); sample screen (login page + small dashboard) styled only through each direction's CSS variables. Not measured by `verify.mjs` (no gate score), so ARCH-VERIFY-18 is untouched.
- **docs** — README skills table row for `create`, CHANGELOG, a `plugin.rules.md` amendment (directions rule) and a `verify.rules.md` rule for the renderer.

**Second-order effects.** Adds one step (time + tokens) to `create` when opted in. The showcase direction pressures the gates (contrast, reduced motion, LCP/CLS), so the gates must be kept and the brief must carry its fallbacks. A specimen isn't the real page, so a direction that looks good on swatches can still fail on the real layout. Token-axis mixing is coherent; layout and component treatment are not mixable.

**Stack.** Node ESM `.mjs` scripts with `node --test` (`scripts/package.json`, ARCH-VERIFY-11); Markdown skills.

## Research
- **0xdesign design-and-refine**: infers style from existing tokens, interviews, 5 variants as working code on a temporary `/__design_lab` route, element-level feedback overlay, synthesis merges liked parts, temp files removed. https://raw.githubusercontent.com/0xdesign/design-plugin/main/README.md (README only, not tested).
- **Google AI Studio Design Variations**: side-by-side layouts, keeps logic, changes presentation; no combining; warns of an "average" aesthetic. https://pasqualepillitteri.it/en/news/6571/google-ai-studio-design-variations-en
- **Superdesign**: parallel variant generation. https://superdesign.dev/docs/features/design-agent/parallel-generation
- **Anthropic frontend-design skill**: commit to a bold direction (brutalist, luxury, retro-futuristic…), avoid Inter/purple-gradient defaults; critique: "vary between generations" can't work across isolated sessions, an explicit brief works better. https://wmedia.es/en/tips/claude-code-frontend-design-skill, https://scour.ing/@tyler/p/https://www.justinwetch.com/blog/improvingclaudefrontend (third-party mirrors; official wording unverified).
- **ui-ux-pro-max**: 50–67 style catalogue with palettes and font pairings (counts disagree between sources). https://www.mintlify.com/nextlevelbuilder/ui-ux-pro-max-skill
- **Homogenisation**: "productive friction": ask design assumptions, present contrasting alternatives, anchor to brand tokens. https://arxiv.org/html/2603.13036v1; DHI convergence metric https://arxiv.org/pdf/2607.22928
- **Effect risks**: glass over busy backgrounds often fails WCAG 4.5:1; `backdrop-filter` is costly on older devices. https://axesslab.com/?p=5111, https://blog.openreplay.com/create-glassmorphic-ui-css/
- **Exemplar** (user-supplied): the "Gleam" login page, a local Nuxt + Tailwind app at `http://localhost:3001/auth/login`. Its `entry.*.css` has 8 `radial-gradient`, Tailwind `backdrop-filter`, a custom `strata-cascade-in` keyframe and 4 `prefers-reduced-motion` guards: rich effects and reduced-motion fallbacks coexist. Not screenshotted (Playwright MCP had no Chrome).
- **Classifying a project's aesthetic**: no deterministic method found; LLM judgement only. UNPROVEN.

**Viable approaches.** (A) do nothing / opt-in UI/UX Pro; (B) written briefs in chat; (B+) briefs plus a deterministic token specimen (**chosen**); (C) each direction as a candidate `data-brand` theme on one real build, verified per theme; (D) N full builds plus council agents plus composer (0xdesign-like). B+ fits this codebase because tokens and themes are already the unit of design (ARCH-PLUGIN-35) and a renderer pattern already exists (`review-html.mjs`).

## Critique
- **Steelman.** LLM UI converges on safe defaults; today `create` can only polish the current look, never question it. Contrasting directions before building is the documented remedy, peer tools ship it, and artist already models exactly the axes being chosen (semantic tokens, themes).
- **Strongest case against.** Demand is UNPROVEN, and the full pitch breaks five decided rules, multiplies cost by N, fights the quality gates it would need to pass, and lands on files an in-flight plan owns.
- **Hidden assumptions.**
  - Users want to choose rather than receive one good output. Test: track picks over real uses; the share of picks that keep the current direction.
  - An LLM can name a project's aesthetic reliably. Test: classify 10 known sites twice in separate sessions; check agreement.
  - Directions stay distinct. Test: 4 isolated runs on one project; compare token deltas for overlap.
  - Showcase effects can pass axe, CWV and reduced motion. Test: build one glass + motion page and run `verify.mjs` on it.
  - Per-axis mixes are coherent. Test: mix two directions' tokens, run one critic pass on the built result.
- **Failure modes.** Directions converge on one aesthetic; mixed axes look incoherent; the ambitious pick fails the gates and burns all three rounds; specimen-vs-real-page gap; stale style vocabulary; leftover `.artist/directions/` dirs.
- **Kill criteria.** Users keep the current direction >70% of the time over several real uses; isolated runs produce heavily overlapping deltas; the ambitious direction fails axe/CWV/reduced-motion in most runs after 3 rounds; the step adds >30% to median `create` time or is routinely skipped; shipping would require weakening ARCH-PLUGIN-10/11 or the stop gates.
- **Cheaper alternatives.** Do nothing (install UI/UX Pro, write a bold brief by hand); written briefs only (B: cheapest, but drops the HTML the user asked for); theme-set rendering on the real page (C) as the follow-up.

## Disputed
- Critic: a composer page with script "cuts against ARCH-VERIFY-10". **Softened.** ARCH-VERIFY-10 explicitly allows inline CSS/JS and only forbids network requests (`docs/architecture/verify.rules.md:20`); `review-html.mjs:152` already ships inline JS. ARCH-PLUGIN-37's no-script rule governs only `design-system.html` (`plugin.rules.md:47`). The specimen page is a third artefact, so it needs its own rule, not an exception.
- Critic: smallest slice B (chat-only briefs) dominates. **Overridden by user answer.** B drops the HTML visualisation the user explicitly asked for; the user chose the token specimen (B+), which stays ~1× cost and rule-compatible.
- Critic: exemplar "could not be found". **Resolved.** The user supplied a local URL; evidence above.

## Recommendations
1. **Shape (confirmed): perspectives, not agents.** Write 3+ contrasting directions in-session from a named set of design schools; the critic stays single and isolated (ARCH-PLUGIN-09/10/11 unchanged). No per-direction critic calls.
2. **Every direction is a token delta.** Per axis (palette, type, spacing, radius/elevation, motion) as semantic-token values, so a pick becomes a theme set or token proposal that only `design-system` writes (ARCH-PLUGIN-14/35). Layout density and component treatment are whole-direction choices, not mixable axes.
3. **Deterministic specimen renderer.** `scripts/directions.mjs --in directions.json --out <dir>` renders every direction on the same static sample components (login card, form, button, card, nav) through CSS variables, and highlights cells that differ from the current concept. Escape everything, no network (ARCH-VERIFY-10). Reuse `design-md.mjs` for reading the current tokens. The page has three views (user request 2026-10-26):
   - **Final result per direction.** Each direction rendered as one complete sample screen (a login page plus a small dashboard: nav, card, form, buttons, states, light and dark), so every design can be judged as a finished whole, next to the *Current* design. A side-by-side grid and a one-at-a-time full-width view.
   - **Specimen.** Per-axis swatches, type ramp, spacing/radius/elevation and motion samples per direction, with differences from Current highlighted.
   - **Pick & mix (composer).** Choose a base direction (it sets layout density and component treatment, which are not mixable), then pick palette, type, spacing, shape/depth and motion each from any direction. A live preview renders the combined final result on the same sample screen, beside Current. It shows the token diff the mix would apply and the project-wide impact list (rec. 11) updated as you pick, then exports `pick.json`. Motion previews respect `prefers-reduced-motion`; a toggle previews the reduced-motion and reduced-transparency fallbacks.
   The sample screen is representative, not the project's real pages; seeing the pick on real pages is the deferred Alternative C (rec. 12), or the first `create` round after the pick is applied.
4. **Current concept with evidence.** Step 0 states the current aesthetic, citing DESIGN.md token rows and code `file:line`, labelled as a judgement, never a measured score (ARCH-VERIFY-18).
5. **One ambitious direction, same gates (confirmed).** Always include one showcase direction (gradients, layered/glass surfaces, rich entrance motion, as in the Gleam exemplar). Its brief must spell out contrast scrims, `prefers-reduced-motion` and `prefers-reduced-transparency` fallbacks and the LCP budget. The stop condition (ARCH-PLUGIN-24) is unchanged.
6. **Inside `create`, opt-in.** A reference pack `skills/create/references/directions.md` plus an optional step 0. No new skill (ARCH-PLUGIN-07) and no change to the default flow.
7. **Sequence after design-doc-uniformity.** Start once the `design-md` unit merges (parser to reuse) and `skill-create-optimise` merges (same SKILL.md files).
8. **Prove it with a spike first.** Run the step by hand on one real project (e.g. the Gleam app). Check that the directions are distinct, that the specimen reads clearly, and that the ambitious pick, once built, passes `verify.mjs`.
9. **Add an `evals/create` case** for the direction step (ARCH-PLUGIN-20).
10. **Fixed school list, no custom schools.** `directions.md` carries the 10 schools above as starting signatures; the step picks 3+ contrasting ones relative to the current concept, always including one ★. Adapting a school's token values to the project is allowed; inventing an eleventh school is not.
11. **Project-wide application with an impact list.** The specimen and the pick report which components each changed token reaches and every file that renders them, joined from `inventory.json` `tokensUsed` and `usage` (`scripts/inventory.mjs:189,223-237`). `design-system` applies the pick as one token diff to the current theme, shown and accepted first (ARCH-PLUGIN-38), so the same component changes identically on every page. Components that hard-code values instead of tokens will not follow. They are listed as "won't carry across" with `file:line` (from `reuse-check --all`: raw colours, `component_token_literals`) and must be tokenised before the pick is complete. This strengthens the dependency on design-doc-uniformity's Component tokens work.
12. **Defer** rendered real-page comparison (C) and any council of agents until kill-criteria data exists.

## Open questions
- How should directions be shown first? → **Token specimen HTML** (answered 2026-10-25).
- Over-design vs gates? → **One ambitious direction, same gates** (answered 2026-10-25).
- What is the "council"? → **Perspectives written in-session, not agents** (answered 2026-10-25).
- Exemplar? → **`http://localhost:3001/auth/login`** (the user's local "Gleam" Nuxt app) (answered 2026-10-25).
- Which design schools are offered? → **A fixed list of 10** (answered 2026-10-26), see *Design schools* below.
- Can users add their own school? → **No** (answered 2026-10-26).
- Where does a pick land? → **Project-wide, not per page** (answered 2026-10-26): every component the pick affects changes once, and the change carries across to the same component on every other page and wherever else it is used. So the pick edits the **current theme's** Semantic and Component tokens, not a new `data-brand` set; propagation is by CSS variables (ARCH-PLUGIN-26/35). Assumption: "workspace" means the whole project; artist has no multi-repo workspace concept (grep of `skills/`, `README.md`, `docs/architecture/*.rules.md`: no hit), so cross-repo propagation is out of scope.

### Design schools (fixed list)
Each is a per-axis token signature the direction step starts from; ★ marks the ones that usually fill the ambitious slot.

| # | school | palette | type | shape & depth | motion |
|---|---|---|---|---|---|
| 1 | Minimalist | near-monochrome, one accent | one sans, few sizes | flat, hairline borders | subtle fades |
| 2 | Swiss / International | high-contrast neutrals, one strong accent | grotesk, strict scale, grid-led | sharp corners, no shadow | almost none |
| 3 | Material (M3) | tonal palettes from a seed colour | Roboto-class sans, type roles | rounded, elevation tiers | standard easing, ripple/state layers |
| 4 | Flat | bright saturated solids | friendly sans | no shadow or gradient | quick, simple |
| 5 | Neumorphism (soft UI) | one muted base hue | soft sans | extruded/inset dual shadows | gentle press states (contrast risk: WCAG) |
| 6 | Glassmorphism ★ | translucent layers over vivid backdrop | clean sans | backdrop blur, light borders | parallax, depth shifts (needs reduced-transparency fallback) |
| 7 | Brutalist / Neo-brutalist | raw high-contrast, clashing accents | mono or system, oversized | thick borders, hard offset shadows, no radius | abrupt, none |
| 8 | Editorial | restrained, ink-on-paper | serif display + sans body, large scale | generous whitespace, rules | slow reveals |
| 9 | Retro-futurist / Cyberpunk ★ | dark base, neon accents | geometric or mono | glow, scanlines, angled cuts | glitch, flicker (reduced-motion fallback) |
| 10 | Aurora / gradient glow ★ | dark base, radial multi-hue gradients | modern sans | soft glows, glass cards | staggered cascade entrances (the Gleam exemplar) |

## Next step
`/architect design-directions`, after design-doc-uniformity's `design-md` and `skill-create-optimise` units merge.
