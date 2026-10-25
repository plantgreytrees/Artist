import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkReuse } from "./reuse-check.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = join(here, "fixtures", "reuse");
const read = (p) => readFileSync(join(fx, p), "utf8");
const changed = [
  "src/components/PriceCard.tsx",
  "src/app/pricing/layout.tsx",
  "src/app/pricing/page.tsx",
  "package.json",
];
const files = changed.map((path) => ({ path, content: read(path) }));
const designMd = read("DESIGN.md");
const justifications = JSON.parse(read("justifications.json"));
const run = () => checkReuse({ designMd, files, justifications });

test("new component and date-fns are justified", () => {
  const r = run();
  const c = r.new_components.find((x) => x.name === "PriceCard");
  assert.equal(c.justified, true);
  assert.equal(c.reason, "no existing card component");
  assert.equal(
    r.new_components.some((x) => x.name === "Button"),
    false,
  );
  const d = r.new_packages.find((x) => x.name === "date-fns");
  assert.equal(d.justified, true);
  assert.equal(d.duplicates, undefined);
});

test("layout, raw colours and recharts are unjustified", () => {
  const r = run();
  const l = r.new_layouts.find((x) => x.file === "src/app/pricing/layout.tsx");
  assert.equal(l.justified, false);
  const vals = r.raw_colours.map((x) => x.value).sort();
  assert.deepEqual(vals, ["#1d6b4f", "#7b5cff", "#ff0000"]);
  assert.ok(r.raw_colours.every((x) => !x.justified && x.file && x.line > 0));
  const rc = r.new_packages.find((x) => x.name === "recharts");
  assert.equal(rc.justified, false);
  assert.equal(rc.duplicates, "chart.js");
  assert.equal(
    r.new_packages.some((x) => x.name === "chart.js"),
    false,
  );
  assert.equal(r.unjustified, 6);
  assert.equal(r.schema, 3);
});

test("a colour equal to a token value is reported outside token files (strict)", () => {
  const r = run();
  assert.ok(r.raw_colours.some((x) => x.value === "#1d6b4f" && x.file === "src/app/pricing/page.tsx"));
});

test("the same hex inside the declared token file is not reported", () => {
  const r = checkReuse({
    designMd,
    files: [{ path: "src/styles/tokens.css", content: read("src/styles/tokens.css") }],
  });
  assert.deepEqual(r.raw_colours, []);
  assert.deepEqual(r.raw_spacing, []);
  assert.deepEqual(r.raw_motion, []);
});

const one = (path, content) => checkReuse({ designMd, files: [{ path, content }] });

test("off-scale spacing in CSS and Tailwind arbitrary values is raw_spacing", () => {
  const r = one("src/a.tsx", 'const s = { padding: "13px" }; const c = "p-[13px] md:gap-[0.8125rem]";');
  assert.deepEqual(r.raw_spacing.map((x) => x.value).sort(), ["0.8125rem", "13px"]);
  assert.ok(r.raw_spacing.every((x) => !x.justified && x.file === "src/a.tsx" && x.line === 1));
  const css = one("src/a.css", ".a{ padding: 13px 16px; margin-top: 7px }");
  assert.deepEqual(css.raw_spacing.map((x) => x.value).sort(), ["13px", "7px"]);
});

test("on-scale spacing is not reported", () => {
  const r = one(
    "src/a.tsx",
    'const s = { padding: "16px", gap: 8 }; const c = "p-4 p-[16px] m-[2rem] mt-0"; const w = "w-[13px]";',
  );
  assert.deepEqual(r.raw_spacing, []);
});

test("raw durations and unknown easings are raw_motion; token values are not", () => {
  const r = one(
    "src/a.css",
    ".a{ transition: opacity 0.42s ease; animation-duration: 420ms; transition-timing-function: cubic-bezier(0.1, 0.9, 0.2, 1) }\n@media (prefers-reduced-motion: reduce){.a{transition:none}}",
  );
  assert.deepEqual(r.raw_motion.map((x) => x.value).sort(), ["0.42s", "420ms", "cubic-bezier(0.1,0.9,0.2,1)"].sort());
  const ok = one(
    "src/a.css",
    ".a{ transition: opacity 300ms cubic-bezier(0.2,0,0,1); transition-duration: 150ms }\n@media (prefers-reduced-motion: reduce){.a{transition:none}}",
  );
  assert.deepEqual(ok.raw_motion, []);
  const js = one("src/a.tsx", "const t = { duration: 0.42 }; const u = 'duration-[420ms]'; // useReducedMotion");
  assert.equal(js.raw_motion.length, 2);
});

