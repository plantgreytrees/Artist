import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bindTokens, spacingBaseOf } from "./design-md.mjs";
import { parseClass, resolveClass, offTokenClasses, tokenRefsIn, classesIn } from "./token-refs.mjs";

const MD =
  "## Semantic tokens\n| variable | name | primitive | use |\n|---|---|---|---|\n" +
  "| --color-brand | color.brand | #1d6b4f | u |\n| --color-foo | color.foo | #fff | u |\n| --text-foo | text.foo | 2rem | u |\n| --x | color.x | #000 | u |\n\n" +
  "## Spacing\n| name | value |\n|---|---|\n| space.4 | 16px |\n| space.2 | 8px |\n";
const ctx = (css = []) => ({ tokens: bindTokens(MD), spacingPx: spacingBaseOf(css) });
const r = (c, x = ctx()) => resolveClass(c, x);

test("supports-[display:grid]:bg-brand keeps the bracketed variant intact", () => {
  assert.deepEqual(parseClass("supports-[display:grid]:bg-brand").variants, ["supports-[display:grid]"]);
  assert.deepEqual(r("supports-[display:grid]:bg-brand").variables, ["--color-brand"]);
  assert.deepEqual(parseClass("data-[size=large]:p-4").variants, ["data-[size=large]"]);
  assert.equal(r("data-[size=large]:bg-brand").kind, "token");
});

test("md:hover:bg-brand/80! strips variants, opacity and important", () => {
  const p = parseClass("md:hover:bg-brand/80!");
  assert.deepEqual(p.variants, ["md", "hover"]);
  assert.equal(p.utility, "bg-brand");
  assert.equal(r("md:hover:bg-brand/80!").kind, "token");
  assert.equal(r("!bg-brand/[0.5]").kind, "token");
  assert.equal(r("bg-brand/(--o)").kind, "token");
});

test("-m-4 strips the negative sign and resolves n x --spacing", () => {
  assert.equal(parseClass("-m-4").negative, true);
  assert.deepEqual(r("-m-4").variables, ["--space-4"]);
});

test("bg-(--x) is a var reference; unknown var is unknown", () => {
  assert.deepEqual(r("bg-(--x)").variables, ["--x"]);
  assert.equal(r("bg-(--x)").kind, "token");
  assert.equal(r("bg-(color:--nope)").kind, "unknown");
});

test("text-foo matching --color-foo and --text-foo is ambiguous", () => {
  assert.equal(r("text-foo").kind, "ambiguous");
  assert.deepEqual(offTokenClasses(["text-foo"], ctx()), [{ class: "text-foo", reason: "ambiguous" }]);
});

test("unknown class is reported unknown; known, literal and non-themed are not", () => {
  const off = offTokenClasses(["bg-nope", "bg-brand", "bg-[#fff]", "flex", "text-center", "bg-brand", "w-1/2", "w-full"], ctx());
  assert.deepEqual(off, [{ class: "bg-nope", reason: "unknown" }]);
});

test("bg-[#fff] is a literal, not a token reference", () => {
  assert.equal(r("bg-[#fff]").kind, "literal");
  assert.equal(r("p-[13px]").kind, "literal");
});

test("p-4 resolves against the default 0.25rem base and a custom --spacing: 4px", () => {
  assert.deepEqual(r("p-4").variables, ["--space-4"]);
  const custom = ctx(["@theme { --spacing: 4px; }"]);
  assert.equal(custom.spacingPx, 4);
  assert.deepEqual(r("p-4", custom).variables, ["--space-4"]);
  const wide = ctx(["@theme { --spacing: 8px; }"]);
  assert.equal(r("p-4", wide).kind, "unknown");
  assert.deepEqual(r("p-2", wide).variables, ["--space-4"]);
  assert.equal(r("p-3").kind, "unknown");
});

test("token-refs.mjs is pure: no node:fs or child_process", () => {
  const src = readFileSync(fileURLToPath(new URL("./token-refs.mjs", import.meta.url)), "utf8");
  assert.doesNotMatch(src, /node:fs|child_process/);
});

test("tokenRefsIn collects var(), Tailwind utilities and exact RN semantic chains", () => {
  const md = "---\nformat: 2\n---\n## Semantic tokens\n| name | variable | primitive | use |\n|---|---|---|---|\n| color.brand | --color-brand | x | y |\n\n## Primitives\n| name | value |\n|---|---|\n| x | #123456 |\n";
  const ctx = { tokens: bindTokens(md), spacingPx: 4 };
  const refs = tokenRefsIn('a{color:var(--other)} const c = "bg-brand"; const t = theme.color.brand;', ctx);
  assert.deepEqual([...refs].sort(), ["--color-brand", "--other"]);
  assert.deepEqual([...tokenRefsIn("var(--x) theme.color.brand", { tokens: [], spacingPx: 4 })], ["--x"]);
});

test("classesIn yields each class in string literals with its index; token-refs exports no RegExp", async () => {
  const got = [...classesIn('a = "bg-brand  p-2"; b = \'x\'')].map((c) => [c.cls, c.index]);
  assert.deepEqual(got, [
    ["bg-brand", 4],
    ["p-2", 4],
    ["x", 25],
  ]);
  assert.deepEqual([...classesIn(`"${"a".repeat(121)}"`)], []);
  const mod = await import("./token-refs.mjs");
  assert.equal(Object.values(mod).some((v) => v instanceof RegExp), false);
});
