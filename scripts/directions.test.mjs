import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  readdirSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  SCHOOLS,
  unsupportedFilesOf,
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
    [
      "minimalist",
      "swiss",
      "material",
      "flat",
      "neumorphism",
      "glassmorphism",
      "brutalist",
      "editorial",
      "retro-futurist",
      "aurora",
    ],
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
  const r = spawnSync(process.execPath, [
    join(here, "directions.mjs"),
    "--directions",
    join(fx, "invalid", "unknown-school.json"),
    "--project",
    PROJECT,
  ]);
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
  ["colour-off-palette", "colour-off-palette"],
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

// ---- CSS value grammar (ARCH-DIRECTIONS-15) ----

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
  for (const bad of [
    "red; x",
    "{a}",
    "url(x)",
    "expression(1)",
    "calc(1px + 2px)",
    "<b>",
    "1px /* c */",
    "javascript:alert(1)",
    "var(--x)",
    "rgb(0,0,0) url(a)",
  ])
    assert.throws(
      () => checkCssValue(bad),
      (e) => e.exitCode === 2,
      bad,
    );
});

test("font families are checked against a supplied manifest", () => {
  assert.doesNotThrow(() => checkCssValue("Inter, sans-serif", { fonts: ["Inter"] }));
  assert.throws(
    () => checkCssValue("Comic Sans", { fonts: ["Inter"] }),
    (e) => e.reason === "css-value",
  );
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

const colours = (o) =>
  new Map(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? { light: v, dark: v } : v]));

test("shadcn foreground names win over the bare muted and accent backgrounds", () => {
  const pairs = contrastPairs(
    colours({
      "--background": "#ffffff",
      "--card": "#ffffff",
      "--foreground": "#0a0a0a",
      "--muted": "#f5f5f5",
      "--muted-foreground": "#737373",
      "--accent": "#f5f5f5",
      "--accent-foreground": "#171717",
      "--primary": "#171717",
    }),
  );
  const get = (pair) => pairs.find((p) => p.pair === pair && p.mode === "light");
  assert.equal(get("muted text on background").fg, "--muted-foreground");
  assert.equal(get("muted text on background").ratio, 4.74);
  assert.equal(get("accent-text on background").fg, "--accent-foreground");
  assert.ok(
    pairs.every((p) => p.pass),
    JSON.stringify(pairs.filter((p) => !p.pass)),
  );
});

test("alpha colours are composited over the resolved background before contrast", () => {
  const pairs = contrastPairs(
    colours({
      "color.background": { light: "#ffffff", dark: "#000000" },
      "color.surface": { light: "rgba(0,0,0,0.05)", dark: "rgb(255 255 255 / 0.05)" },
      "color.text": { light: "#111111", dark: "#eeeeee" },
    }),
  );
  // 5% black over white is rgb(242.25); 5% white over black is rgb(12.75). Opaque, a 5% tint would score 1:1 or 21:1.
  const r = (a, b) => Math.round(contrast(a, b) * 100) / 100;
  const light = pairs.find((p) => p.pair === "text on surface" && p.mode === "light");
  assert.equal(light.ratio, r("#111111", "rgb(242.25 242.25 242.25)"));
  const dark = pairs.find((p) => p.pair === "text on surface" && p.mode === "dark");
  assert.equal(dark.ratio, r("#eeeeee", "rgb(12.75 12.75 12.75)"));
  assert.ok(light.pass && dark.pass);
});