test("animation without a reduced-motion fallback is flagged", () => {
  const r = checkReuse({
    designMd,
    files: [{ path: "src/components/FadeIn.tsx", content: read("src/components/FadeIn.tsx") }],
    justifications,
  });
  assert.ok(r.missing_reduced_motion.some((x) => x.file === "src/components/FadeIn.tsx" && !x.justified));
  assert.ok(r.raw_motion.some((x) => x.value === "0.42s"));
  for (const sig of [
    "const r = useReducedMotion();",
    "className='motion-reduce:transition-none'",
    "@media (prefers-reduced-motion: reduce) {}",
    "className='motion-safe:animate-spin'",
  ]) {
    const ok = one("src/b.tsx", `<motion.div animate={{x:1}} />\n${sig}`);
    assert.deepEqual(ok.missing_reduced_motion, [], sig);
  }
  assert.deepEqual(one("src/c.tsx", "export const c = 1;").missing_reduced_motion, []);
  for (const code of [
    "gsap.to(a, {x:1})",
    "Animated.timing(v)",
    "withTiming(1)",
    "@keyframes spin{}",
    "animation: spin 1s",
  ])
    assert.equal(one("src/d.ts", code).missing_reduced_motion.length, 1, code);
});

const fixtureInventory = () => JSON.parse(read("docs/design/inventory.json"));
const pricingCard = {
  path: "src/components/PricingCard.tsx",
  content:
    "type PricingCardProps = { price: string; period: string };\nexport function PricingCard({ price, period }: PricingCardProps) { return <div>{price}/{period}</div>; }\n",
};
const allFiles = () => [
  ...[...changed, "src/components/Button.tsx", "src/components/FadeIn.tsx", "src/styles/tokens.css"].map((path) => ({
    path,
    content: read(path),
  })),
  pricingCard,
];

test("--all adds stale inventory and near-duplicates; default mode does not", () => {
  const r = checkReuse({ designMd, files: allFiles(), justifications, all: true, inventory: fixtureInventory() });
  assert.ok(
    r.stale_inventory.some((x) => x.name === "OldBanner" && x.file === "src/components/OldBanner.tsx" && !x.justified),
  );
  assert.equal(
    r.stale_inventory.some((x) => x.name === "Button"),
    false,
  );
  const d = r.near_duplicates.find((x) => x.name === "PriceCard");
  assert.ok(d, "PriceCard near-duplicates PricingCard");
  assert.deepEqual([].concat(d.duplicates), ["PricingCard"]);
  assert.equal(d.file, "src/components/PriceCard.tsx");
  assert.ok(
    r.near_duplicates.some((x) => x.name === "PricingCard"),
    "pairwise: both sides are reported",
  );
  const plain = checkReuse({ designMd, files: allFiles(), justifications });
  assert.equal(plain.stale_inventory, undefined);
  assert.equal(plain.near_duplicates, undefined);
});

test("same component name at a different path is a near-duplicate", () => {
  const hero = "export function Hero() { return null; }";
  const r = checkReuse({
    designMd,
    files: [
      { path: "src/components/Hero.tsx", content: hero },
      { path: "src/ui/Hero.tsx", content: hero },
    ],
    all: true,
    inventory: { components: [] },
  });
  assert.ok(r.near_duplicates.some((x) => x.name === "Hero" && x.file === "src/ui/Hero.tsx"));
});

test("format 1 DESIGN.md exits 2 with an instruction", () => {
  const p = mkdtempSync(join(tmpdir(), "fmt1-"));
  writeFileSync(join(p, "DESIGN.md"), designMd.replace("format: 2", "format: 1"));
  const { res } = runCli(join(here, "reuse-check.mjs"), p, ["--files", "x.tsx"]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /format 2.*design-system init/);
});

test("CLI --all scans every file and writes schema 2 with the new categories", () => {
  const { p, commit } = mkRepo();
  spawnSync("cp", ["-r", fx + "/.", p]);
  writeFileSync(join(p, "src/components/PricingCard.tsx"), pricingCard.content);
  commit();
  writeFileSync(join(p, "src/untracked.tsx"), "export const x = <p style={{color:'#abcdef'}} />;\n");
  mkdirSync(join(p, "node_modules/foo"), { recursive: true });
  writeFileSync(join(p, "node_modules/foo/i.js"), "const c='#999999'");
  const { res, out } = runCli(join(here, "reuse-check.mjs"), p, ["--all"]);
  assert.equal(res.status, 1, res.stderr);
  const j = JSON.parse(readFileSync(join(out, "reuse.json"), "utf8"));
  assert.equal(j.schema, 3);
  assert.ok(j.raw_colours.some((x) => x.value === "#abcdef"));
  assert.equal(
    j.raw_colours.some((x) => x.value === "#999999"),
    false,
  );
  assert.ok(j.missing_reduced_motion.some((x) => x.file === "src/components/FadeIn.tsx"));
  assert.ok(j.stale_inventory.some((x) => x.name === "OldBanner"));
  assert.ok(j.near_duplicates.some((x) => x.name === "PriceCard"));
});

