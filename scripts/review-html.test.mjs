import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { renderReview } from "./review-html.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n) => join(here, "fixtures", n);
const DIMS = [
  "Hierarchy",
  "Typography",
  "Spacing & rhythm",
  "Colour & contrast",
  "Distinctiveness",
  "Responsiveness",
  "Accessibility",
  "Motion",
];
const scores = Object.fromEntries(DIMS.map((d, i) => [d, (i % 5) + 1]));

function setup(withReuse) {
  const root = mkdtempSync(join(tmpdir(), "rh-"));
  const mk = (ts) => {
    const d = join(root, ts);
    mkdirSync(d);
    copyFileSync(fx("report.sample.json"), join(d, "report.json"));
    return d;
  };
  const a = mk("2026-01-01T00"),
    b = mk("2026-01-02T00");
  if (withReuse) copyFileSync(fx("reuse.sample.json"), join(b, "reuse.json"));
  return { root, a, b };
}
const rep = () => JSON.parse(readFileSync(fx("report.sample.json"), "utf8"));

test("every section heading present, slider labelled, no http src/href", () => {
  const { a, b } = setup(true);
  const html = renderReview({
    rounds: [
      { runDir: a, report: rep(), scores, isolated: false },
      { runDir: b, report: rep(), scores, critique: "ok" },
    ],
    outDir: b,
    tokenDiff: {
      added: [{ name: "--c", value: "#fff" }],
      removed: ["--old"],
      changed: [{ name: "--x", from: "1", to: "2" }],
    },
  });
  for (const h of [
    "Before / after",
    "Rubric",
    "Accessibility (axe)",
    "Core Web Vitals",
    "Token diff",
    "Reuse findings",
  ])
    assert.ok(html.includes(h), h);
  for (const d of DIMS) assert.ok(html.includes(d.replace("&", "&amp;")), d);
  assert.match(html, /NOT ISOLATED/);
  assert.match(html, /<label[^>]*for="[^"]+"/);
  assert.match(html, /<input[^>]*type="range"/);
  assert.ok(html.includes('src="../2026-01-01T00/375.png"'));
  assert.ok(html.includes('src="375.png"'));
  assert.ok(!/(?:src|href)\s*=\s*["']?http/i.test(html));
  assert.match(html, /prefers-color-scheme/);
  assert.match(html, /unstable/i);
  assert.ok(html.includes("--old") && html.includes("--x"));
});

test("violation text is escaped", () => {
  const { b } = setup(false);
  const html = renderReview({ rounds: [{ runDir: b, report: rep() }], outDir: b });
  assert.ok(!html.includes("<script>alert(1)"));
  assert.ok(html.includes("&lt;script&gt;alert(1)"));
});

test("reuse findings listed with state", () => {
  const { b } = setup(true);
  const html = renderReview({ rounds: [{ runDir: b, report: rep() }], outDir: b });
  for (const s of [
    "FancyCard",
    "no existing card fits",
    "SplitLayout",
    "#123456",
    "recharts",
    "chart.js",
    "unjustified",
  ])
    assert.ok(html.includes(s), s);
  assert.match(html, /\bjustified\b/);
});

test("reuse findings render spacing, motion, reduced motion, stale and near-duplicate categories escaped", () => {
  const { b } = setup(true);
  const html = renderReview({ rounds: [{ runDir: b, report: rep() }], outDir: b });
  for (const h of ["Raw spacing", "Raw motion", "Missing reduced motion", "Stale inventory", "Near-duplicates"])
    assert.ok(html.includes(`<h3>${h}</h3>`), h);
  for (const s of ["13px", "0.42s", "src/FadeIn.tsx", "OldBanner", "PriceCard", "PricingCard"])
    assert.ok(html.includes(s), s);
  assert.ok(!html.includes("<b>x</b>"));
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
});

test("a schema 3 reuse.json (with --all keys) renders the same reuse findings", () => {
  const { b } = setup(false);
  copyFileSync(fx("reuse/reuse.sample3.json"), join(b, "reuse.json"));
  const html = renderReview({ rounds: [{ runDir: b, report: rep() }], outDir: b });
  assert.ok(html.includes("Reuse findings"));
  for (const h of ["Raw spacing", "Raw motion", "Missing reduced motion", "Stale inventory", "Near-duplicates"])
    assert.ok(html.includes(`<h3>${h}</h3>`), h);
  for (const s of ["13px", "0.42s", "OldBanner", "PriceCard"]) assert.ok(html.includes(s), s);
  assert.ok(html.includes("Unjustified: 9"));
});

test("a schema 1 reuse.json without the new categories still renders", () => {
  const { b } = setup(false);
  writeFileSync(join(b, "reuse.json"), JSON.stringify({ schema: 1, new_components: [], unjustified: 0 }));
  const html = renderReview({ rounds: [{ runDir: b, report: rep() }], outDir: b });
  assert.ok(html.includes("Reuse findings"));
  assert.ok(!html.includes("Stale inventory"));
});

const good = () => ({
  schema: 1,
  url: "http://localhost:3000/",
  generated_at: "2026-10-25T00:00:00Z",
  breakpoints: [375],
  axe: { critical: 0, serious: 0, moderate: 0, minor: 0, violations: [] },
  cwv: { lcp_ms: 900, cls: 0.01, runs: 3, spread: 0.05, unstable: false },
  screenshots: { 375: "375.png" },
});
const fours = Object.fromEntries(DIMS.map((d) => [d, 4]));
const verdictOf = (html) => /Final verdict: <strong>([^<]+)<\/strong>/.exec(html)[1];

test("unknown LCP is a miss, never a pass", () => {
  const { b } = setup(false);
  const r = good();
  r.cwv.lcp_ms = null;
  const html = renderReview({
    rounds: [{ runDir: b, report: r, scores: Object.fromEntries(DIMS.map((d) => [d, 5])) }],
    outDir: b,
  });
  assert.equal(verdictOf(html), "NEEDS WORK");
});

test("final verdict mirrors the loop's stop condition", () => {
  const { b } = setup(false);
  const pass = renderReview({ rounds: [{ runDir: b, report: good(), scores: fours }], outDir: b });
  assert.equal(verdictOf(pass), "PASS");
  const slow = good();
  slow.cwv.lcp_ms = 3000;
  assert.equal(
    verdictOf(renderReview({ rounds: [{ runDir: b, report: slow, scores: fours }], outDir: b })),
    "NEEDS WORK",
  );
  const jumpy = good();
  jumpy.cwv.cls = 0.3;
  assert.equal(
    verdictOf(renderReview({ rounds: [{ runDir: b, report: jumpy, scores: fours }], outDir: b })),
    "NEEDS WORK",
  );
  const low = { ...fours, Motion: 3 };
  assert.equal(
    verdictOf(renderReview({ rounds: [{ runDir: b, report: good(), scores: low }], outDir: b })),
    "NEEDS WORK",
  );
  const withReuse = setup(true);
  assert.equal(
    verdictOf(renderReview({ rounds: [{ runDir: withReuse.b, report: good(), scores: fours }], outDir: withReuse.b })),
    "NEEDS WORK",
  );
});

test("before is the first round, after is the last", () => {
  const { root, a, b } = setup(false);
  const c = join(root, "2026-01-03T00");
  mkdirSync(c);
  copyFileSync(fx("report.sample.json"), join(c, "report.json"));
  const html = renderReview({
    rounds: [
      { runDir: a, report: rep() },
      { runDir: b, report: rep() },
      { runDir: c, report: rep() },
    ],
    outDir: c,
  });
  assert.ok(html.includes('src="../2026-01-01T00/375.png"'));
  assert.ok(!html.includes('src="../2026-01-02T00/375.png"'));
});

test("corrupt reuse.json is shown as unreadable and fails the verdict", async () => {
  const { b } = setup(false);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(b, "reuse.json"), "{not json");
  const html = renderReview({ rounds: [{ runDir: b, report: good(), scores: fours }], outDir: b });
  assert.match(html, /reuse\.json unreadable/);
  assert.equal(verdictOf(html), "NEEDS WORK");
});

test("violation targets are rendered and escaped", () => {
  const { b } = setup(false);
  const r = good();
  r.axe.serious = 1;
  r.axe.violations = [
    {
      id: "color-contrast",
      impact: "serious",
      help: "Contrast",
      nodes: 1,
      breakpoints: [375],
      targets: ["main > a.cta<x>"],
    },
  ];
  const html = renderReview({ rounds: [{ runDir: b, report: r }], outDir: b });
  assert.ok(html.includes("main &gt; a.cta&lt;x&gt;"));
});

test("CLI works when invoked through a symlinked directory", async () => {
  const { b, root } = setup(false);
  const { symlinkSync } = await import("node:fs");
  const link = join(root, "linked-scripts");
  symlinkSync(here, link);
  execFileSync("node", [join(link, "review-html.mjs"), b]);
  assert.ok(existsSync(join(b, "review.html")));
});

test("CLI one-round form writes review.html", () => {
  const { b } = setup(true);
  execFileSync("node", [join(here, "review-html.mjs"), b]);
  assert.ok(existsSync(join(b, "review.html")));
});

test("CLI --rounds form", () => {
  const { root, a, b } = setup(false);
  const out = join(root, "out");
  mkdirSync(out);
  const rj = join(root, "rounds.json");
  import("node:fs").then(() => {});
  return import("node:fs").then(({ writeFileSync }) => {
    writeFileSync(
      rj,
      JSON.stringify({
        rounds: [
          { runDir: a, scores },
          { runDir: b, scores },
        ],
        tokenDiff: { added: [], removed: [], changed: [] },
      }),
    );
    execFileSync("node", [join(here, "review-html.mjs"), "--rounds", rj, "--out", out]);
    const html = readFileSync(join(out, "review.html"), "utf8");
    assert.ok(html.includes('src="../2026-01-01T00/375.png"'));
  });
});
