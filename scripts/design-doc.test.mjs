import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, "design-doc.mjs");
const fx = (n) => join(here, "fixtures", "design-doc", n);
const OUT = ["docs", "design", "design-system.html"];

function project(name) {
  const dir = mkdtempSync(join(tmpdir(), "dd-"));
  cpSync(fx(name), dir, { recursive: true });
  return dir;
}
const run = (dir, ...args) => spawnSync("node", [SCRIPT, "--project", dir, ...args], { encoding: "utf8" });
const html = (dir) => readFileSync(join(dir, ...OUT), "utf8");

test("clean fixture renders and writes only docs/design/design-system.html", () => {
  const dir = project("clean");
  const before = readdirSync(dir).sort();
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readdirSync(dir).sort(), before);
  assert.deepEqual(readdirSync(join(dir, "docs", "design")).sort(), ["design-system.html", "inventory.json"]);
  const h = html(dir);
  assert.match(h, /#2563eb/);
  assert.match(h, /style="background:#2563eb"/);
  assert.match(h, /Use deeper blue brand/);
});

test("format 1 DESIGN.md exits 2", () => {
  const dir = project("clean");
  const p = join(dir, "DESIGN.md");
  writeFileSync(p, readFileSync(p, "utf8").replace("format: 2", "format: 1"));
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.equal(existsSync(join(dir, ...OUT)), false);
});

test("hostile names are escaped everywhere, no script, no remote src/href", () => {
  const dir = project("hostile");
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  const h = html(dir);
  assert.doesNotMatch(h, /<script/i);
  assert.ok(h.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.doesNotMatch(h, /<script>alert/);
  assert.doesNotMatch(h, /(?:src|href)\s*=\s*["']?\s*(?:https?:|javascript:|\/\/)/i);
  assert.doesNotMatch(h, /(?:src|href)\s*=/i, "no href/src is derived from data");
  for (const m of h.matchAll(/style="([^"]*)"/g)) {
    assert.doesNotMatch(m[1], /url\(|evil|javascript|</i);
  }
  assert.doesNotMatch(h, /<[^>]*\burl\(/i);
});

test("swatch allowlist accepts colours/lengths/var() and rejects the rest", () => {
  const dir = project("hostile");
  run(dir);
  const bg = [...html(dir).matchAll(/style="background:([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(bg, []);
  const clean = project("clean");
  run(clean);
  const h = html(clean);
  assert.match(h, /style="background:oklch\(0\.2 0\.02 260\)"/);
  assert.match(h, /style="background:var\(--color-brand-dark\)"/);
  assert.doesNotMatch(h, /style="[^"]*not-a-colour/);
  assert.match(h, /not-a-colour/);
});

test("CSP meta is exact and output is self-contained", () => {
  const dir = project("clean");
  run(dir);
  const h = html(dir);
  assert.ok(
    h.includes(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`),
  );
  assert.doesNotMatch(h, /<script/i);
  assert.doesNotMatch(h, /(?:src|href)\s*=\s*["']?https?:/i);
  assert.doesNotMatch(h, /<(?:link|img|iframe)\b/i);
});

test("idempotent: two runs give identical bytes, no timestamps", () => {
  const dir = project("clean");
  run(dir, "--reuse", join(dir, "reuse.json"));
  const a = html(dir);
  run(dir, "--reuse", join(dir, "reuse.json"));
  assert.equal(html(dir), a);
  assert.doesNotMatch(a, /\b20\d\d-\d\d-\d\dT\d\d:/);
});

test("manifest embeds paths + sha256 and a renderer version", () => {
  const dir = project("clean");
  run(dir, "--reuse", join(dir, "reuse.json"));
  const h = html(dir);
  assert.match(h, /renderer/i);
  assert.match(h, /DESIGN\.md/);
  assert.match(h, /docs\/design\/inventory\.json/);
  assert.match(h, /reuse\.json/);
  assert.ok((h.match(/[0-9a-f]{64}/g) ?? []).length >= 3);
});

test("--check: 0 fresh, 1 stale, 2 error", () => {
  const dir = project("clean");
  assert.equal(run(dir, "--check").status, 2, "no output yet is an error");
  assert.equal(run(dir).status, 0);
  assert.equal(run(dir, "--check").status, 0);
  const p = join(dir, "DESIGN.md");
  writeFileSync(p, readFileSync(p, "utf8") + "\n- extra: note\n");
  assert.equal(run(dir, "--check").status, 1);
  assert.equal(run(dir).status, 0);
  assert.equal(run(dir, "--check").status, 0);
  writeFileSync(p, readFileSync(p, "utf8").replace("format: 2", "format: 1"));
  assert.equal(run(dir, "--check").status, 2);
});

test("--check recomputes over the manifest set including --reuse", () => {
  const dir = project("clean");
  const reuse = join(dir, "reuse.json");
  assert.equal(run(dir, "--reuse", reuse).status, 0);
  assert.equal(run(dir, "--check").status, 0);
  writeFileSync(reuse, readFileSync(reuse, "utf8").replace('"conforming": 10', '"conforming": 11'));
  assert.equal(run(dir, "--check").status, 1);
});

test("duplicate Decisions ids exit 2 and write nothing", () => {
  const dir = project("duplicate-decisions");
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /duplicate/i);
  assert.equal(existsSync(join(dir, ...OUT)), false);
});

test("unresolved supersedes exits 2", () => {
  const dir = project("clean");
  const p = join(dir, "DESIGN.md");
  writeFileSync(p, readFileSync(p, "utf8").replace("| 2026-02-01 | D1 |", "| 2026-02-01 | D9 |"));
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /supersedes/i);
});

test("--reuse renders four numbers per category and no total score", () => {
  const dir = project("clean");
  assert.equal(run(dir, "--reuse", join(dir, "reuse.json")).status, 0);
  const h = html(dir);
  for (const c of ["colours", "spacing", "motion", "reduced_motion", "component_tokens", "component_api"]) {
    const m = new RegExp(`<tr data-category="${c}">([\\s\\S]*?)</tr>`).exec(h);
    assert.ok(m, `row for ${c}`);
    const nums = [...m[1].matchAll(/<td class="num">(\d+)<\/td>/g)].map((x) => Number(x[1]));
    assert.equal(nums.length, 4, c);
    assert.equal(nums[0] + nums[1] + nums[2], nums[3]);
  }
  assert.doesNotMatch(h, /score|overall|grand total|blended|weighted/i);
  assert.doesNotMatch(h, /%/, "no percentage that could read as a blended figure");
  // without --reuse the ratios section is absent
  const d2 = project("clean");
  run(d2);
  assert.doesNotMatch(html(d2), /data-category=/);
});

test("design-doc never imports reuse-check", () => {
  assert.doesNotMatch(readFileSync(SCRIPT, "utf8"), /reuse-check/);
});