function cli(project, extra = []) {
  const out = mkdtempSync(join(tmpdir(), "reuse-"));
  const res = spawnSync(
    process.execPath,
    [join(here, "reuse-check.mjs"), "--project", project, "--run", out, "--files", changed.join(","), ...extra],
    { encoding: "utf8" },
  );
  return { res, out };
}

test("CLI exits 1 and writes reuse.json with schema 2", () => {
  const { res, out } = cli(fx, ["--justifications", join(fx, "justifications.json")]);
  assert.equal(res.status, 1, res.stderr);
  const j = JSON.parse(readFileSync(join(out, "reuse.json"), "utf8"));
  assert.equal(j.schema, 3);
  assert.equal(j.unjustified, 6);
});

test("CLI exits 0 when everything is justified", () => {
  const all = {
    ...justifications,
    "src/app/pricing/layout.tsx": "x",
    "#7b5cff": "x",
    "#ff0000": "x",
    "#1d6b4f": "x",
    "13px": "x",
    recharts: "x",
  };
  const jf = join(mkdtempSync(join(tmpdir(), "just-")), "justifications.json");
  writeFileSync(jf, JSON.stringify(all));
  const { res, out } = cli(fx, ["--justifications", jf]);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(JSON.parse(readFileSync(join(out, "reuse.json"), "utf8")).unjustified, 0);
});

test("missing DESIGN.md exits 2", () => {
  const empty = mkdtempSync(join(tmpdir(), "nodesign-"));
  const { res } = cli(empty);
  assert.equal(res.status, 2);
});

test("without --files, untracked new files are checked too", () => {
  const p = mkdtempSync(join(tmpdir(), "untracked-"));
  const git = (...args) => spawnSync("git", ["-C", p, ...args], { encoding: "utf8" });
  git("init", "-q");
  writeFileSync(join(p, "DESIGN.md"), designMd);
  git("add", "DESIGN.md");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "base");
  spawnSync("mkdir", ["-p", join(p, "src/components")]);
  writeFileSync(join(p, "src/components/PriceCard.tsx"), read("src/components/PriceCard.tsx"));
  const out = mkdtempSync(join(tmpdir(), "reuse-"));
  const res = spawnSync(process.execPath, [join(here, "reuse-check.mjs"), "--project", p, "--run", out], {
    encoding: "utf8",
  });
  assert.equal(res.status, 1, res.stderr);
  const j = JSON.parse(readFileSync(join(out, "reuse.json"), "utf8"));
  assert.ok(j.new_components.some((x) => x.name === "PriceCard"));
});

test("bad JSON exits 2", () => {
  const p = mkdtempSync(join(tmpdir(), "badjson-"));
  writeFileSync(join(p, "DESIGN.md"), designMd);
  writeFileSync(join(p, "package.json"), "{nope");
  const out = mkdtempSync(join(tmpdir(), "reuse-"));
  const res = spawnSync(
    process.execPath,
    [join(here, "reuse-check.mjs"), "--project", p, "--run", out, "--files", "package.json"],
    { encoding: "utf8" },
  );
  assert.equal(res.status, 2);
  assert.equal(existsSync(join(out, "reuse.json")), false);
});

const mkRepo = () => {
  const p = mkdtempSync(join(tmpdir(), "repo-"));
  const git = (...args) => spawnSync("git", ["-C", p, ...args], { encoding: "utf8" });
  git("init", "-q");
  return {
    p,
    git,
    commit: () => {
      git("add", "-A");
      git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "c");
    },
  };
};
const runCli = (script, project, extra = []) => {
  const out = mkdtempSync(join(tmpdir(), "reuse-"));
  const res = spawnSync(process.execPath, [script, "--project", project, "--run", out, ...extra], { encoding: "utf8" });
  return { res, out };
};

test("W1: project in a monorepo subdirectory sees edited committed files", () => {
  const { p, commit } = mkRepo();
  const web = join(p, "mono", "web");
  mkdirSync(join(web, "src/components"), { recursive: true });
  writeFileSync(join(web, "DESIGN.md"), designMd);
  writeFileSync(join(web, "src/components/Button.tsx"), "export const Button = () => null;\n");
  commit();
  writeFileSync(
    join(web, "src/components/Button.tsx"),
    "export const Button = () => <p style={{color:'#123456'}} />;\n",
  );
  const { res, out } = runCli(join(here, "reuse-check.mjs"), web);
  assert.equal(res.status, 1, res.stderr);
  const j = JSON.parse(readFileSync(join(out, "reuse.json"), "utf8"));
  assert.ok(j.raw_colours.some((x) => x.value === "#123456"));
});

