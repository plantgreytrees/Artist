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

// ---- Vue single-file components ----

const NUXT_PKG = { path: "web/package.json", content: '{"dependencies":{"nuxt":"3","pinia":"2","@nuxt/ui":"3"}}' };
const vueInv = async (files, opts) => (await import("./inventory.mjs")).buildInventory([NUXT_PKG, ...files], opts);
const comp = (inv, name) => inv.components.find((c) => c.name === name);

test("Vue: type-based defineProps with withDefaults, Nuxt path-prefixed name, tokens", async () => {
  const inv = await vueInv([
    {
      path: "web/components/shared/SectionCard.vue",
      content: `<script setup lang="ts">
interface Props {
  title?: string
  accent?: 'none' | 'brand' | 'warn'
  count: number
}
const props = withDefaults(defineProps<Props>(), { accent: 'none' })
</script>
<template><section :title="title">{{ count }}</section></template>
<style scoped>section { color: var(--fg-default); padding: var(--space-2); }</style>
`,
    },
  ]);
  const c = comp(inv, "SharedSectionCard");
  assert.ok(c, JSON.stringify(inv.components));
  assert.equal(c.path, "web/components/shared/SectionCard.vue");
  assert.deepEqual(
    c.props.map((p) => p.name + (p.optional ? "?" : "")),
    ["title?", "accent?", "count"],
  );
  assert.deepEqual(c.variants, { accent: ["none", "brand", "warn"] });
  assert.deepEqual(c.tokensUsed, ["--fg-default", "--space-2"]);
  assert.equal(c.status, "current");
});

test("Vue: Nuxt drops a prefix the file name repeats, and names index.vue after its folder", async () => {
  const inv = await vueInv([
    { path: "web/components/shared/SharedBadge.vue", content: "<template><span/></template>" },
    { path: "web/components/base/foo-bar.vue", content: "<template><span/></template>" },
    { path: "web/components/menu/index.vue", content: "<template><nav/></template>" },
  ]);
  assert.deepEqual(inv.components.map((c) => c.name).sort(), ["BaseFooBar", "Menu", "SharedBadge"]);
});

test("Vue: inline, runtime-object, array and Options API props", async () => {
  const inv = await vueInv([
    {
      path: "web/components/Inline.vue",
      content: `<script setup lang="ts">\ndefineProps<{ label: string; size?: 'sm' | 'lg' }>()\n</script>`,
    },
    {
      path: "web/components/Runtime.vue",
      content: `<script setup>\ndefineProps({\n  label: { type: String, required: true },\n  size: { type: String, default: 'sm' },\n  open: Boolean,\n})\n</script>`,
    },
    { path: "web/components/Listed.vue", content: `<script setup>\ndefineProps(['a', "b"])\n</script>` },
    {
      path: "web/components/Legacy.vue",
      content: `<script>\nexport default {\n  props: { value: { type: Number, required: true }, hint: String },\n  data() { return {} },\n}\n</script>`,
    },
  ]);
  const sig = (n) => comp(inv, n).props.map((p) => `${p.name}${p.optional ? "?" : ""}:${p.type}`);
  assert.deepEqual(sig("Inline"), ["label:string", "size?:'sm' | 'lg'"]);
  assert.deepEqual(comp(inv, "Inline").variants, { size: ["sm", "lg"] });
  assert.deepEqual(sig("Runtime"), ["label:String", "size?:String", "open?:Boolean"]);
  assert.deepEqual(sig("Listed"), ["a?:unknown", "b?:unknown"]);
  assert.deepEqual(sig("Legacy"), ["value:Number", "hint?:String"]);
});

test("Vue: a props type from another file and intersections are resolved", async () => {
  const inv = await vueInv([
    {
      path: "web/types/schema.ts",
      content: "export interface RendererProps {\n  nodes: string[]\n  dense?: boolean\n}\n",
    },
    {
      path: "web/components/Erd.vue",
      content: `<script setup lang="ts">\nimport type { RendererProps } from '~/types/schema'\nwithDefaults(defineProps<RendererProps & { variant?: 'a' | 'b' }>(), {})\n</script>`,
    },
    {
      path: "web/components/Ghost.vue",
      content: `<script setup lang="ts">\nimport type { MissingProps } from 'somewhere'\ndefineProps<MissingProps>()\n</script>`,
    },
  ]);
  assert.deepEqual(
    comp(inv, "Erd").props.map((p) => p.name),
    ["nodes", "dense", "variant"],
  );
  assert.deepEqual(comp(inv, "Ghost").props, []);
  assert.ok(inv.unparsed.some((u) => u.path === "web/components/Ghost.vue" && /MissingProps/.test(u.reason)));
});