test("a gradient pair is reported as not computed, never skipped or passed", () => {
  const map = colours({
    "color.background": { light: "linear-gradient(90deg, #ffffff, #eeeeee)", dark: "#000000" },
    "color.text": { light: "#111111", dark: "#eeeeee" },
  });
  const p = contrastPairs(map).find((x) => x.pair === "text on background" && x.mode === "light");
  assert.equal(p.ratio, null);
  assert.equal(p.pass, false);
  assert.match(p.note, /not computed/);
  const v = valid();
  v.directions[0].palette["color.background"] = { light: "linear-gradient(90deg, #ffffff, #eeeeee)", dark: "#000000" };
  const d = validateDirections(v, cur);
  const w = contrastFor(cur, d.directions[0]).warnings.find(
    (x) => x.pair === "text on background" && x.mode === "light",
  );
  assert.equal(w.ratio, null);
  assert.match(w.note, /not computed/);
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
    assert.throws(
      () => parsePickLine(bad),
      (e) => e.exitCode === 2 && e.reason === "pick-line",
      JSON.stringify(bad),
    );
  assert.throws(
    () => parsePickLine(42),
    (e) => e.exitCode === 2,
  );
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
  assert.deepEqual(byName["heading"], { name: "heading", from: "1.5rem", to: "fraunces, serif" });
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
  assert.deepEqual(accent.components, [
    { name: "Button", path: "src/Button.tsx", usage: { count: 2, files: ["src/App.tsx", "src/Login.tsx"] } },
  ]);
  const sp = imp.items.find((i) => i.token === "space.4");
  assert.deepEqual(
    sp.components.map((c) => c.name),
    ["Card"],
  );
  assert.deepEqual(imp.unsupported, []);
});

test("a component token joins by its own variable", () => {
  const imp = impactOf({
    tokens: [{ name: "--button-bg", axis: "base" }],
    current: cur,
    inventory: json("inventory.json"),
  });
  assert.deepEqual(
    imp.items[0].components.map((c) => c.name),
    ["Button"],
  );
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

test("component files found in the project that inventory cannot parse are unsupported, never zero", () => {
  const imp = impactOf({
    tokens: changedAll,
    current: cur,
    inventory: json("inventory.json"),
    unsupported: ["src/Card.svelte"],
  });
  assert.deepEqual(imp.unsupported, ["src/Card.svelte"]);
  assert.match(imp.note, /unsupported component format \(src\/Card\.svelte\)/);
  for (const i of imp.items) assert.equal(i.unsupported, true);
});

test("unsupportedFilesOf walks the project, skipping dependency and build dirs", () => {
  const proj = mkProject({
    files: {
      "src/Card.svelte": "<div/>",
      "src/pages/index.astro": "---",
      "src/App.tsx": "x",
      "node_modules/lib/A.svelte": "x",
      "dist/B.svelte": "x",
      ".artist/C.svelte": "x",
    },
  });
  assert.deepEqual(unsupportedFilesOf(proj), ["src/Card.svelte", "src/pages/index.astro"]);
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
  const p = resolvePick({
    line: LINE,
    directions: dirs,
    current: cur,
    inventory: json("inventory.json"),
    reuse: json("reuse-not-all.json"),
  });
  assert.equal(p.wontCarry.status, "not-checked");
  assert.match(p.wontCarry.note, /design-system audit/);
});

test("wontCarry from an --all reuse.json lists file:line for the touched axes", () => {
  const dirs = validateDirections(valid(), cur);
  const p = resolvePick({
    line: LINE,
    directions: dirs,
    current: cur,
    inventory: json("inventory.json"),
    reuse: json("reuse-all.json"),
  });
  assert.equal(p.wontCarry.status, "checked");
  const locs = p.wontCarry.items.map((i) => `${i.kind} ${i.location}`);
  assert.ok(locs.includes("raw_colours src/a.css:4"));
  assert.ok(locs.includes("raw_motion src/motion.css:3"));
  assert.ok(locs.includes("raw_spacing src/spacing.css:2"));
  assert.ok(locs.includes("component_token_literals docs/design/DESIGN.md:5"));
});

test("fixtures contain no external URLs", () => {
  const walk = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
    );
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
  for (const f of manifest().fonts)
    for (const file of f.files) total += statSync(join(fontsDir, f.family, file.name)).size;
  assert.ok(total < 2 * 1024 * 1024, String(total));
});

test("every school has at most two families and all exist in the manifest", () => {
  const known = new Set(manifest().fonts.map((f) => f.family));
  for (const s of SCHOOLS) {
    assert.ok(Array.isArray(s.fonts) && s.fonts.length >= 1 && s.fonts.length <= 2, s.id);
    for (const fam of s.fonts) assert.ok(known.has(fam), `${s.id}: ${fam}`);
  }
});

// ---- renderer (ARCH-DIRECTIONS-06/07/08/12) ----

const TS = "20260101T000000Z";
const CSP_META = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src 'self'; img-src 'self' data:">`;

function mkProject({ inventory = false, pkg = null, files = {} } = {}) {
  const proj = mkdtempSync(join(tmpdir(), "dirr-"));
  mkdirSync(join(proj, "docs", "design"), { recursive: true });
  writeFileSync(join(proj, "docs", "design", "DESIGN.md"), md);
  if (inventory)
    writeFileSync(join(proj, "docs", "design", "inventory.json"), readFileSync(join(fx, "inventory.json")));
  if (pkg) writeFileSync(join(proj, "package.json"), JSON.stringify(pkg));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(proj, rel)), { recursive: true });
    writeFileSync(join(proj, rel), body);
  }
  return proj;
}
const render = (dj, proj, extra = []) =>
  spawnSync(process.execPath, [
    join(here, "directions.mjs"),
    "--directions",
    dj,
    "--project",
    proj,
    "--timestamp",
    TS,
    ...extra,
  ]);