test("deleted tracked file is not an error", () => {
  const { p, commit } = mkRepo();
  writeFileSync(join(p, "DESIGN.md"), designMd);
  writeFileSync(join(p, "gone.txt"), "x");
  commit();
  rmSync(join(p, "gone.txt"));
  const { res } = runCli(join(here, "reuse-check.mjs"), p);
  assert.equal(res.status, 0, res.stderr);
});

test("unreadable listed file exits 2 naming it", () => {
  const p = mkdtempSync(join(tmpdir(), "unread-"));
  writeFileSync(join(p, "DESIGN.md"), designMd);
  const { res } = runCli(join(here, "reuse-check.mjs"), p, ["--files", "nope.tsx"]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /nope\.tsx/);
});

test("W2: CLI through a symlinked directory still runs", () => {
  const link = join(mkdtempSync(join(tmpdir(), "lnk-")), "scripts-link");
  symlinkSync(here, link);
  const { res, out } = runCli(join(link, "reuse-check.mjs"), fx, [
    "--files",
    changed.join(","),
    "--justifications",
    join(fx, "justifications.json"),
  ]);
  assert.equal(res.status, 1, res.stderr);
  assert.ok(existsSync(join(out, "reuse.json")));
});

test("W4: .artist/** and binary files are not scanned", () => {
  const { p, commit } = mkRepo();
  writeFileSync(join(p, "DESIGN.md"), designMd);
  commit();
  mkdirSync(join(p, ".artist/runs/x"), { recursive: true });
  writeFileSync(join(p, ".artist/runs/x/375.png"), randomBytes(4096));
  writeFileSync(join(p, ".artist/runs/x/review.html"), "<p style='color:#abcdef'>");
  writeFileSync(join(p, "shot.png"), randomBytes(4096));
  const { res, out } = runCli(join(here, "reuse-check.mjs"), p);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(JSON.parse(readFileSync(join(out, "reuse.json"), "utf8")).raw_colours.length, 0);
});

test("S6: href anchors and var() colour functions are not colours", () => {
  const r = checkReuse({
    designMd,
    files: [
      {
        path: "src/a.css",
        content: 'a{color:hsl(var(--primary))}\n<a href="#feed"></a><a href=#bead></a><b id="#abc"></b>',
      },
    ],
  });
  assert.deepEqual(r.raw_colours, []);
});

// ---- fix2-scan: whole-project audit over a real git repo ----
const AUDIT = join(here, "fixtures", "audit");
const INV = join(here, "inventory.mjs");
const gitCommit = (git) => {
  git("add", "-A");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "c");
};
const auditRepo = ({ only, ignore } = {}) => {
  const { p, git } = mkRepo();
  if (only)
    for (const f of only) {
      mkdirSync(dirname(join(p, f)), { recursive: true });
      writeFileSync(join(p, f), readFileSync(join(AUDIT, f)));
    }
  else spawnSync("cp", ["-r", AUDIT + "/.", p]);
  if (ignore) writeFileSync(join(p, ".gitignore"), ignore);
  gitCommit(git);
  return { p, git };
};
const inventory = (p) => spawnSync(process.execPath, [INV, "--project", p], { encoding: "utf8" });
const reuseAll = (p) => {
  const { res, out } = runCli(join(here, "reuse-check.mjs"), p, ["--all"]);
  const f = join(out, "reuse.json");
  return { res, j: existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null };
};

test("W1: after inventory, --all reports same-name and prop-overlap near-duplicates", () => {
  const { p } = auditRepo();
  assert.equal(inventory(p).status, 0);
  const { res, j } = reuseAll(p);
  assert.equal(res.status, 1, res.stderr);
  const files = j.near_duplicates.map((x) => x.file);
  assert.ok(
    files.includes("src/components/Hero.tsx") && files.includes("src/ui/Hero.tsx"),
    JSON.stringify(j.near_duplicates),
  );
  const banner = j.near_duplicates.find((x) => x.name === "Banner");
  assert.deepEqual([].concat(banner.duplicates), ["Promo"]);
  assert.ok(j.near_duplicates.some((x) => x.name === "Promo"));
  assert.deepEqual(j.stale_inventory, []);
});

test("W1: an inventoried file that was deleted is stale; a fresh inventory has none", () => {
  const { p } = auditRepo();
  assert.equal(inventory(p).status, 0);
  assert.deepEqual(reuseAll(p).j.stale_inventory, []);
  rmSync(join(p, "src/components/Promo.tsx"));
  const { j } = reuseAll(p);
  assert.deepEqual(
    j.stale_inventory.map((x) => x.file),
    ["src/components/Promo.tsx"],
  );
  assert.equal(
    j.near_duplicates.some((x) => x.name === "Banner"),
    false,
  );
});