test("Vue: usage counts Nuxt auto-imported tags (Pascal, kebab, Lazy) and explicit imports", async () => {
  const inv = await vueInv([
    { path: "web/components/shared/PageHeader.vue", content: "<template><h1/></template>" },
    { path: "web/components/dashboard/overview/OverviewBoard.vue", content: "<template><div/></template>" },
    {
      path: "web/pages/index.vue",
      content: `<script setup lang="ts">\nimport OverviewBoard from '~/components/dashboard/overview/OverviewBoard.vue'\n</script>\n<template>\n  <SharedPageHeader title="x" />\n  <shared-page-header/>\n  <LazySharedPageHeader>\n  </LazySharedPageHeader>\n  <SharedPageHeaderTitle />\n  <OverviewBoard/>\n</template>`,
    },
  ]);
  assert.deepEqual(comp(inv, "SharedPageHeader").usage, { count: 3, files: ["web/pages/index.vue"] });
  assert.deepEqual(comp(inv, "DashboardOverviewBoard").usage, { count: 1, files: ["web/pages/index.vue"] });
});

test("Vue: an aliased import resolves in a Nuxt app at the project root", async () => {
  const { buildInventory } = await import("./inventory.mjs");
  const inv = buildInventory([
    { path: "package.json", content: '{"dependencies":{"nuxt":"3"}}' },
    { path: "components/overview/OverviewBoard.vue", content: "<template><div/></template>" },
    {
      path: "components/Stage.vue",
      content:
        "<script setup>\nimport Board from '~/components/overview/OverviewBoard.vue'\n</script>\n<template>\n  <Board\n    dense\n  />\n</template>",
    },
  ]);
  assert.deepEqual(comp(inv, "OverviewBoard").usage, { count: 1, files: ["components/Stage.vue"] });
});

test("Vue: pages and app.vue are not components; Nuxt layouts list their routes", async () => {
  const inv = await vueInv([
    { path: "web/app.vue", content: "<template><NuxtLayout><NuxtPage/></NuxtLayout></template>" },
    { path: "web/layouts/default.vue", content: "<template><slot/></template>" },
    { path: "web/layouts/auth.vue", content: "<template><slot/></template>" },
    { path: "web/pages/index.vue", content: "<template><div/></template>" },
    {
      path: "web/pages/admin/[id].vue",
      content: `<script setup>\ndefinePageMeta({ layout: 'default', middleware: 'role' })\n</script>`,
    },
    { path: "web/pages/auth/login.vue", content: `<script setup>\ndefinePageMeta({ layout: 'auth' })\n</script>` },
    { path: "web/pages/embed.vue", content: `<script setup>\ndefinePageMeta({ layout: false })\n</script>` },
  ]);
  assert.deepEqual(inv.components, []);
  assert.deepEqual(
    inv.layouts.map((l) => [l.name, l.path, l.routes]),
    [
      ["auth", "web/layouts/auth.vue", ["/auth/login"]],
      ["default", "web/layouts/default.vue", ["/", "/admin/[id]"]],
    ],
  );
});

test("Vue: deprecated by a leading comment or by DESIGN.md, not by a deprecated prop", async () => {
  const inv = await vueInv(
    [
      { path: "web/components/OldPill.vue", content: "<!-- @deprecated use Badge -->\n<template><span/></template>" },
      {
        path: "web/components/OldTag.vue",
        content: '<script setup lang="ts">\n/** @deprecated */\ndefineProps<{ a: string }>()\n</script>',
      },
      { path: "web/components/Chip.vue", content: "<template><span/></template>" },
      {
        path: "web/components/Fine.vue",
        content: '<script setup lang="ts">\ndefineProps<{\n  /** @deprecated */\n  a?: string\n}>()\n</script>',
      },
    ],
    {
      designMd:
        "## Decisions\n| id | decision | why | date | supersedes |\n|---|---|---|---|---|\n| D1 | Deprecate Chip | old | 2026-01-01 | |\n",
    },
  );
  assert.deepEqual(
    inv.components.map((c) => [c.name, c.status]),
    [
      ["Chip", "deprecated"],
      ["Fine", "current"],
      ["OldPill", "deprecated"],
      ["OldTag", "deprecated"],
    ],
  );
});

test("Vue outside Nuxt: names are file names, usage needs an import", async () => {
  const { buildInventory } = await import("./inventory.mjs");
  const inv = buildInventory([
    { path: "package.json", content: '{"dependencies":{"vue":"3"}}' },
    {
      path: "src/App.vue",
      content:
        "<script setup>\nimport TheButton from './components/ui/TheButton.vue'\n</script>\n<template><TheButton/><Other/></template>",
    },
    { path: "src/components/ui/TheButton.vue", content: "<template><button/></template>" },
    { path: "src/components/ui/Other.vue", content: "<template><i/></template>" },
  ]);
  assert.deepEqual(
    inv.components.map((c) => [c.name, c.usage.count]),
    [
      ["Other", 0],
      ["TheButton", 1],
    ],
  );
});

