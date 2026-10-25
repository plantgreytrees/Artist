import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, "fixtures", "inventory");
const CLI = join(here, "inventory.mjs");
const START = "<!-- artist:inventory:start -->";
const END = "<!-- artist:inventory:end -->";

const copy = () => {
  const d = mkdtempSync(join(tmpdir(), "inv-"));
  cpSync(FIX, d, { recursive: true });
  return d;
};
const run = (dir) => spawnSync(process.execPath, [CLI, "--project", dir], { encoding: "utf8" });
const generate = () => {
  const dir = copy();
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  const inv = JSON.parse(readFileSync(join(dir, "docs/design/inventory.json"), "utf8"));
  return { dir, inv, r };
};

test("inventory.json has schema 1", () => {
  assert.equal(generate().inv.schema, 1);
});

test("Button: props, variants, tokens, usage, status", () => {
  const b = generate().inv.components.find((c) => c.name === "Button");
  assert.ok(b);
  assert.match(b.path, /components\/Button\.tsx$/);
  const v = b.props.find((p) => p.name === "variant");
  assert.deepEqual(v.values, ["primary", "secondary"]);
  assert.equal(v.optional, false);
  assert.equal(b.props.find((p) => p.name === "disabled").optional, true);
  assert.deepEqual(b.variants, { variant: ["primary", "secondary"] });
  assert.ok(b.tokensUsed.includes("--color-action-primary"));
  assert.equal(b.usage.count, 2);
  assert.deepEqual(
    b.usage.files.map((f) => f.replace(/^.*\/app\//, "app/")),
    ["app/pricing/page.tsx"],
  );
  assert.equal(b.status, "current");
});

test("Card is deprecated", () => {
  const c = generate().inv.components.find((c) => c.name === "Card");
  assert.equal(c.status, "deprecated");
  assert.equal(c.usage.count, 0);
});

test("layout lists wrapped route", () => {
  const l = generate().inv.layouts.find((l) => l.path.endsWith("app/layout.tsx"));
  assert.ok(l);
  assert.equal(l.name, "RootLayout");
  assert.ok(l.routes.includes("/pricing"));
});

test("schemas: zod, JSON Schema, TS type", () => {
  const s = generate().inv.schemas;
  const zod = s.find((x) => x.kind === "zod");
  assert.equal(zod.name, "SignupSchema");
  assert.deepEqual(zod.fields, ["email", "password"]);
  const js = s.find((x) => x.kind === "json-schema");
  assert.equal(js.name, "Order");
  assert.deepEqual(js.fields, ["id", "total"]);
  const ts = s.find((x) => x.kind === "ts-type");
  assert.equal(ts.name, "PriceProps");
});

test("packages from both workspaces with capability tags", () => {
  const p = generate().inv.packages;
  const by = (n) => p.find((x) => x.name === n);
  assert.equal(by("chart.js").capability, "charts");
  assert.equal(by("lucide-react").capability, "icons");
  assert.equal(by("react").capability, null);
  assert.ok(by("typescript"), "root workspace dependency listed");
  assert.equal(by("zod").version, "3.23.0");
});

test("node_modules and .artist are skipped", () => {
  const dir = copy();
  for (const d of ["node_modules/x", ".artist/run"]) {
    mkdirSync(join(dir, d), { recursive: true });
    writeFileSync(join(dir, d, "Ghost.tsx"), "export function Ghost() { return null; }\n");
    writeFileSync(join(dir, d, "package.json"), '{"dependencies":{"ghostpkg":"1"}}');
  }
  assert.equal(run(dir).status, 0);
  const inv = JSON.parse(readFileSync(join(dir, "docs/design/inventory.json"), "utf8"));
  assert.ok(!inv.components.some((c) => c.name === "Ghost"));
  assert.ok(!inv.packages.some((c) => c.name === "ghostpkg"));
});

test("unparseable items are listed under unparsed", () => {
  const dir = copy();
  writeFileSync(join(dir, "apps/web/schemas/bad.schema.json"), "{ not json");
  assert.equal(run(dir).status, 0);
  const inv = JSON.parse(readFileSync(join(dir, "docs/design/inventory.json"), "utf8"));
  assert.ok(inv.unparsed.some((u) => u.path.endsWith("bad.schema.json")));
});

test("DESIGN.md outside markers is byte-identical; inside has tables", () => {
  const dir = copy();
  const before = readFileSync(join(dir, "DESIGN.md"), "utf8");
  assert.equal(run(dir).status, 0);
  const after = readFileSync(join(dir, "DESIGN.md"), "utf8");
  const cut = (s) => [s.slice(0, s.indexOf(START) + START.length), s.slice(s.indexOf(END))];
  assert.deepEqual(cut(after), cut(before));
  const inside = after.slice(after.indexOf(START), after.indexOf(END));
  for (const h of ["## Components", "## Layouts", "## Schemas", "## Packages"]) assert.ok(inside.includes(h), h);
  assert.match(inside, /\| Button \| .*Button\.tsx \|/);
  assert.match(inside, /\| chart\.js \| 4\.4\.3 \| charts \|/);
  assert.match(inside, /\/pricing/);
  assert.ok(!inside.includes("stale generated content"));
  const again = run(dir);
  assert.equal(again.status, 0);
  assert.equal(readFileSync(join(dir, "DESIGN.md"), "utf8"), after, "idempotent");
});

test("prefers docs/design/DESIGN.md when present", () => {
  const dir = copy();
  mkdirSync(join(dir, "docs/design"), { recursive: true });
  const md = readFileSync(join(dir, "DESIGN.md"), "utf8");
  writeFileSync(join(dir, "docs/design/DESIGN.md"), md);
  assert.equal(run(dir).status, 0);
  assert.ok(readFileSync(join(dir, "docs/design/DESIGN.md"), "utf8").includes("| Button |"));
  assert.equal(readFileSync(join(dir, "DESIGN.md"), "utf8"), md);
});

test("format 1 DESIGN.md exits 2", () => {
  const dir = copy();
  const md = readFileSync(join(dir, "DESIGN.md"), "utf8").replace("format: 2", "format: 1");
  writeFileSync(join(dir, "DESIGN.md"), md);
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /rerun design-system init/);
  assert.equal(readFileSync(join(dir, "DESIGN.md"), "utf8"), md);
});

test("missing DESIGN.md exits 2", async () => {
  const dir = copy();
  (await import("node:fs")).rmSync(join(dir, "DESIGN.md"));
  assert.equal(run(dir).status, 2);
});

test("buildInventory is pure and exported", async () => {
  const { buildInventory, renderSections } = await import("./inventory.mjs");
  const inv = buildInventory([{ path: "package.json", content: '{"dependencies":{"zustand":"4"}}' }]);
  assert.equal(inv.packages[0].capability, "state");
  assert.match(renderSections(inv), /## Packages/);
});

test("Unparsed renders as a level-2 section", async () => {
  const { renderSections } = await import("./inventory.mjs");
  const out = renderSections({
    components: [],
    layouts: [],
    schemas: [],
    packages: [],
    unparsed: [{ path: "a.schema.json", reason: "bad" }],
  });
  assert.match(out, /^## Unparsed$/m);
  assert.doesNotMatch(out, /^###/m);
});

test("CAPS, capOf and formatOf are exported from inventory.mjs and defined once", async () => {
  const inv = await import("./inventory.mjs");
  assert.equal(inv.capOf("recharts"), "charts");
  assert.equal(inv.capOf("nothing"), null);
  assert.ok(inv.CAPS.charts.includes("d3"));
  assert.equal(inv.formatOf("---\nformat: 2\n---\n"), 2);
  assert.equal(inv.formatOf("# x"), 1);
  const src = readFileSync(join(here, "reuse-check.mjs"), "utf8");
  assert.doesNotMatch(src, /const CAPS\b|const capOf\b|function formatOf\b/);
});

test("listProjectFiles honours .gitignore in a repo and walks outside git", async () => {
  const { listProjectFiles } = await import("./inventory.mjs");
  const d = mkdtempSync(join(tmpdir(), "lpf-"));
  mkdirSync(join(d, "gen"));
  mkdirSync(join(d, "src"));
  mkdirSync(join(d, "node_modules/x"), { recursive: true });
  writeFileSync(join(d, "gen/a.tsx"), "x");
  writeFileSync(join(d, "src/b.tsx"), "x");
  writeFileSync(join(d, "src/gone.tsx"), "x");
  writeFileSync(join(d, "node_modules/x/c.js"), "x");
  assert.deepEqual(listProjectFiles(d), ["gen/a.tsx", "src/b.tsx", "src/gone.tsx"]);
  const g = (...a) => spawnSync("git", ["-C", d, ...a], { encoding: "utf8" });
  g("init", "-q");
  writeFileSync(join(d, ".gitignore"), "gen/\n");
  g("add", "-A");
  g("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "c");
  (await import("node:fs")).rmSync(join(d, "src/gone.tsx"));
  assert.deepEqual(listProjectFiles(d), [".gitignore", "src/b.tsx"]);
});

test("an ignored project directory inside a parent repo is still listed", async () => {
  const { listProjectFiles } = await import("./inventory.mjs");
  const root = mkdtempSync(join(tmpdir(), "inv-ignored-"));
  const git = (...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });
  git("init", "-q");
  writeFileSync(join(root, ".gitignore"), "app/\n");
  git("add", ".gitignore");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "base");
  mkdirSync(join(root, "app/src/components"), { recursive: true });
  writeFileSync(join(root, "app/src/components/X.tsx"), "export function X() { return null; }\n");
  assert.deepEqual(listProjectFiles(join(root, "app")), ["src/components/X.tsx"]);
});

const ignoredApp = (parentIgnore) => {
  const root = mkdtempSync(join(tmpdir(), "inv-ignored-"));
  const git = (...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });
  git("init", "-q");
  writeFileSync(join(root, ".gitignore"), parentIgnore);
  git("add", ".gitignore");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "base");
  mkdirSync(join(root, "app/src"), { recursive: true });
  writeFileSync(join(root, "app/src/a.tsx"), "export const a = 1;\n");
  return join(root, "app");
};

test("an ignored project directory still honours its own .gitignore", async () => {
  const { listProjectFiles } = await import("./inventory.mjs");
  const app = ignoredApp("app/\n");
  writeFileSync(join(app, ".gitignore"), "generated/\n");
  mkdirSync(join(app, "generated"), { recursive: true });
  writeFileSync(join(app, "generated/bundle.js"), "x\n");
  mkdirSync(join(app, "dist"), { recursive: true });
  writeFileSync(join(app, "dist/out.js"), "x\n");
  assert.deepEqual(listProjectFiles(app), [".gitignore", "src/a.tsx"]);
});

test("a parent pattern that ignores only the contents still lists the project", async () => {
  const { listProjectFiles } = await import("./inventory.mjs");
  const app = ignoredApp("/app/**\n");
  assert.deepEqual(listProjectFiles(app), ["src/a.tsx"]);
});

test("node_modules inside an ignored project is never listed", async () => {
  const { listProjectFiles } = await import("./inventory.mjs");
  const app = ignoredApp("app/\n");
  mkdirSync(join(app, "node_modules"), { recursive: true });
  writeFileSync(join(app, "node_modules/x.js"), "x\n");
  assert.deepEqual(listProjectFiles(app), ["src/a.tsx"]);
});