test("W3: a tracked file deleted without staging does not make --all or inventory exit 2", () => {
  const { p } = auditRepo();
  rmSync(join(p, "src/ui/Hero.tsx"));
  assert.equal(inventory(p).status, 0);
  const { res, j } = reuseAll(p);
  assert.ok(res.status === 0 || res.status === 1, res.stderr);
  assert.ok(j);
});

test("W4: markdown, svg and docs/design/** are not scanned", () => {
  const { p, git } = auditRepo({ only: ["DESIGN.md", "NOTES.md", "public/logo.svg", "src/styles/tokens.css"] });
  mkdirSync(join(p, "docs/design"), { recursive: true });
  writeFileSync(join(p, "docs/design/consistency.md"), "# Consistency\n\n#abcdef at 13px, transition: all 0.42s\n");
  writeFileSync(join(p, "docs/design/extra.css"), "a{color:#abcdef;padding:13px}");
  gitCommit(git);
  const { res, j } = reuseAll(p);
  assert.equal(res.status, 0, res.stderr);
  for (const k of ["raw_colours", "raw_spacing", "raw_motion", "missing_reduced_motion"]) assert.deepEqual(j[k], [], k);
});

test("W5: git-ignored build output is neither inventoried nor flagged", () => {
  const { p } = auditRepo({ ignore: "dist/\n" });
  mkdirSync(join(p, "dist"), { recursive: true });
  writeFileSync(join(p, "dist/Foo.tsx"), "export function Foo() { return <i style={{color:'#abcdef'}} />; }\n");
  assert.equal(inventory(p).status, 0);
  const inv = JSON.parse(readFileSync(join(p, "docs/design/inventory.json"), "utf8"));
  assert.equal(
    inv.components.some((c) => c.name === "Foo"),
    false,
  );
  const { j } = reuseAll(p);
  assert.equal(JSON.stringify(j).includes("dist/Foo.tsx"), false);
  assert.equal(JSON.stringify(j).includes("#abcdef"), false);
});

test("S6: Unparsed rows are not read as packages", () => {
  const md =
    "---\nformat: 2\n---\n## Packages\n| package | version | capability |\n|---|---|---|\n| lucide-react | 1 | icons |\n\n## Unparsed\n| path | reason |\n|---|---|\n| d3 | invalid JSON |\n";
  const r = checkReuse({
    designMd: md,
    files: [{ path: "package.json", content: '{"dependencies":{"recharts":"1"}}' }],
  });
  assert.equal(r.new_packages[0].duplicates, undefined);
});

test("thin wrappers sharing only children are not near-duplicates", () => {
  const designMd = readFileSync(join(here, "fixtures/reuse/DESIGN.md"), "utf8");
  const files = [
    {
      path: "src/components/Card.tsx",
      content:
        "type CardProps = { children: React.ReactNode };\nexport function Card({ children }: CardProps) { return <div>{children}</div>; }\n",
    },
    {
      path: "src/components/Panel.tsx",
      content:
        "type PanelProps = { children: React.ReactNode };\nexport function Panel({ children }: PanelProps) { return <section>{children}</section>; }\n",
    },
    {
      path: "src/components/Box.tsx",
      content:
        "type BoxProps = { children: React.ReactNode; className?: string };\nexport function Box({ children, className }: BoxProps) { return <div className={className}>{children}</div>; }\n",
    },
    {
      path: "src/components/Frame.tsx",
      content:
        "type FrameProps = { children: React.ReactNode; className?: string };\nexport function Frame({ children, className }: FrameProps) { return <section className={className}>{children}</section>; }\n",
    },
  ];
  const r = checkReuse({ designMd, files, all: true, inventory: { components: [], layouts: [], schemas: [] } });
  assert.deepEqual(r.near_duplicates, []);
});

test("components sharing a single meaningful prop are not near-duplicates", () => {
  const designMd = readFileSync(join(here, "fixtures/reuse/DESIGN.md"), "utf8");
  const files = [
    {
      path: "src/components/Price.tsx",
      content:
        "type PriceProps = { price: string };\nexport function Price({ price }: PriceProps) { return <span>{price}</span>; }\n",
    },
    {
      path: "src/components/Cost.tsx",
      content:
        "type CostProps = { price: string };\nexport function Cost({ price }: CostProps) { return <b>{price}</b>; }\n",
    },
  ];
  const r = checkReuse({ designMd, files, all: true, inventory: { components: [], layouts: [], schemas: [] } });
  assert.deepEqual(r.near_duplicates, []);
});