test("Vue ecosystem packages get capability tags", async () => {
  const { capOf } = await import("./inventory.mjs");
  assert.equal(capOf("pinia"), "state");
  assert.equal(capOf("@nuxt/ui"), "ui-kit");
  assert.equal(capOf("vue-echarts"), "charts");
  assert.equal(capOf("lucide-vue-next"), "icons");
  assert.equal(capOf("vee-validate"), "forms");
  assert.equal(capOf("@vueuse/motion"), "animation");
});

test("CLI picks up .vue files", () => {
  const dir = copy();
  mkdirSync(join(dir, "apps/web/src/components/vue"), { recursive: true });
  writeFileSync(
    join(dir, "apps/web/src/components/vue/Tile.vue"),
    '<script setup lang="ts">\ndefineProps<{ label: string }>()\n</script>\n',
  );
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  const inv = JSON.parse(readFileSync(join(dir, "docs/design/inventory.json"), "utf8"));
  assert.ok(inv.components.some((c) => c.name === "Tile" && c.path === "apps/web/src/components/vue/Tile.vue"));
});

// ---- tokensUsed and deprecation (ARCH-VERIFY-23) ----

import { buildInventory } from "./inventory.mjs";
const TW = join(FIX, "tailwind-v4");
const twMd = readFileSync(join(TW, "DESIGN.md"), "utf8");
const twCss = readFileSync(join(TW, "theme.css"), "utf8");
const tsx = (name, body) => ({
  path: `src/${name}.tsx`,
  content: `export function ${name}() {\n  return ${body};\n}\n`,
});

test("Tailwind v4 fixture: utilities resolve to bound variables via token-refs", () => {
  const inv = buildInventory([{ path: "src/Button.tsx", content: readFileSync(join(TW, "src/Button.tsx"), "utf8") }], {
    designMd: twMd,
    tokenTexts: [twCss],
  });
  const b = inv.components.find((c) => c.name === "Button");
  assert.deepEqual(b.tokensUsed, ["--color-brand", "--color-surface", "--space-4"]);
  assert.equal(inv.schema, 1);
});

test("CLI reads declared token files as text; inventory.json stays schema 1", () => {
  const dir = copy();
  const md = readFileSync(join(TW, "DESIGN.md"), "utf8");
  writeFileSync(join(dir, "DESIGN.md"), md + "\n<!-- artist:inventory:start -->\n<!-- artist:inventory:end -->\n");
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  const inv = JSON.parse(readFileSync(join(dir, "docs/design/inventory.json"), "utf8"));
  const b = inv.components.find((c) => c.path === "tailwind-v4/src/Button.tsx");
  assert.deepEqual(b.tokensUsed, ["--color-brand", "--color-surface", "--space-4"]);
  assert.equal(inv.schema, 1);
});

test("RN theme member chain exact-matching a Semantic name is a token use", () => {
  const md =
    "## Semantic tokens\n| variable | name | primitive | use |\n|---|---|---|---|\n| --color-brand | color.brand | #1d6b4f | u |\n";
  const inv = buildInventory(
    [
      tsx("A", "<View style={{ color: theme.color.brand }} />"),
      tsx("B", "<View style={{ color: theme.color.brandish }} />"),
      tsx("C", "<View style={{ color: other.color.brand }} />"),
    ],
    { designMd: md },
  );
  const used = Object.fromEntries(inv.components.map((c) => [c.name, c.tokensUsed]));
  assert.deepEqual(used, { A: ["--color-brand"], B: [], C: [] });
});

const decisions = (rows) =>
  `## Decisions\n| id | decision | why | date | supersedes |\n|---|---|---|---|---|\n${rows}\n`;

test("a Deprecate <Name> Decisions row deprecates; prose deprecated-in-favour-of deprecates neither", () => {
  const files = [tsx("Chip", "<span />"), tsx("Pill", "<span />"), tsx("Badge", "<span />")];
  const md = decisions("| D1 | Deprecate Chip | old | 2026-01-01 | |") + "\nPill is deprecated in favour of Badge.\n";
  const inv = buildInventory(files, { designMd: md });
  assert.deepEqual(
    inv.components.map((c) => [c.name, c.status]),
    [
      ["Badge", "current"],
      ["Chip", "deprecated"],
      ["Pill", "current"],
    ],
  );
  const prose = buildInventory(files, {
    designMd: decisions("| D1 | Pill is deprecated in favour of Badge | x | 2026-01-01 | |"),
  });
  assert.ok(prose.components.every((c) => c.status === "current"));
});

test("JSDoc @deprecated still deprecates", () => {
  const inv = buildInventory(
    [{ path: "src/Old.tsx", content: "/** @deprecated use New */\nexport function Old() {\n  return <i />;\n}\n" }],
    { designMd: "" },
  );
  assert.equal(inv.components[0].status, "deprecated");
});

test("inventory.mjs never dynamically imports or requires", () => {
  assert.doesNotMatch(readFileSync(CLI, "utf8"), /\brequire\s*\(|\bimport\s*\(/);
});
