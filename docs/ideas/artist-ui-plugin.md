---
slug: artist-ui-plugin
status: pursue-with-changes
verdict: pursue-with-changes
confidence: medium
depth: standard
isolation: isolated
created: 2026-10-25
updated: 2026-10-25
related: [../Craftsman/craftsman/docs/ideas/plugin-overhaul.md (Slice E), ../Craftsman/craftsman/agents/ui-ux-reviewer.md, ../Craftsman/craftsman/skills/design-review/SKILL.md, ../Craftsman/craftsman/scripts/agent-mode-guard.mjs]
touches: [.claude-plugin/plugin.json, .mcp.json, skills/**, commands/**, README.md, evals/**, docs/design/DESIGN.md (format, in target projects), ../Craftsman/craftsman/commands/_shared-execution.md (ui gate target, later), ../Craftsman/craftsman/craftsman.config.json (execution.builtinAgents, later), ../Craftsman/craftsman/EXTENDING.md, ../Craftsman/craftsman/docs/ideas/plugin-overhaul.md (retarget Slice E)]
---

# Idea: A separate UI/UX plugin that creates and verifies frontends alongside craftsman

## Proposal (neutral restatement)
**Problem.** craftsman can review a UI diff but cannot create UI or look at it
rendered. `skills/design-review/SKILL.md:9-11` states it "does not produce
mockups or new UI, only judges what's already there", and `ui-ux-reviewer` is
advisory-only (`commands/_shared-execution.md:33`). Nothing in the loop checks a
rendered page for layout, responsiveness, real-browser accessibility or Core Web
Vitals. Who hits it: the maintainer of both plugins, when building frontends.
Frequency: UNPROVEN (neither repo is a frontend).
**Claimed benefit.** Better-looking, faster, accessible UIs with less manual
prompting, in web and mobile projects.
**Who benefits.** The maintainer; anyone using craftsman on a frontend.
**Done.** An installable plugin (`artist`) that (a) records a project design
system, (b) generates UI that follows it, (c) verifies the result in a real
browser (breakpoint screenshots, axe a11y, a CWV trace), and (d) runs inside a
craftsman project without being blocked and without depending on craftsman.

## Verdict
**PURSUE-WITH-CHANGES** (medium). The gap is real and verified. The repo is empty
and the plugin can be uninstalled, so reversibility is high. The owner chose
scope and integration explicitly (see Open questions). The proposal as pitched
(an aggregator of 16 MCPs, with security in scope) would fail on cost, risk and
decay. The shape that survives is a **skills-and-commands plugin with no
subagents and at most 2 bundled, version-pinned MCPs**, scoped to create plus
verify. **The fact most likely to flip it:** the first-week spike (Anthropic's
`frontend-design` skill plus Playwright MCP, installed directly on one real page)
leaves no gap the owner can name. Then → DEFER.

| criterion | score 1–5 | evidence |
|---|---|---|
| value (problem is real and frequent) | 3 | gap verified at `design-review/SKILL.md:9-11`; frequency UNPROVEN, but the owner commits to web and mobile use |
| system fit (aligns with architecture + direction) | 3 | skills/MCP pass craftsman's guard (`hooks/hooks.json:11` matches only Task/Agent/Workflow); agents blocked (`agent-mode-guard.mjs:93-128`); overlaps unshipped Slice E (`plugin-overhaul.md:275-283`) |
| cost (build + maintain) — 5 = cheap | 3 | thin slice is small; mobile from day one and third-party MCP churn add ongoing upkeep |
| risk (blast radius, failure modes) — 5 = low | 3 | MCP supply chain (`npx @latest`), Next DevTools telemetry on by default, unverified "official" servers |
| reversibility — 5 = trivially undone | 5 | separate plugin in an empty repo; craftsman seam is config-level |
| evidence strength (research + repo proof) | 3 | repo claims verified; several MCP claims vendor-sourced or UNPROVEN |

## Overlap & prior work
- **Extends** craftsman `docs/ideas/plugin-overhaul.md:275-283` (Slice E: a
  `design-system` skill plus `/craftsman:design init|audit` writing
  `docs/design/DESIGN.md`, layering `frontend-design`, never vendoring its text).
  Unshipped: craftsman `skills/` holds only `design-review` among design items,
  and no plan or CHANGELOG entry exists.
- **Overlaps** `agents/ui-ux-reviewer.md` (haiku, ≤5 advisory findings, diff-only)
  and `skills/design-review/SKILL.md`. These are routed by `scripts/gate-select.mjs:37,80`
  and hard-mapped at `commands/_shared-execution.md:33`.
- **Conflicts (partial)** with `scripts/agent-mode-guard.mjs:93-128`. Under the
  default `root-only` mode (`craftsman.config.json:4`), any `artist:*` subagent is
  blocked unless listed in `execution.builtinAgents` (line 101-102).
- **Overlaps** craftsman `agents/security-auditor.md`, `dependency-auditor.md` and
  `performance-reviewer.md` on the "security/performance" part of the pitch.
- Artist repo: no `docs/ideas`, `docs/plans`, `docs/architecture`, CHANGELOG or
  README existed (no commits). Plan memory recall (`plan: artist-ui-plugin`,
  query "ui ux design plugin frontend") returned 0 records.

## System fit (whole project)
- **contract ripple** — the only cross-plugin contract is the craftsman seam: the
  `ui` gate target (`_shared-execution.md:33`) and the agent guard
  (`agent-mode-guard.mjs:101-102`). Skills-only v1 needs neither.
- **data** — N/A (no database; output is files in the target project).
- **config & flags** — `plugin.json` `userConfig` with `sensitive: true` for any
  opt-in API keys (21st, Figma, EAS), and per-MCP enable flags.
- **security** — bundled MCP servers run as local processes with project access.
  Pin versions (no `@latest`), set `NEXT_TELEMETRY_DISABLED=1` if Next DevTools is
  offered, and never put keys in `.mcp.json`. Frontend security review stays with
  craftsman's `security-auditor`.
- **tests** — none exist. Use `claude plugin validate --strict` and `claude plugin eval` cases.
- **observability** — N/A for v1 (advisory output only; no hooks).
- **UI** — the plugin's subject. Its output must not contradict `ui-ux-reviewer`
  on the same diff, so it reads the same `docs/design/DESIGN.md`.
- **docs** — new README (with opt-in MCP snippets), and EXTENDING notes in craftsman.

**Second-order effects.**
- Every bundled MCP starts in every project where the plugin is enabled, and its
  tool definitions cost tokens (deferred behind tool search, but not free).
- Two plugins writing design guidance split the source of truth unless one owns
  `DESIGN.md`.
- Mobile from day one doubles the guidance surface, and browser verification does
  not cover native screens.

**Stack.** Artist has no markers. craftsman is Node `.mjs` plus markdown; artist
should match (markdown skills, Node only if a helper script is needed).

## Research
- Plugin manifest: bundled `mcpServers`/`.mcp.json`, `dependencies`, `userConfig`
  (sensitive), skills, agents, `claude plugin validate` —
  https://code.claude.com/docs/en/plugins-reference
- UI/UX Pro MCP: MIT, ~40★, 19 commits, data based on `nextlevelbuilder/ui-ux-pro-max-skill`,
  self-inconsistent counts (1519 vs 1920 docs; 6 vs 12 tools) —
  https://github.com/redf0x1/ui-ux-pro-mcp
- Frontend Design Toolkit is a curated list (MIT, ~1.2k★). It advises only 3–5
  active MCPs. Top picks: `frontend-design`, ui-ux-pro-max, Taste Skill,
  `addyosmani/web-quality-skills`, Playwright MCP, Chrome DevTools MCP —
  https://github.com/wilwaldon/Claude-Code-Frontend-Design-Toolkit
- Next.js DevTools MCP (official; Next 16 `/_next/mcp`; telemetry on by default) —
  https://nextjs.org/docs/app/guides/mcp
- Chrome DevTools MCP: `performance_start_trace` gives LCP/CLS/FCP insights.
  Whether `lighthouse_audit` includes performance: sources disagree, UNPROVEN —
  https://savvy.co.il/en/blog/wordpress-speed/chrome-devtools-mcp-lighthouse-audits/
- Deque axe MCP: commercial (axe DevTools) — https://www.deque.com/Axe/mcp-server/ .
  Free alternative: axe-core run through Playwright (UNPROVEN as packaged MCP).
- shadcn MCP on mcp.so is a community "Registry Manager", not first-party —
  https://mcp.so/servers/shadcn-registry-manager (official: UNPROVEN)
- 21st MCP (renamed from Magic) needs an API key —
  https://docsearch.algolia.com/mcp/docs/repo/21st-dev/magic-mcp
- GSAP skills official, MIT — https://github.com/greensock/gsap-skills ; Flowbite MCP
  official — https://mcpservers.org/en/servers/themesberg/flowbite-mcp ; Expo MCP
  official, remote, some tools need a paid EAS plan — https://docs.expo.dev/mcp/
- Motion MCP: community only (official UNPROVEN). Inkscape, Mermaid, DuckDB
  dataviz MCPs and Callstack gesture skills: not verified.
- MCP token cost (vendor source, non-Claude tokenizer): median ~1.9k tokens/server —
  https://policylayer.com/token-cost
- No listed tool covers frontend security (CSP, XSS sinks).

**Approaches.**

| | approach | assessment |
|---|---|---|
| A | aggregator of 16 MCPs | reject |
| B-thin | skills/commands plus ≤2 MCPs | **chosen** |
| C | Slice E inside craftsman | rejected by owner: wants an independent plugin |
| D | do nothing: install `frontend-design` + Playwright MCP per project | the baseline to beat |

## Critique
- **Steelman** — the loop can judge UI but never sees it rendered. A separate
  plugin keeps heavy, fast-changing browser and MCP tooling out of craftsman's
  budgeted always-on context (craftsman `EXTENDING.md` ~376,
  `scripts/doc-size-policy.mjs`), and it works without craftsman.
- **Strongest case against** — no frontend exists yet to prove the need. The
  thin version was already designed as Slice E, and option D delivers roughly 80%
  of "create plus see it" at zero build cost.
- **Hidden assumptions**
  - The owner builds frontends soon. Test: name the first project.
  - Headless traces are stable. Test: 3 runs, compare LCP/CLS variance.
  - Skills-only artist passes craftsman's `pre-guard.mjs`. Test: run a stub skill
    plus Playwright MCP in a craftsman project.
  - Option D falls short. Test: try it on one real page.
- **Failure modes**
  - Artist agents silently blocked in craftsman projects.
  - Duplicate or contradictory review with `ui-ux-reviewer`.
  - MCP supply chain or key leakage.
  - Stale or broken MCP versions.
  - Mobile guidance rotting faster than web.
- **Kill criteria**
  - The option-D spike leaves no nameable gap.
  - Headless trace variance above ~20% between identical runs.
  - More than 3 bundled MCPs needed for "done".
  - Integration needs craftsman guard *code* changes beyond config entries and the
    ui-gate mapping.
- **Cheaper alternatives** — D (do nothing beyond installing two existing tools);
  C (Slice E in craftsman); B-thin (chosen).

## Disputed
- **Critic: value 2, "no frontend exists in either repo".** Softened to 3. The two
  repos are the plugins themselves, so their contents say nothing about the
  owner's other projects. The owner chose web plus mobile from day one, which
  signals intent. Frequency stays UNPROVEN, and the spike is required before
  building past it.
- **Critic: headless Chrome may be missing on this atomic host (`/var/home`).**
  Softened. The host is Aurora (Kinoite variant, `/etc/os-release`), but
  Playwright's `chromium-1234` and `chromium_headless_shell-1234` are already in
  `~/.cache/ms-playwright`. Still worth confirming the MCP launches.
- **Critic: verdict DEFER.** Changed to PURSUE-WITH-CHANGES. The owner's explicit
  scope and integration answers, high reversibility, and a cheap first-week spike
  that can still trigger DEFER make building the thin slice the better call.
  Critic's kill criteria are adopted unchanged.

## Recommendations
1. **Spike first (≤1 day).** Install `frontend-design` plus `@playwright/mcp` on one
   real web page and one Expo screen. Write down exactly what is missing. Build
   only that.
2. **Skills and commands only, no subagents, no hooks in v1.** This passes
   craftsman's guard unchanged (`hooks/hooks.json:11`) and cannot collide with its
   hooks. Proposed commands: `/artist:design init|audit`, `/artist:create`,
   `/artist:verify <url>`.
3. **Own `docs/design/DESIGN.md`** in the Slice E format (`plugin-overhaul.md:278`),
   so `ui-ux-reviewer` and artist read one source of truth. Retarget craftsman's
   Slice E to "consume artist's DESIGN.md".
4. **Bundle at most 2 MCPs, version-pinned:** Playwright (screenshots, breakpoints,
   axe-core injection) and Chrome DevTools (CWV trace). Ship the rest (Next DevTools
   with telemetry off, Expo, Flowbite, GSAP, shadcn, 21st, UI/UX Pro) as opt-in
   README snippets. Drop Inkscape, DuckDB and Mermaid from v1.
5. **Mobile as a skill pack, not a verification path.** Keep one shared design
   system with platform-specific guidance (React Native accessibility props, safe
   areas, Expo MCP opt-in). v1 verifies mobile only via Expo web or manual
   screenshots.
6. **Narrow "security" and "performance".** Artist measures performance (CWV,
   bundle weight) and flags UI-level security smells, then defers to craftsman's
   `security-auditor`/`performance-reviewer`/`dependency-auditor` rather than
   duplicating them.
7. **Craftsman seam (owner-approved, sequenced last):** only when an artist agent
   proves necessary.
   - Add it to a project's `execution.builtinAgents`. This is config only, but that
     list's contract is "read-only", so the agent must be too.
   - Make the `ui` gate's target agent configurable at `_shared-execution.md:33`.
8. **`claude plugin validate --strict` plus `claude plugin eval` cases from day one.**

## Open questions
- Platforms for v1? → **Web plus mobile from day one** (owner, 2026-10-25). Applied:
  mobile as a guidance pack (rec. 5); cost score held at 3.
- MCP strategy? → **Thin core plus opt-in** (owner). Applied: rec. 4.
- craftsman integration? → **Small seam in craftsman** (owner). Applied: rec. 7,
  config-level and sequenced after v1.
- Workspace manifest linking Artist and craftsman? → **Yes** (owner), after this doc.
- Still open: which real frontend project hosts the spike, and when?

## Next step
`/architect artist-ui-plugin --deep` (cross-plugin seam with craftsman), after the
recommendation-1 spike.