test("--all finds near-duplicate Vue components under their Nuxt names", () => {
  const sfc = '<script setup lang="ts">\ndefineProps<{ title: string; price: string; cta?: string }>()\n</script>\n';
  const files = [
    { path: "package.json", content: '{"dependencies":{"nuxt":"3"}}' },
    { path: "components/pricing/Card.vue", content: sfc },
    { path: "components/shop/PriceTile.vue", content: sfc },
  ];
  const r = checkReuse({ designMd, files, all: true, inventory: { components: [], layouts: [], schemas: [] } });
  assert.deepEqual(
    r.near_duplicates.map((d) => [d.name, [].concat(d.duplicates)]),
    [
      ["PricingCard", ["ShopPriceTile"]],
      ["ShopPriceTile", ["PricingCard"]],
    ],
  );
});

test("a Nuxt layouts/*.vue file missing from DESIGN.md is a new layout", () => {
  const r = one("layouts/marketing.vue", "<template><slot/></template>\n");
  assert.deepEqual(
    r.new_layouts.map((x) => x.name),
    ["layouts/marketing.vue"],
  );
});

// ---- schema 3: ratios (ARCH-VERIFY-22) ----
const R_KEYS = ["ratios", "component_token_literals", "off_token_classes", "prop_synonyms"];
const CAT = ["colours", "spacing", "motion", "reduced_motion", "component_tokens", "component_api"];
const noInv = { components: [], layouts: [], schemas: [] };
const withSection = (extra) => designMd.replace("\n## Platform notes", `\n${extra}\n## Platform notes`);
const btn = (name, size, extra = "") =>
  `type ${name}Props = { size: ${size.map((s) => `"${s}"`).join(" | ")}; ${extra} };\nexport function ${name}({ size }: ${name}Props) { return <b className="bg-action" />; }\n`;
const comp = (name, content) => ({ path: `src/components/${name}.tsx`, content });
const all = (files, md = designMd, justs = {}) =>
  checkReuse({ designMd: md, files, justifications: justs, all: true, inventory: noInv });
const sumOk = (r) => {
  for (const k of CAT) {
    const x = r.ratios[k];
    assert.deepEqual(Object.keys(x), ["conforming", "justified", "unjustified", "total"], k);
    assert.equal(x.conforming + x.justified + x.unjustified, x.total, k);
  }
};

test("schema 3: default mode has none of the --all keys", () => {
  const r = one("src/a.tsx", "const a = 1;");
  assert.equal(r.schema, 3);
  for (const k of R_KEYS) assert.equal(Object.hasOwn(r, k), false, k);
  assert.equal(Object.hasOwn(all([]), "ratios"), true);
});

test("--all ratios: sum invariant per category; justification never makes an item conforming", () => {
  const files = [
    {
      path: "src/a.tsx",
      content:
        'const a = { color: "var(--color-action-primary)", padding: "13px", transition: "opacity 150ms var(--motion-fast)" };\nconst b = "#ff0000";\nconst c = "p-2";',
    },
    { path: "src/b.css", content: ".x{ color:#00ff00; animation: spin 2s linear infinite }" },
    {
      path: "src/c.css",
      content: ".y{ animation: spin 1s; } @media (prefers-reduced-motion: reduce){ .y{animation:none} }",
    },
  ];
  const plain = all(files);
  sumOk(plain);
  assert.equal(plain.ratios.colours.conforming, 1);
  assert.equal(plain.ratios.colours.unjustified, 2);
  assert.equal(plain.ratios.spacing.conforming, 1); // p-2 = 2 x 4px lands on space.2
  assert.equal(plain.ratios.spacing.unjustified, 1);
  assert.equal(plain.ratios.motion.conforming, 1);
  assert.equal(plain.ratios.reduced_motion.conforming, 1);
  assert.equal(plain.ratios.reduced_motion.unjustified, 2);
  const j = all(files, designMd, { "#ff0000": "brand red", "13px": "x", "src/b.css": "decorative" });
  sumOk(j);
  assert.equal(j.ratios.colours.conforming, 1);
  assert.equal(j.ratios.colours.justified, 2); // the file key also justifies b.css colour
  assert.equal(j.ratios.spacing.conforming, 1);
  assert.equal(j.ratios.spacing.justified, 1);
  assert.deepEqual(j.ratios.reduced_motion, { conforming: 1, justified: 1, unjustified: 1, total: 3 });
});

