// Project walk for component formats inventory cannot parse (ARCH-DIRECTIONS-14): a walk that stops early
// must never let the impact list read as zero.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unsupportedFilesOf, impactOf, readCurrent, validateDirections, resolvePick } from "./directions.mjs";

function project(files) {
  const root = mkdtempSync(join(tmpdir(), "directions-walk-"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return root;
}

const current = { tokens: new Map([["color.accent", { variable: "--color-accent" }]]) };
const inventory = { components: [{ name: "Button", path: "src/Button.tsx", tokensUsed: ["--color-accent"] }] };
const tokens = [{ name: "color.accent", axis: "palette" }];

test("a complete walk reports its files and is not truncated", () => {
  const proj = project({ "src/Card.svelte": "<div/>", "src/App.tsx": "x" });
  assert.deepEqual(unsupportedFilesOf(proj), { files: ["src/Card.svelte"], truncated: false, limit: 20000 });
});

test("bulky dependency, build and output dirs are skipped", () => {
  const files = { "src/Card.svelte": "x" };
  for (const d of ["vendor", "public", "out", ".venv", ".turbo", ".output", ".vercel"]) files[`${d}/X.svelte`] = "x";
  assert.deepEqual(unsupportedFilesOf(project(files)).files, ["src/Card.svelte"]);
});

test("a walk that hits its limit says so", () => {
  const files = {};
  for (let i = 0; i < 12; i++) files[`src/f${i}.txt`] = "x";
  const walk = unsupportedFilesOf(project(files), { limit: 5 });
  assert.equal(walk.truncated, true);
  assert.equal(walk.limit, 5);
});

test("a truncated walk marks impact not computed, never zero", () => {
  const imp = impactOf({ tokens, current, inventory, unsupported: { files: [], truncated: true, limit: 5 } });
  assert.match(imp.note, /project walk stopped at 5 entries/);
  for (const i of imp.items) assert.equal(i.unsupported, true);
});

test("pick.json carries the truncated-walk note", () => {
  const fx = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "directions");
  const proj = project({ "docs/design/DESIGN.md": readFileSync(join(fx, "DESIGN.md"), "utf8") });
  const cur = readCurrent(proj);
  const directions = validateDirections(JSON.parse(readFileSync(join(fx, "directions.json"), "utf8")), cur);
  const id = directions.directions[0].id;
  const line = `artist-pick v1 base=${id} palette=${id} type=${id} shape=${id} motion=${id}`;
  const walk = unsupportedFilesOf(proj, { limit: 1 });
  assert.equal(walk.truncated, true);
  const pick = resolvePick({ line, directions, current: cur, inventory: { components: [] }, unsupported: walk });
  assert.match(pick.impact.note, /project walk stopped at 1 entries/);
  assert.ok(pick.impact.items.length > 0);
  for (const i of pick.impact.items) assert.equal(i.unsupported, true);
});

test("impactOf still accepts a plain list of unsupported files", () => {
  const imp = impactOf({ tokens, current, inventory, unsupported: ["src/Card.svelte"] });
  assert.deepEqual(imp.unsupported, ["src/Card.svelte"]);
  assert.doesNotMatch(imp.note, /walk stopped/);
});
