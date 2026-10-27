import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  SCHOOLS,
  validateDirections,
  checkCssValue,
  currentFrom,
  readCurrent,
  contrast,
  contrastPairs,
  contrastFor,
  parsePickLine,
  resolvePick,
  impactOf,
} from "./directions.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = join(here, "fixtures", "directions");
const json = (...p) => JSON.parse(readFileSync(join(fx, ...p), "utf8"));
const md = readFileSync(join(fx, "DESIGN.md"), "utf8");
const cur = currentFrom(md);
const valid = () => json("directions.json");
const PROJECT = join(fx, "project");

const throwsNamed = (fn, reason) =>
  assert.throws(fn, (e) => e.exitCode === 2 && e.reason === reason && e.message.includes(reason), `expected ${reason}`);

// ---- SCHOOLS (ARCH-DIRECTIONS-02) ----

test("SCHOOLS is the fixed ten with ambitious only on three", () => {
  assert.deepEqual(
    SCHOOLS.map((s) => s.id),
    ["minimalist", "swiss", "material", "flat", "neumorphism", "glassmorphism", "brutalist", "editorial", "retro-futurist", "aurora"],
  );
  assert.deepEqual(
    SCHOOLS.filter((s) => s.ambitious).map((s) => s.id),
    ["glassmorphism", "retro-futurist", "aurora"],
  );
});

