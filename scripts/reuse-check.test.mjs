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
  assert.equal(r.new_components.some((x) => x.name === "Button"), false);
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
  assert.equal(r.new_packages.some((x) => x.name === "chart.js"), false);
  assert.equal(r.unjustified, 6);
  assert.equal(r.schema, 2);
});

test("a colour equal to a token value is reported outside token files (strict)", () => {
  const r = run();
  assert.ok(r.raw_colours.some((x) => x.value === "#1d6b4f" && x.file === "src/app/pricing/page.tsx"));
});

test("the same hex inside the declared token file is not reported", () => {
  const r = checkReuse({ designMd, files: [{ path: "src/styles/tokens.css", content: read("src/styles/tokens.css") }] });
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
  const r = one("src/a.tsx", 'const s = { padding: "16px", gap: 8 }; const c = "p-4 p-[16px] m-[2rem] mt-0"; const w = "w-[13px]";');
  assert.deepEqual(r.raw_spacing, []);
});

test("raw durations and unknown easings are raw_motion; token values are not", () => {
  const r = one("src/a.css", ".a{ transition: opacity 0.42s ease; animation-duration: 420ms; transition-timing-function: cubic-bezier(0.1, 0.9, 0.2, 1) }\n@media (prefers-reduced-motion: reduce){.a{transition:none}}");
  assert.deepEqual(r.raw_motion.map((x) => x.value).sort(), ["0.42s", "420ms", "cubic-bezier(0.1,0.9,0.2,1)"].sort());
  const ok = one("src/a.css", ".a{ transition: opacity 300ms cubic-bezier(0.2,0,0,1); transition-duration: 150ms }\n@media (prefers-reduced-motion: reduce){.a{transition:none}}");
  assert.deepEqual(ok.raw_motion, []);
  const js = one("src/a.tsx", "const t = { duration: 0.42 }; const u = 'duration-[420ms]'; // useReducedMotion");
  assert.equal(js.raw_motion.length, 2);
});

test("animation without a reduced-motion fallback is flagged", () => {
  const r = checkReuse({ designMd, files: [{ path: "src/components/FadeIn.tsx", content: read("src/components/FadeIn.tsx") }], justifications });
  assert.ok(r.missing_reduced_motion.some((x) => x.file === "src/components/FadeIn.tsx" && !x.justified));
  assert.ok(r.raw_motion.some((x) => x.value === "0.42s"));
  for (const sig of ["const r = useReducedMotion();", "className='motion-reduce:transition-none'", "@media (prefers-reduced-motion: reduce) {}", "className='motion-safe:animate-spin'"]) {
    const ok = one("src/b.tsx", `<motion.div animate={{x:1}} />\n${sig}`);
    assert.deepEqual(ok.missing_reduced_motion, [], sig);
  }
  assert.deepEqual(one("src/c.tsx", "export const c = 1;").missing_reduced_motion, []);
  for (const code of ["gsap.to(a, {x:1})", "Animated.timing(v)", "withTiming(1)", "@keyframes spin{}", "animation: spin 1s"])
    assert.equal(one("src/d.ts", code).missing_reduced_motion.length, 1, code);
});

const fixtureInventory = () => JSON.parse(read("docs/design/inventory.json"));
const allFiles = () => [...changed, "src/components/Button.tsx", "src/components/FadeIn.tsx", "src/styles/tokens.css"].map((path) => ({ path, content: read(path) }));

test("--all adds stale inventory and near-duplicates; default mode does not", () => {
  const r = checkReuse({ designMd, files: allFiles(), justifications, all: true, inventory: fixtureInventory() });
  assert.ok(r.stale_inventory.some((x) => x.name === "OldBanner" && x.file === "src/components/OldBanner.tsx" && !x.justified));
  assert.equal(r.stale_inventory.some((x) => x.name === "Button"), false);
  const d = r.near_duplicates.find((x) => x.name === "PriceCard");
  assert.ok(d, "PriceCard near-duplicates PricingCard");
  assert.deepEqual([].concat(d.duplicates), ["PricingCard"]);
  assert.equal(d.file, "src/components/PriceCard.tsx");
  const plain = checkReuse({ designMd, files: allFiles(), justifications });
  assert.equal(plain.stale_inventory, undefined);
  assert.equal(plain.near_duplicates, undefined);
});

test("same component name at a different path is a near-duplicate", () => {
  const inv = fixtureInventory();
  inv.components.push({ name: "Hero", path: "src/components/Hero.tsx", props: [], variants: {}, tokensUsed: [], usage: { count: 0, files: [] }, status: "current" });
  const r = checkReuse({ designMd, files: [{ path: "src/ui/Hero.tsx", content: "export function Hero() { return null; }" }], all: true, inventory: inv });
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
  commit();
  writeFileSync(join(p, "src/untracked.tsx"), "export const x = <p style={{color:'#abcdef'}} />;\n");
  mkdirSync(join(p, "node_modules/foo"), { recursive: true });
  writeFileSync(join(p, "node_modules/foo/i.js"), "const c='#999999'");
  const { res, out } = runCli(join(here, "reuse-check.mjs"), p, ["--all"]);
  assert.equal(res.status, 1, res.stderr);
  const j = JSON.parse(readFileSync(join(out, "reuse.json"), "utf8"));
  assert.equal(j.schema, 2);
  assert.ok(j.raw_colours.some((x) => x.value === "#abcdef"));
  assert.equal(j.raw_colours.some((x) => x.value === "#999999"), false);
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
  assert.equal(j.schema, 2);
  assert.equal(j.unjustified, 6);
});

test("CLI exits 0 when everything is justified", () => {
  const all = { ...justifications, "src/app/pricing/layout.tsx": "x", "#7b5cff": "x", "#ff0000": "x", "#1d6b4f": "x", "13px": "x", recharts: "x" };
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
  const res = spawnSync(process.execPath, [join(here, "reuse-check.mjs"), "--project", p, "--run", out], { encoding: "utf8" });
  assert.equal(res.status, 1, res.stderr);
  const j = JSON.parse(readFileSync(join(out, "reuse.json"), "utf8"));
  assert.ok(j.new_components.some((x) => x.name === "PriceCard"));
});

test("bad JSON exits 2", () => {
  const p = mkdtempSync(join(tmpdir(), "badjson-"));
  writeFileSync(join(p, "DESIGN.md"), designMd);
  writeFileSync(join(p, "package.json"), "{nope");
  const out = mkdtempSync(join(tmpdir(), "reuse-"));
  const res = spawnSync(process.execPath, [join(here, "reuse-check.mjs"), "--project", p, "--run", out, "--files", "package.json"], { encoding: "utf8" });
  assert.equal(res.status, 2);
  assert.equal(existsSync(join(out, "reuse.json")), false);
});

const mkRepo = () => {
  const p = mkdtempSync(join(tmpdir(), "repo-"));
  const git = (...args) => spawnSync("git", ["-C", p, ...args], { encoding: "utf8" });
  git("init", "-q");
  return { p, git, commit: () => { git("add", "-A"); git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "c"); } };
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
  writeFileSync(join(web, "src/components/Button.tsx"), "export const Button = () => <p style={{color:'#123456'}} />;\n");
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
  const { res, out } = runCli(join(link, "reuse-check.mjs"), fx, ["--files", changed.join(","), "--justifications", join(fx, "justifications.json")]);
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
    files: [{ path: "src/a.css", content: 'a{color:hsl(var(--primary))}\n<a href="#feed"></a><a href=#bead></a><b id="#abc"></b>' }],
  });
  assert.deepEqual(r.raw_colours, []);
});
