import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  formatOf,
  parseFrontmatter,
  parseSections,
  parseTables,
  tableOf,
  tokensOf,
  componentTokensOf,
  decisionsOf,
  bindTokens,
  categoryOf,
  spacingBaseOf,
} from "./design-md.mjs";

const fixture = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

test("formatOf reads format from frontmatter, defaulting to 1", () => {
  assert.equal(formatOf("---\nformat: 2\n---\n# x"), 2);
  assert.equal(formatOf("---\r\nformat: 2\r\n---\r\n"), 2);
  assert.equal(formatOf("# x"), 1);
  assert.equal(formatOf("---\nname: a\n---\n"), 1);
  assert.equal(formatOf("# x\n---\nformat: 2\n---\n"), 1);
});

test("parseFrontmatter returns key/values and the body", () => {
  const { data, body } = parseFrontmatter("---\nformat: 2\nname: Ace\n---\n# Title\n");
  assert.deepEqual(data, { format: "2", name: "Ace" });
  assert.equal(body, "# Title\n");
  assert.deepEqual(parseFrontmatter("# none").data, {});
  assert.equal(parseFrontmatter("# none").body, "# none");
});

test("parseSections splits on ## only, keeping ### inside and ignoring fences", () => {
  const md = "# T\n\n## A\nx\n### A1\ny\n```\n## not a heading\n```\n## B\nz\n";
  const s = parseSections(md);
  assert.deepEqual(
    s.map((x) => x.title),
    ["A", "B"],
  );
  assert.match(s[0].body, /### A1/);
  assert.match(s[0].body, /## not a heading/);
  assert.equal(s[1].body.trim(), "z");
});

test("parseTables keys rows by header name, in any column order", () => {
  const body = "| use | name | value |\n| --- | :-: | --: |\n| tight | space.1 | 4px |\n| a \\| b | space.2 | 8px |\n";
  const [t] = parseTables(body);
  assert.deepEqual(t.headers, ["use", "name", "value"]);
  assert.deepEqual(t.rows[0], { use: "tight", name: "space.1", value: "4px" });
  assert.equal(t.rows[1].use, "a | b");
});

test("parseTables tolerates ### sub-headings and reports them", () => {
  const body = "### One\n| a | b |\n|---|---|\n| 1 | 2 |\n\n### Two\n| a | b |\n|---|---|\n| 3 | 4 |\n";
  const ts = parseTables(body);
  assert.equal(ts.length, 2);
  assert.equal(ts[0].heading, "One");
  assert.equal(ts[1].heading, "Two");
  assert.deepEqual(ts[1].rows, [{ a: "3", b: "4" }]);
});

test("tableOf finds a section by title, case-insensitively", () => {
  const md = "## Spacing\n| name | value |\n|---|---|\n| space.1 | 4px |\n";
  assert.deepEqual(tableOf(md, "spacing"), [{ name: "space.1", value: "4px" }]);
  assert.deepEqual(tableOf(md, "Motion"), []);
});

test("tokensOf reads the fixture Themes shape (### brand, token|light|dark)", () => {
  const t = tokensOf(fixture("./fixtures/reuse/DESIGN.md"));
  assert.deepEqual(t.themes[0], {
    brand: "Brand (default)",
    token: "color.action.primary",
    light: "#1d6b4f",
    dark: "#4fb98f",
  });
  assert.ok(t.spacing.some((r) => r.name === "space.4" && r.value === "16px"));
  assert.ok(t.semantic.some((r) => r.name === "color.surface"));
});

test("tokensOf reads the template Themes shape (brand column) and reordered columns", () => {
  const md =
    "## Themes\n| dark | token | brand | light |\n|---|---|---|---|\n| b | color.x | default | a |\n\n" +
    "## Semantic tokens\n| variable | name | primitive | use |\n|---|---|---|---|\n| --c | color.x | blue | u |\n";
  const t = tokensOf(md);
  assert.deepEqual(t.themes, [{ brand: "default", token: "color.x", light: "a", dark: "b" }]);
  assert.equal(t.semantic[0].variable, "--c");
  assert.equal(t.semantic[0].name, "color.x");
  assert.deepEqual(t.primitives, []);
});

test("componentTokensOf and decisionsOf read their tables", () => {
  const md =
    "## Component tokens\n| component | variable | semantic | use |\n|---|---|---|---|\n| Button | --button-bg | color.action | bg |\n\n" +
    "## Decisions\n| id | decision | why | date | supersedes |\n|---|---|---|---|---|\n| D1 | Use X | because | 2026-01-01 | |\n";
  assert.deepEqual(componentTokensOf(md), [
    { component: "Button", variable: "--button-bg", semantic: "color.action", use: "bg" },
  ]);
  assert.deepEqual(decisionsOf(md), [
    { id: "D1", decision: "Use X", why: "because", date: "2026-01-01", supersedes: "" },
  ]);
  assert.deepEqual(componentTokensOf("# none"), []);
  assert.deepEqual(decisionsOf("# none"), []);
});

test("design-md.mjs is pure: no node:fs or child_process", () => {
  const src = readFileSync(fileURLToPath(new URL("./design-md.mjs", import.meta.url)), "utf8");
  assert.doesNotMatch(src, /node:fs|child_process/);
});

const BIND_MD =
  "## Themes\n| brand | token | light | dark |\n|---|---|---|---|\n| d | color.brand | #1d6b4f | #000 |\n\n" +
  "## Semantic tokens\n| variable | name | primitive | use |\n|---|---|---|---|\n| --color-brand | color.brand | green | u |\n| --elev | elevation.1 | shadow | u |\n\n" +
  "## Type scale\n| name | value | variable |\n|---|---|---|\n| text.lg | 1.125rem | --text-lg |\n| text.sm | 0.875rem | |\n\n" +
  "## Spacing\n| name | value |\n|---|---|\n| space.4 | 16px |\n\n" +
  "## Motion\n| name | value |\n|---|---|\n| motion.fast | 150ms |\n| motion.ease.out | cubic-bezier(0,0,.2,1) |\n";

test("bindTokens: semantic binds to variable; scale tokens to variable cell else --name with dots as dashes", () => {
  const b = Object.fromEntries(bindTokens(BIND_MD).map((t) => [t.name, t]));
  assert.equal(b["color.brand"].variable, "--color-brand");
  assert.equal(b["color.brand"].value, "#1d6b4f");
  assert.equal(b["text.lg"].variable, "--text-lg");
  assert.equal(b["text.sm"].variable, "--text-sm");
  assert.equal(b["space.4"].variable, "--space-4");
  assert.equal(b["motion.ease.out"].variable, "--motion-ease-out");
});

test("bindTokens: category from value shape, name prefix as tie-break, else null", () => {
  const b = Object.fromEntries(bindTokens(BIND_MD).map((t) => [t.name, t]));
  assert.equal(b["color.brand"].category, "colours");
  assert.equal(b["space.4"].category, "spacing");
  assert.equal(b["motion.fast"].category, "motion");
  assert.equal(b["motion.ease.out"].category, "motion");
  assert.equal(b["elevation.1"].category, null);
  assert.equal(categoryOf("color.x", ""), "colours");
  assert.equal(categoryOf("space.x", "weird"), "spacing");
  assert.equal(categoryOf("other", "oklch(0.5 0.1 200)"), "colours");
  assert.equal(categoryOf("color.x", "2s"), "motion");
});

test("spacingBaseOf reads --spacing statically, defaulting to 0.25rem (4px)", () => {
  assert.equal(spacingBaseOf(["@theme { --color-a: red; }"]), 4);
  assert.equal(spacingBaseOf(["@theme { --spacing: 0.25rem; }"]), 4);
  assert.equal(spacingBaseOf(["a", "@theme { --spacing: 4px; }"]), 4);
  assert.equal(spacingBaseOf(["@theme { --spacing: 8px; }"]), 8);
  assert.equal(spacingBaseOf(["@theme { --spacing: 0.5rem; }"]), 8);
  assert.equal(spacingBaseOf([]), 4);
});