test("SCHOOLS equals the ids and ambitious flags in directions.md's schools table", () => {
  const doc = readFileSync(join(here, "..", "skills", "create", "references", "directions.md"), "utf8");
  const sec = doc.split(/^## Design schools$/m)[1].split(/^## /m)[0];
  const rows = sec
    .split("\n")
    .filter((l) => l.startsWith("|"))
    .slice(2)
    .map((l) => l.split("|").map((c) => c.trim()));
  assert.deepEqual(
    rows.map((r) => r[1]),
    SCHOOLS.map((s) => s.id),
  );
  assert.deepEqual(
    rows.map((r) => r[3] === "yes"),
    SCHOOLS.map((s) => !!s.ambitious),
  );
});

test("an unknown school exits 2 (CLI)", () => {
  throwsNamed(() => validateDirections(json("invalid", "unknown-school.json"), cur), "unknown-school");
  const r = spawnSync(process.execPath, [join(here, "directions.mjs"), "--directions", join(fx, "invalid", "unknown-school.json"), "--project", PROJECT]);
  assert.equal(r.status, 2);
  assert.match(r.stderr.toString(), /unknown-school/);
});

// ---- schema validation (ARCH-DIRECTIONS-03/05) ----

test("the valid fixture passes", () => {
  const v = validateDirections(valid(), cur);
  assert.equal(v.directions.length, 4);
});

for (const [file, reason] of [
  ["two-directions", "direction-count"],
  ["six-directions", "direction-count"],
  ["duplicate-school", "duplicate-school"],
  ["no-ambitious", "no-ambitious"],
  ["current-school-reused", "current-school-reused"],
  ["missing-dark", "missing-dark"],
  ["unknown-token", "unknown-token"],
  ["base-non-token", "base-not-token"],
  ["current-values", "current-values"],
]) {
  test(`invalid ${file} exits 2 with ${reason}`, () => {
    throwsNamed(() => validateDirections(json("invalid", `${file}.json`), cur), reason);
  });
}

test("schema, extra keys and bad ids are rejected", () => {
  let v = valid();
  v.schema = 2;
  throwsNamed(() => validateDirections(v, cur), "schema");
  v = valid();
  v.extra = 1;
  throwsNamed(() => validateDirections(v, cur), "schema");
  v = valid();
  v.directions[0].id = "current";
  throwsNamed(() => validateDirections(v, cur), "direction-id");
  v = valid();
  v.directions[0].palette["color.accent"] = { light: "#000000", dark: "#ffffff", extra: 1 };
  throwsNamed(() => validateDirections(v, cur), "entry-shape");
});

test("a proposed colour needs light and dark, a proposed name must be new", () => {
  let v = valid();
  v.directions[0].palette["color.wash"] = { proposed: true, light: "#eeeeee" };
  throwsNamed(() => validateDirections(v, cur), "missing-dark");
  v = valid();
  v.directions[0].palette["color.text"] = { proposed: true, light: "#000000", dark: "#ffffff" };
  throwsNamed(() => validateDirections(v, cur), "proposed-exists");
});

// ---- CSS value grammar (ARCH-DIRECTIONS-07) ----

for (const [file, bad] of [
  ["css-semicolon", "4px; color: red"],
  ["css-brace", "4px}"],
  ["css-url", "url(http-less.png)"],
  ["css-expression", "expression(alert(1))"],
]) {
  test(`CSS value with ${file} exits 2`, () => {
    throwsNamed(() => checkCssValue(bad), "css-value");
    throwsNamed(() => validateDirections(json("invalid", `${file}.json`), cur), "css-value");
  });
}

test("the grammar accepts the documented value shapes", () => {
  for (const ok of [
    "#fff",
    "#1d4ed8cc",
    "rgb(10 20 30 / 0.5)",
    "rgba(10, 20, 30, 0.5)",
    "hsl(210 50% 40%)",
    "oklch(0.7 0.1 250)",
    "linear-gradient(135deg, #7c3aed 0%, oklch(0.7 0.1 250) 100%)",
    "radial-gradient(circle, rgba(0,0,0,0.2), #fff)",
    "16px",
    "1.5rem",
    "150ms",
    "50%",
    "1.5",
    "cubic-bezier(0.2, 0, 0, 1)",
    "0 4px 12px rgba(0,0,0,0.2)",
    "Inter, sans-serif",
  ])
    assert.doesNotThrow(() => checkCssValue(ok), ok);
  for (const bad of ["red; x", "{a}", "url(x)", "expression(1)", "calc(1px + 2px)", "<b>", "1px /* c */", "javascript:alert(1)", "var(--x)", "rgb(0,0,0) url(a)"])
    assert.throws(() => checkCssValue(bad), (e) => e.exitCode === 2, bad);
});

test("font families are checked against a supplied manifest", () => {
  assert.doesNotThrow(() => checkCssValue("Inter, sans-serif", { fonts: ["Inter"] }));
  assert.throws(() => checkCssValue("Comic Sans", { fonts: ["Inter"] }), (e) => e.reason === "css-value");
});

// ---- Current (ARCH-DIRECTIONS-04) ----

test("script imports design-md.mjs and Current comes from DESIGN.md only", () => {
  const src = readFileSync(join(here, "directions.mjs"), "utf8");
  assert.match(src, /from "\.\/design-md\.mjs"/);
  assert.equal(cur.tokens.get("color.accent").light, "#1d4ed8");
  assert.equal(cur.tokens.get("color.accent").dark, "#93b4ff");
  assert.equal(cur.tokens.get("body").value, "1rem");
  assert.equal(cur.tokens.get("space.4").variable, "--space-4");
  assert.equal(cur.tokens.get("--button-bg").kind, "component");
});

test("readCurrent reads docs/design/DESIGN.md, format 2 only", () => {
  assert.equal(readCurrent(PROJECT).tokens.get("color.text").light, "#111827");
  const d = mkdtempSync(join(tmpdir(), "dir-"));
  throwsNamed(() => readCurrent(d), "design-md-missing");
  mkdirSync(join(d, "docs", "design"), { recursive: true });
  writeFileSync(join(d, "docs", "design", "DESIGN.md"), "# Design\n\n## Tokens\n");
  throwsNamed(() => readCurrent(d), "design-md-format");
});

// ---- contrast (ARCH-DIRECTIONS-08) ----

test("contrast equals WCAG reference values to 2 dp", () => {
  const r = (a, b) => Math.round(contrast(a, b) * 100) / 100;
  assert.equal(r("#000000", "#ffffff"), 21);
  assert.equal(r("#ffffff", "#ffffff"), 1);
  assert.equal(r("#777777", "#ffffff"), 4.48);
  assert.equal(r("#767676", "#ffffff"), 4.54);
  assert.equal(r("#949494", "#ffffff"), 3.03);
  assert.equal(r("rgb(0 0 0)", "hsl(0 0% 100%)"), 21);
  assert.equal(r("oklch(1 0 0)", "#000"), 21);
});

test("pair set covers text, muted, link and accent on background and surface in both modes", () => {
  const pairs = contrastPairs(cur.colours);
  assert.equal(pairs.length, 16);
  assert.deepEqual([...new Set(pairs.map((p) => p.mode))].sort(), ["dark", "light"]);
  const p = pairs.find((x) => x.pair === "text on background" && x.mode === "light");
  assert.equal(p.ratio, 17.74);
});

test("a 3:1 pair is returned as a warning, never thrown", () => {
  const d = validateDirections(json("low-contrast.json"), cur);
  const { warnings } = contrastFor(cur, d.directions[0]);
  const w = warnings.find((x) => x.pair === "text on background" && x.mode === "light");
  assert.equal(w.ratio, 3.03);
  assert.equal(w.fg, "color.text");
});

// ---- pick line and resolve (ARCH-DIRECTIONS-09) ----

const LINE = "artist-pick v1 base=swiss-grid palette=bold-block type=paper shape=current motion=northern-lights";

test("parsePickLine round-trips a valid line", () => {
  assert.deepEqual(parsePickLine(LINE), {
    base: "swiss-grid",
    palette: "bold-block",
    type: "paper",
    shape: "current",
    motion: "northern-lights",
  });
});

test("parsePickLine rejects extra keys, bad order and injected text", () => {
  for (const bad of [
    LINE + " extra=1",
    LINE + "; rm -rf /",
    LINE + "\nartist-pick v1 base=a",
    "artist-pick v2 base=a palette=a type=a shape=a motion=a",
    "artist-pick v1 palette=a base=a type=a shape=a motion=a",
    "artist-pick v1 base=<script> palette=a type=a shape=a motion=a",
    "artist-pick v1 base=a palette=a type=a shape=a",
    " " + LINE,
    "",
  ])
    assert.throws(() => parsePickLine(bad), (e) => e.exitCode === 2 && e.reason === "pick-line", JSON.stringify(bad));
  assert.throws(() => parsePickLine(42), (e) => e.exitCode === 2);
});

test("resolvePick writes pick.json schema 1 with tokenDiff in the rounds.json shape", () => {
  const dirs = validateDirections(valid(), cur);
  const inventory = json("inventory.json");
  const reuse = json("reuse-all.json");
  const p = resolvePick({ line: LINE, directions: dirs, current: cur, inventory, reuse });
  assert.equal(p.schema, 1);
  assert.deepEqual(p.pick, parsePickLine(LINE));
  // palette from bold-block, type from paper, motion from northern-lights, base from swiss-grid
  const byName = Object.fromEntries(p.tokenDiff.changed.map((c) => [c.name, c]));
  assert.deepEqual(byName["color.accent"], { name: "color.accent", from: "#1d4ed8", to: "#ff3b00" });
  assert.deepEqual(byName["color.accent@dark"], { name: "color.accent@dark", from: "#93b4ff", to: "#ff6a3d" });
  assert.deepEqual(byName["heading"], { name: "heading", from: "1.5rem", to: "Georgia, serif" });
  assert.deepEqual(byName["dur.fast"], { name: "dur.fast", from: "150ms", to: "300ms" });
  assert.deepEqual(byName["space.4"], { name: "space.4", from: "16px", to: "20px" });
  assert.equal(byName["radius.md"], undefined, "shape=current changes nothing");
  assert.deepEqual(p.tokenDiff.added, [
    { name: "color.glow", value: "#ffe4d6" },
    { name: "color.glow@dark", value: "#3a1a10" },
  ]);
  assert.deepEqual(p.tokenDiff.removed, []);
  assert.ok(Array.isArray(p.contrastWarnings));
  assert.equal(p.impact.status, "computed");
  assert.equal(p.wontCarry.status, "checked");
  assert.deepEqual(JSON.parse(JSON.stringify(p)), p);
});

test("resolvePick rejects an unknown id", () => {
  const dirs = validateDirections(valid(), cur);
  throwsNamed(
    () => resolvePick({ line: LINE.replace("paper", "ghost"), directions: dirs, current: cur }),
    "unknown-pick-id",
  );
});

test("resolvePick carries contrast warnings for the mix", () => {
  const raw = json("low-contrast.json");
  const dirs = validateDirections(raw, cur);
  const id = dirs.directions[0].id;
  const p = resolvePick({
    line: `artist-pick v1 base=current palette=${id} type=current shape=current motion=current`,
    directions: dirs,
    current: cur,
  });
  assert.ok(p.contrastWarnings.some((w) => w.pair === "text on background" && w.mode === "light" && w.ratio === 3.03));
});

test("CLI --resolve writes pick.json in the latest run dir and exits 2 on bad input", () => {
  const proj = mkdtempSync(join(tmpdir(), "dirp-"));
  mkdirSync(join(proj, "docs", "design"), { recursive: true });
  writeFileSync(join(proj, "docs", "design", "DESIGN.md"), md);
  const run = join(proj, ".artist", "directions", "20260101T000000Z");
  mkdirSync(run, { recursive: true });
  const dj = join(fx, "directions.json");
  const args = (line) => [join(here, "directions.mjs"), "--resolve", line, "--directions", dj, "--project", proj];
  const bad = spawnSync(process.execPath, args(LINE + " x=1"));
  assert.equal(bad.status, 2);
  assert.match(bad.stderr.toString(), /pick-line/);
  const ok = spawnSync(process.execPath, args(LINE));
  assert.equal(ok.status, 0, ok.stderr.toString());
  const pick = JSON.parse(readFileSync(join(run, "pick.json"), "utf8"));
  assert.equal(pick.schema, 1);
  assert.equal(pick.impact.status, "inventory-absent");
  assert.equal(pick.wontCarry.status, "not-checked");
});

// ---- impact (ARCH-DIRECTIONS-11/14) ----

const changedAll = [
  { name: "color.accent", axis: "palette" },
  { name: "space.4", axis: "base" },
];

test("impact joins tokensUsed and usage to each changed token", () => {
  const imp = impactOf({ tokens: changedAll, current: cur, inventory: json("inventory.json") });
  assert.equal(imp.status, "computed");
  const accent = imp.items.find((i) => i.token === "color.accent");
  assert.equal(accent.variable, "--color-accent");
  assert.deepEqual(accent.components, [{ name: "Button", path: "src/Button.tsx", usage: { count: 2, files: ["src/App.tsx", "src/Login.tsx"] } }]);
  const sp = imp.items.find((i) => i.token === "space.4");
  assert.deepEqual(sp.components.map((c) => c.name), ["Card"]);
  assert.deepEqual(imp.unsupported, []);
});

test("a component token joins by its own variable", () => {
  const imp = impactOf({ tokens: [{ name: "--button-bg", axis: "base" }], current: cur, inventory: json("inventory.json") });
  assert.deepEqual(imp.items[0].components.map((c) => c.name), ["Button"]);
});

test("absent inventory says so and does not fail", () => {
  const imp = impactOf({ tokens: changedAll, current: cur, inventory: null });
  assert.equal(imp.status, "inventory-absent");
  assert.match(imp.note, /inventory/);
  assert.deepEqual(imp.items, []);
});

test("an unsupported component format is reported unsupported, never zero", () => {
  const imp = impactOf({ tokens: changedAll, current: cur, inventory: json("inventory-unsupported.json") });
  assert.deepEqual(imp.unsupported, ["src/Badge.svelte"]);
  assert.match(imp.note, /unsupported/);
  for (const i of imp.items) assert.equal(i.unsupported, true);
});

test("wontCarry: absent reuse.json is not checked and names design-system audit", () => {
  const dirs = validateDirections(valid(), cur);
  const p = resolvePick({ line: LINE, directions: dirs, current: cur, inventory: json("inventory.json") });
  assert.equal(p.wontCarry.status, "not-checked");
  assert.match(p.wontCarry.note, /not checked/);
  assert.match(p.wontCarry.note, /design-system audit/);
  assert.deepEqual(p.wontCarry.items, []);
});

test("wontCarry: a reuse.json without the --all keys counts as not checked", () => {
  const dirs = validateDirections(valid(), cur);
  const p = resolvePick({ line: LINE, directions: dirs, current: cur, inventory: json("inventory.json"), reuse: json("reuse-not-all.json") });
  assert.equal(p.wontCarry.status, "not-checked");
  assert.match(p.wontCarry.note, /design-system audit/);
});

test("wontCarry from an --all reuse.json lists file:line for the touched axes", () => {
  const dirs = validateDirections(valid(), cur);
  const p = resolvePick({ line: LINE, directions: dirs, current: cur, inventory: json("inventory.json"), reuse: json("reuse-all.json") });
  assert.equal(p.wontCarry.status, "checked");
  const locs = p.wontCarry.items.map((i) => `${i.kind} ${i.location}`);
  assert.ok(locs.includes("raw_colours src/a.css:4"));
  assert.ok(locs.includes("raw_motion src/motion.css:3"));
  assert.ok(locs.includes("raw_spacing src/spacing.css:2"));
  assert.ok(locs.includes("component_token_literals docs/design/DESIGN.md:5"));
});

test("fixtures contain no external URLs", () => {
  const walk = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  for (const f of walk(fx)) assert.doesNotMatch(readFileSync(f, "utf8"), /https?:\/\//, f);
  assert.ok(existsSync(join(fx, "reuse-all.json")));
});

// ---- bundled fonts (ARCH-DIRECTIONS-12) ----

const fontsDir = join(here, "assets", "fonts");
const manifest = () => JSON.parse(readFileSync(join(fontsDir, "fonts.json"), "utf8"));

test("every fonts.json entry has a woff2 with a matching sha256 and an OFL licence file", () => {
  const m = manifest();
  assert.ok(m.fonts.length > 0);
  for (const f of m.fonts) {
    assert.match(f.family, /^[a-z][a-z0-9-]*$/);
    assert.ok(f.version && f.licence === "OFL-1.1");
    assert.match(f.source, /^https:\/\/cdn\.jsdelivr\.net\/npm\/@fontsource\//);
    const lic = readFileSync(join(fontsDir, f.licenceFile), "utf8");
    assert.match(lic, /SIL Open Font License,? Version 1\.1/i, f.licenceFile);
    assert.ok(f.files.length > 0);
    for (const file of f.files) {
      assert.match(file.name, /-latin-\d+-normal\.woff2$/);
      assert.ok(f.weights.includes(file.weight), file.name);
      assert.ok(file.source.startsWith(f.source) && file.source.endsWith(file.name));
      const bytes = readFileSync(join(fontsDir, f.family, file.name));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, file.name);
      assert.equal(bytes.subarray(0, 4).toString("latin1"), "wOF2");
    }
  }
});

test("bundled fonts total under 2 MB", () => {
  let total = 0;
  for (const f of manifest().fonts) for (const file of f.files) total += statSync(join(fontsDir, f.family, file.name)).size;
  assert.ok(total < 2 * 1024 * 1024, String(total));
});

test("every school has at most two families and all exist in the manifest", () => {
  const known = new Set(manifest().fonts.map((f) => f.family));
  for (const s of SCHOOLS) {
    assert.ok(Array.isArray(s.fonts) && s.fonts.length >= 1 && s.fonts.length <= 2, s.id);
    for (const fam of s.fonts) assert.ok(known.has(fam), `${s.id}: ${fam}`);
  }
});