test("--all: a variant-bearing component without a Component tokens block is unjustified; justifiable by name", () => {
  const files = [comp("Chip", btn("Chip", ["sm", "lg"]))];
  const r = all(files);
  assert.deepEqual(r.ratios.component_tokens, { conforming: 0, justified: 0, unjustified: 1, total: 1 });
  assert.equal(r.ratios.colours.conforming, 0);
  const j = all(files, designMd, { Chip: "deliberate" });
  assert.deepEqual(j.ratios.component_tokens, { conforming: 0, justified: 1, unjustified: 0, total: 1 });
  const md = withSection(
    "## Component tokens\n| component | variable | semantic | use |\n|---|---|---|---|\n| Chip | --chip-bg | color.surface | bg |\n",
  );
  const ok = all(files, md);
  assert.deepEqual(ok.ratios.component_tokens, { conforming: 1, justified: 0, unjustified: 0, total: 1 });
  assert.deepEqual(ok.component_token_literals, []);
  const plainComp = all([comp("Plain", "export function Plain() { return <i />; }\n")]);
  assert.equal(plainComp.ratios.component_tokens.total, 0);
});

test("--all: a literal in a Component tokens cell is a component_token_literal and keeps the component off conforming", () => {
  const md = withSection(
    "## Component tokens\n| component | variable | semantic | use |\n|---|---|---|---|\n| Chip | --chip-bg | #ff00ff | bg |\n| Chip | --chip-pad | space.2 | pad |\n",
  );
  const files = [comp("Chip", btn("Chip", ["sm", "lg"]))];
  const r = all(files, md);
  assert.deepEqual(
    r.component_token_literals.map((x) => [x.name, x.value, x.justified]),
    [["Chip.--chip-bg", "#ff00ff", false]],
  );
  assert.equal(r.ratios.component_tokens.conforming, 0);
  assert.equal(r.ratios.component_tokens.unjustified, 1);
  assert.equal(r.unjustified >= 1, true);
  const j = all(files, md, { "Chip.--chip-bg": "legacy" });
  assert.equal(j.component_token_literals[0].justified, true);
  assert.deepEqual(j.ratios.component_tokens, { conforming: 0, justified: 1, unjustified: 0, total: 1 });
  sumOk(j);
});

test("--all component_api: majority value set conforms; tie broken by smallest joined set", () => {
  const maj = all([
    comp("A", btn("A", ["sm", "md"])),
    comp("B", btn("B", ["md", "sm"])),
    comp("C", btn("C", ["lg", "sm"])),
  ]);
  assert.deepEqual(maj.ratios.component_api, { conforming: 2, justified: 0, unjustified: 1, total: 3 });
  const tie = all([comp("A", btn("A", ["sm", "md"])), comp("B", btn("B", ["lg", "xl"]))]);
  // "lg,xl" < "md,sm": B conforms, A does not
  assert.deepEqual(tie.ratios.component_api, { conforming: 1, justified: 0, unjustified: 1, total: 2 });
  const j = all([comp("A", btn("A", ["sm", "md"])), comp("B", btn("B", ["lg", "xl"]))], designMd, { "A.size": "x" });
  assert.deepEqual(j.ratios.component_api, { conforming: 1, justified: 1, unjustified: 0, total: 2 });
  const solo = all([comp("A", btn("A", ["sm", "md"]))]);
  assert.equal(solo.ratios.component_api.total, 0);
});

test("--all: <Component>.<prop> justification keys do not collide with new_components", () => {
  const files = [comp("A", btn("A", ["sm", "md"])), comp("B", btn("B", ["lg", "xl"]))];
  const r = all(files, designMd, { A: "new component reason" });
  assert.equal(r.new_components.find((x) => x.name === "A").justified, true);
  assert.equal(r.ratios.component_api.justified, 0);
  assert.equal(r.ratios.component_api.unjustified, 1);
});

test("--all: off_token_classes and prop_synonyms are advisory and uncounted", () => {
  const files = [
    comp("A", btn("A", ["sm", "md"]).replace("bg-action", "bg-nothing-here")),
    comp("B", btn("B", ["sm", "md"]).replace("size", "scale")),
  ];
  const r = all(files);
  assert.ok(r.off_token_classes.some((x) => x.class === "bg-nothing-here" && x.reason === "unknown"));
  assert.deepEqual(
    r.prop_synonyms.map((x) => [x.props, x.values]),
    [
      [
        ["scale", "size"],
        ["md", "sm"],
      ],
    ],
  );
  const base = all(files.map((f) => ({ ...f, content: f.content.replace("bg-nothing-here", "bg-action") })));
  assert.equal(r.unjustified, base.unjustified);
  sumOk(r);
});

test("--all: docs/design/** is never scanned for ratios and breakpoints are exempt", () => {
  const r = all([
    { path: "docs/design/a.css", content: "a{color:#abcdef;padding:13px;animation:x 2s}" },
    { path: "src/m.css", content: "@media (min-width: 768px){ .a{ color: var(--color-surface) } }" },
  ]);
  assert.deepEqual(r.ratios.colours, { conforming: 1, justified: 0, unjustified: 0, total: 1 });
  assert.equal(r.ratios.spacing.total, 0);
  assert.equal(r.ratios.reduced_motion.total, 0);
  assert.deepEqual(r.raw_spacing, []);
});