const runDir = (proj) => join(proj, ".artist", "directions", TS);
const page = (proj) => readFileSync(join(runDir(proj), "directions.html"), "utf8");
const DJ = join(fx, "directions.json");
const tmpJson = (obj) => {
  const f = join(mkdtempSync(join(tmpdir(), "dirj-")), "d.json");
  writeFileSync(f, JSON.stringify(obj));
  return f;
};
const scriptsOf = (html) => [...html.matchAll(/<script(?![^>]*type=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

test("render writes only directions.html and fonts/ under the UTC-timestamped run dir", () => {
  const proj = mkProject();
  const r = render(DJ, proj);
  assert.equal(r.status, 0, r.stderr.toString());
  assert.deepEqual(readdirSync(join(proj, ".artist", "directions")), [TS]);
  assert.deepEqual(readdirSync(runDir(proj)).sort(), ["directions.html", "fonts"]);
  assert.deepEqual(readdirSync(proj).sort(), [".artist", "docs"]);
});

test("sample-screen aliases follow Current's own token names, so shape, motion and spacing changes show", () => {
  const renamed = md
    .replaceAll("space.2", "spacing.sm")
    .replaceAll("space.4", "spacing.md")
    .replaceAll("radius.md", "rounded.lg")
    .replace("| body |", "| font.body |")
    .replace("| heading |", "| font.title |")
    .replaceAll("dur.fast", "duration.quick")
    .replaceAll("ease.out", "easing.standard");
  const proj = mkProject();
  writeFileSync(join(proj, "docs", "design", "DESIGN.md"), renamed);
  const d = valid();
  for (const x of d.directions) for (const a of ["type", "shape", "motion", "base"]) x[a] = {};
  Object.assign(d.directions[0], {
    shape: { "rounded.lg": "0px" },
    motion: { "duration.quick": "0ms" },
    base: { "spacing.md": "24px" },
  });
  const r = render(tmpJson(d), proj);
  assert.equal(r.status, 0, r.stderr.toString());
  const html = page(proj);
  for (const [slot, v] of [
    ["sp2", "--spacing-sm,8px"],
    ["sp4", "--spacing-md,16px"],
    ["radius", "--rounded-lg,8px"],
    ["fs-body", "--font-body,1rem"],
    ["fs-head", "--font-title,1.5rem"],
    ["dur", "--duration-quick,150ms"],
    ["ease", "--easing-standard,ease-out"],
  ])
    assert.ok(html.includes(`--s-${slot}:var(${v})`), `--s-${slot} should read var(${v})`);
  for (const decl of ["--rounded-lg:0px", "--duration-quick:0ms", "--spacing-md:24px"])
    assert.ok(html.includes(decl), decl);
});

test("two runs with the same inputs are byte-identical", () => {
  const proj = mkProject();
  const snap = () => {
    const walk = (d) =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
      );
    return walk(runDir(proj))
      .sort()
      .map((f) => [f, createHash("sha256").update(readFileSync(f)).digest("hex")]);
  };
  assert.equal(render(DJ, proj).status, 0);
  const a = snap();
  assert.equal(render(DJ, proj).status, 0);
  assert.deepEqual(snap(), a);
  assert.ok(a.length > 1);
});

test("the page has Current and every direction on the fixed sample screen", () => {
  const proj = mkProject();
  render(DJ, proj);
  const html = page(proj);
  for (const id of ["current", "swiss-grid", "bold-block", "paper", "northern-lights"])
    assert.match(html, new RegExp(`class="card"[^>]*data-card="${id}"`), id);
  for (const c of ["nav", "card-sample", "list", "badge-sample", "btn-primary", "btn-secondary", "signin-form"])
    assert.match(html, new RegExp(`class="[^"]*\\b${c}\\b`), c);
  assert.equal((html.match(/data-v="swiss-grid"/g) ?? []).length >= 2, true);
});

test("every view is present: final grid and one-at-a-time, specimen, pick and mix", () => {
  const proj = mkProject();
  render(DJ, proj);
  const html = page(proj);
  for (const s of [
    'id="view-final"',
    'data-layout="grid"',
    'data-layout-btn="grid"',
    'data-layout-btn="one"',
    'id="view-specimen"',
    'id="view-mix"',
    'data-view-btn="final"',
    'data-view-btn="specimen"',
    'data-view-btn="mix"',
    'data-axis="base"',
    'data-axis="palette"',
    'data-axis="type"',
    'data-axis="shape"',
    'data-axis="motion"',
    'data-v="mix"',
    'data-mode-btn="dark"',
    'data-mode-btn="light"',
    'id="toggle-rm"',
    'id="toggle-rt"',
    'id="mix-diff"',
    'id="mix-impact"',
    'id="mix-contrast"',
    'id="pickline"',
    "artist-pick v1",
  ])
    assert.ok(html.includes(s), s);
  assert.match(html, /class="cell diff"/);
  assert.match(html, /class="swatch"/);
  assert.match(html, /class="ramp"/);
  assert.match(html, /class="motion-dot"/);
});

test("CSP meta is exact, no external URLs, fonts only under fonts/", () => {
  const proj = mkProject();
  render(DJ, proj);
  const html = page(proj);
  assert.ok(html.includes(CSP_META));
  assert.doesNotMatch(html, /https?:/i);
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']?(?:https?:|\/\/)/i);
  const urls = [...html.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1].replace(/["']/g, ""));
  assert.ok(urls.length > 0);
  for (const u of urls) assert.match(u, /^fonts\/[a-z0-9._/-]+\.woff2$/, u);
});

test("only the fonts a run uses are copied", () => {
  const proj = mkProject();
  render(DJ, proj);
  assert.deepEqual(readdirSync(join(runDir(proj), "fonts")).sort(), [
    "fraunces",
    "inter",
    "inter-tight",
    "sora",
    "space-grotesk",
    "space-mono",
  ]);
  assert.ok(existsSync(join(runDir(proj), "fonts", "sora", "sora-latin-400-normal.woff2")));
});

test("a <script> in a brief, concept or evidence renders escaped", () => {
  const d = valid();
  d.directions[0].brief = "<script>alert(1)</script>";
  d.current.concept = "<img src=x onerror=alert(2)>";
  d.current.evidence = ['"><script>alert(3)</script>'];
  const proj = mkProject();
  const r = render(tmpJson(d), proj);
  assert.equal(r.status, 0, r.stderr.toString());
  const html = page(proj);
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(2)&gt;"));
  assert.doesNotMatch(html, /<script>alert|<img src=x/);
  assert.equal(scriptsOf(html).length, 1);
});

test("inline script only switches precomputed values: no eval, Function or innerHTML", () => {
  const proj = mkProject();
  render(DJ, proj);
  const [js] = scriptsOf(page(proj));
  assert.ok(js.length > 500);
  assert.doesNotMatch(
    js,
    /\beval\b|\bFunction\b|innerHTML|outerHTML|insertAdjacentHTML|document\.write|setTimeout\(\s*["']/,
  );
});

test("no input path accepts HTML: renderer ignores markup keys and fails unknown ones", () => {
  const d = valid();
  d.directions[0].markup = "<b>x</b>";
  const r = render(tmpJson(d), mkProject());
  assert.equal(r.status, 2);
});

test("the 3:1 fixture renders a visible contrast badge per direction and in the mix, exit 0", () => {
  const proj = mkProject();
  const r = render(join(fx, "low-contrast.json"), proj);
  assert.equal(r.status, 0, r.stderr.toString());
  const html = page(proj);
  assert.match(html, /<span class="badge warn"[^>]*>[^<]*text on background[^<]*\(light\)[^<]*3\.03:1/);
  const data = JSON.parse(html.match(/<script type="application\/json" id="directions-data">([\s\S]*?)<\/script>/)[1]);
  assert.ok(data.contrast["swiss-grid"].some((w) => w.pair === "text on background" && w.ratio === 3.03));
  assert.deepEqual(data.contrast.current, []);
  assert.match(html, /id="mix-contrast"/);
});

test("a gradient pair renders a not-checked badge and the mix never claims all-pass for it", () => {
  const d = valid();
  d.directions[0].palette["color.background"] = { light: "linear-gradient(90deg, #ffffff, #eeeeee)", dark: "#000000" };
  const proj = mkProject();
  const r = render(tmpJson(d), proj);
  assert.equal(r.status, 0, r.stderr.toString());
  const html = page(proj);
  assert.match(html, /<span class="badge warn"[^>]*>Not checked: text on background \(light\) not computed/);
  const data = JSON.parse(html.match(/id="directions-data">([\s\S]*?)<\/script>/)[1]);
  const id = d.directions[0].id;
  assert.ok(data.contrast[id].some((w) => w.ratio === null && /not computed/.test(w.note)));
  assert.equal(data.computed.current, 16);
  assert.ok(data.computed[id] < 16);
  // the mix shows the all-pass note only with no warnings and at least one computed pair
  assert.match(html, /if \(!warns\.length && computed\)/);
});

test("invalid input exits 2 and writes nothing", () => {
  const proj = mkProject();
  for (const f of ["unknown-school.json", "css-url.json", "css-semicolon.json", "missing-dark.json"]) {
    const r = render(join(fx, "invalid", f), proj);
    assert.equal(r.status, 2, f);
  }
  assert.equal(existsSync(join(proj, ".artist")), false);
  const d = valid();
  d.directions[2].type.body = "Comic Sans, serif";
  assert.equal(render(tmpJson(d), proj).status, 2);
  const noMd = mkdtempSync(join(tmpdir(), "dirn-"));
  assert.equal(render(DJ, noMd).status, 2);
  assert.equal(spawnSync(process.execPath, [join(here, "directions.mjs"), "--directions", DJ]).status, 2);
});

test("the impact list joins the inventory, says so when it is absent, and reuse.json drives won't-carry", () => {
  const withInv = mkProject({ inventory: true });
  render(DJ, withInv, ["--reuse", join(fx, "reuse-all.json")]);
  let html = page(withInv);
  const data = JSON.parse(html.match(/id="directions-data">([\s\S]*?)<\/script>/)[1]);
  assert.ok(
    data.axes.palette["bold-block"].impact.some(
      (i) => i.token === "color.accent" && i.components.some((c) => c.name === "Button"),
    ),
  );
  assert.ok(data.axes.palette["bold-block"].wont.some((w) => w.value === "#123456"));
  const bare = mkProject();
  render(DJ, bare);
  html = page(bare);
  assert.match(html, /design-system init/);
  assert.match(html, /design-system audit/);
});

test("React Native projects are labelled as a web approximation", () => {
  const rn = mkProject({ pkg: { dependencies: { "react-native": "0.76.0" } } });
  render(DJ, rn);
  assert.match(page(rn), /web approximation/i);
  const web = mkProject({ pkg: { dependencies: { react: "19.0.0" } } });
  render(DJ, web);
  assert.doesNotMatch(page(web), /web approximation/i);
});

test("the project's font loads by relative path when found via token files, else a labelled fallback", () => {
  const css = '@font-face { font-family: "Acme Sans"; src: url("../assets/acme.woff2") format("woff2"); }\n';
  const has = mkProject({ files: { "src/tokens.css": css, "assets/acme.woff2": "wOF2DATA" } });
  assert.equal(render(DJ, has).status, 0);
  assert.ok(existsSync(join(runDir(has), "fonts", "current", "acme.woff2")));
  assert.match(page(has), /url\(fonts\/current\/acme\.woff2\)/);
  const none = mkProject({ files: { "src/tokens.css": css } });
  render(DJ, none);
  assert.doesNotMatch(page(none), /fonts\/current/);
  assert.match(page(none), /Acme Sans[^<]*fallback stack/);
  const escape = mkProject({
    files: { "src/tokens.css": css.replace("../assets/acme", "../../../etc/acme"), "assets/acme.woff2": "x" },
  });
  render(DJ, escape);
  assert.doesNotMatch(page(escape), /fonts\/current/);
});

test("the project font must be a real woff/woff2 file inside the project; an outward symlink is not copied", () => {
  const css = '@font-face { font-family: "Acme Sans"; src: url("../assets/acme.woff2") format("woff2"); }\n';
  const outside = join(mkdtempSync(join(tmpdir(), "dirx-")), "secret.woff2");
  writeFileSync(outside, "wOF2 outside the project");
  const link = mkProject({ files: { "src/tokens.css": css } });
  mkdirSync(join(link, "assets"), { recursive: true });
  symlinkSync(outside, join(link, "assets", "acme.woff2"));
  assert.equal(render(DJ, link).status, 0);
  assert.ok(!existsSync(join(runDir(link), "fonts", "current")));
  assert.doesNotMatch(page(link), /fonts\/current/);
  const fake = mkProject({ files: { "src/tokens.css": css, "assets/acme.woff2": "not a font" } });
  assert.equal(render(DJ, fake).status, 0);
  assert.doesNotMatch(page(fake), /fonts\/current/);
});

test("CLI: a Svelte component in the project marks impact unsupported on the page and in pick.json", () => {
  const proj = mkProject({ inventory: true, files: { "src/Card.svelte": "<div/>" } });
  assert.equal(render(DJ, proj).status, 0);
  assert.match(page(proj), /unsupported component format \(src\/Card\.svelte\)/);
  const r = spawnSync(process.execPath, [
    join(here, "directions.mjs"),
    "--resolve",
    LINE,
    "--directions",
    DJ,
    "--project",
    proj,
  ]);
  assert.equal(r.status, 0, r.stderr.toString());
  const pick = JSON.parse(readFileSync(join(runDir(proj), "pick.json"), "utf8"));
  assert.deepEqual(pick.impact.unsupported, ["src/Card.svelte"]);
  assert.ok(pick.impact.items.every((i) => i.unsupported));
});

test("CLI --resolve ignores run directories that are not UTC timestamps", () => {
  const proj = mkProject();
  assert.equal(render(DJ, proj).status, 0);
  mkdirSync(join(proj, ".artist", "directions", "old"));
  const r = spawnSync(process.execPath, [
    join(here, "directions.mjs"),
    "--resolve",
    LINE,
    "--directions",
    DJ,
    "--project",
    proj,
  ]);
  assert.equal(r.status, 0, r.stderr.toString());
  assert.ok(existsSync(join(runDir(proj), "pick.json")));
  assert.ok(!existsSync(join(proj, ".artist", "directions", "old", "pick.json")));
});

test("CLI --resolve after render writes pick.json into the render's run dir", () => {
  const proj = mkProject();
  assert.equal(render(DJ, proj).status, 0);
  const ok = spawnSync(process.execPath, [
    join(here, "directions.mjs"),
    "--resolve",
    LINE,
    "--directions",
    DJ,
    "--project",
    proj,
  ]);
  assert.equal(ok.status, 0, ok.stderr.toString());
  assert.ok(existsSync(join(runDir(proj), "pick.json")));
  const bad = spawnSync(process.execPath, [
    join(here, "directions.mjs"),
    "--resolve",
    "artist-pick v1 base=nope",
    "--directions",
    DJ,
    "--project",
    proj,
  ]);
  assert.equal(bad.status, 2);
});

// skills: the directions procedure, create's optional step and design-system's apply step
const skillDoc = (...p) => readFileSync(join(here, "..", "skills", ...p), "utf8");
const section = (doc, heading) => doc.split(`\n${heading}\n`)[1].split("\n## ")[0];

test("directions.md requires an evidenced concept, never a score, and never dispatches agents", () => {
  const doc = skillDoc("create", "references", "directions.md");
  const proc = section(doc, "## Procedure");
  assert.match(proc, /`evidence`: DESIGN\.md rows .* or code `file:line`/);
  assert.match(proc, /as a judgement with that evidence, never as a score/);
  assert.match(proc, /3 to 5/);
  assert.match(proc, /at least one must be ambitious/);
  assert.match(proc, /scrims/);
  assert.match(proc, /prefers-reduced-motion/);
  assert.match(proc, /prefers-reduced-transparency/);
  assert.match(proc, /LCP within 2500 ms/);
  assert.doesNotMatch(doc, /subagent_type|\bAgent\s*\(|\bTask\s*\(/);
  for (const l of doc.split("\n").filter((l) => /dispatch|design-critic/i.test(l)))
    assert.match(l, /\b(not|never|Never)\b/, `dispatch line must be a prohibition: ${l}`);
});

test("create names --directions only in an optional step 0 linking directions.md; Loop and Stop condition unchanged", () => {
  const doc = skillDoc("create", "SKILL.md");
  const lines = doc.split("\n").filter((l) => l.includes("--directions"));
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^argument-hint: .*\[--directions \[n\]\]/);
  assert.match(lines[1], /^0\. Optional, only with `--directions \[n\]`: .*\(references\/directions\.md\)/);
  const sha = (s) => createHash("sha256").update(s).digest("hex");
  assert.equal(
    sha(section(doc, "## Loop (max 3 rounds)")),
    "0e0d3c2a685dc8346b76ddc0f785a69a353fd6bb36030e0ee0755b3216dc524d",
  );
  assert.equal(
    sha(section(doc, "## Stop condition")),
    "326d65b9dc389bb8631928730805ec45454a9f1f4e799308c771695be24ea25e",
  );
  assert.deepEqual(readdirSync(join(here, "..", "skills")).sort(), ["create", "design-system", "optimise", "verify"]);
  assert.deepEqual(readdirSync(join(here, "..", "agents")), ["design-critic.md"]);
});

test("the pick goes to design-system init step 8 as one diff to the current theme; nothing else writes DESIGN.md", () => {
  const apply = section(skillDoc("create", "references", "directions.md"), "## Apply");
  assert.match(apply, /`design-system` skill's init step 8/);
  assert.match(apply, /once, as one diff to the current theme, only after the user accepts it/);
  assert.match(apply, /Do not edit `docs\/design\/DESIGN\.md` or any token file here/);
  const step8 = skillDoc("design-system", "SKILL.md").split("\n8. ")[1].split("\n9. ")[0];
  assert.match(step8, /`pick\.json`/);
  assert.match(step8, /never as a new `data-brand` set/);
  assert.match(step8, /Apply it once, only after the user accepts it/);
  assert.match(step8, /`wontCarry`/);
  const src = readFileSync(join(here, "directions.mjs"), "utf8");
  for (const m of src.matchAll(/writeFileSync\(([^,]+),/g)) assert.doesNotMatch(m[1], /DESIGN|token/i);
});