// ---- scrutinise round 1: DESIGN.md read through design-md.mjs (ARCH-VERIFY-25) ----
test("a fenced ## Spacing example is not a section; the real Spacing scale still applies", () => {
  const md = withSection("```md\n## Spacing\n| name | value | use |\n|---|---|---|\n| space.x | 13px | example |\n```\n");
  const r = checkReuse({ designMd: md, files: [{ path: "src/a.css", content: ".a{ padding: 13px; margin: 8px }" }] });
  assert.deepEqual(
    r.raw_spacing.map((x) => x.value),
    ["13px"],
  );
});

test("Spacing, Motion, Components and Layouts are read by header name, whatever the column order", () => {
  const flip = (block) =>
    block.replace(/^\| (.+?) \| (.+?) \| (.+?) \|$/gm, (line, a, b, c) => (/^-+$/.test(a) ? line : `| ${b} | ${a} | ${c} |`));
  let md = designMd;
  for (const title of ["Spacing", "Motion", "Components", "Layouts"]) {
    md = md.replace(new RegExp(`(## ${title}\\n)([\\s\\S]*?)(\\n\\n)`), (_, h, body, tail) => h + flip(body) + tail);
  }
  assert.match(md, /## Spacing\n\| value \| name \| use \|/);
  assert.match(md, /## Components\n\| path \| name \| use \|/);
  const r = checkReuse({
    designMd: md,
    files: [
      {
        path: "src/a.css",
        content:
          ".a{ padding: 4px 8px; transition: opacity 150ms cubic-bezier(0.2, 0, 0, 1) } @media (prefers-reduced-motion: reduce){.a{transition:none}}",
      },
      { path: "src/components/Button.tsx", content: "export function Button() { return <b />; }\n" },
      { path: "src/app/layout.tsx", content: "export default function L({ children }) { return children; }\n" },
    ],
  });
  assert.deepEqual(r.raw_spacing, []);
  assert.deepEqual(r.raw_motion, []);
  assert.deepEqual(r.new_components, []);
  assert.deepEqual(r.new_layouts, []);
});

test("--all: a Component tokens variable aliasing a colour token counts as a conforming colour reference", () => {
  const md = withSection(
    "## Component tokens\n| component | variable | semantic | use |\n|---|---|---|---|\n| Chip | --chip-bg | color.surface | bg |\n",
  );
  const r = all([{ path: "src/x.css", content: ".chip{ background: var(--chip-bg) }" }], md);
  assert.deepEqual(r.ratios.colours, { conforming: 1, justified: 0, unjustified: 0, total: 1 });
  const lit = withSection(
    "## Component tokens\n| component | variable | semantic | use |\n|---|---|---|---|\n| Chip | --chip-bg | #ff00ff | bg |\n",
  );
  assert.equal(all([{ path: "src/x.css", content: ".chip{ background: var(--chip-bg) }" }], lit).ratios.colours.conforming, 0);
});

test("--all: a file-path justification does not justify component_tokens or component_api items", () => {
  const files = [comp("A", btn("A", ["sm", "md"])), comp("B", btn("B", ["lg", "xl"]))];
  const r = all(files, designMd, { "src/components/A.tsx": "reduced motion handled elsewhere" });
  assert.equal(r.ratios.component_api.justified, 0);
  assert.equal(r.ratios.component_api.unjustified, 1);
  assert.equal(r.ratios.component_tokens.justified, 0);
  sumOk(r);
});

test("a capitalised Spacing table is read by header name", () => {
  const md = designMd.replace("## Spacing\n| name | value | use |", "## Spacing\n| Name | Value | Use |");
  assert.match(md, /\| Name \| Value \| Use \|/);
  const r = checkReuse({ designMd: md, files: [{ path: "src/a.css", content: ".a{ padding: 4px 8px }" }] });
  assert.deepEqual(r.raw_spacing, []);
});

test("CLI resolves a relative --run against --project, whatever the cwd", () => {
  const p = mkdtempSync(join(tmpdir(), "reuse-proj-"));
  spawnSync("cp", ["-r", fx + "/.", p]);
  const elsewhere = mkdtempSync(join(tmpdir(), "reuse-cwd-"));
  const res = spawnSync(
    process.execPath,
    [join(here, "reuse-check.mjs"), "--project", p, "--run", ".artist/audit", "--files", "src/components/Button.tsx"],
    { encoding: "utf8", cwd: elsewhere },
  );
  assert.ok(res.status === 0 || res.status === 1, res.stderr);
  assert.ok(existsSync(join(p, ".artist/audit/reuse.json")));
  assert.equal(existsSync(join(elsewhere, ".artist")), false);
});
