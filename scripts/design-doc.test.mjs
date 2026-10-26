import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
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
  writeFileSync(
    reuse,
    readFileSync(reuse, "utf8").replace('"conforming": 10', '"conforming": 11').replace('"total": 15', '"total": 16'),
  );
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

// ---- scrutinise round 1 ----------------------------------------------------
const META = /<meta name="artist-design-doc-manifest" content="([^"]*)">/;
const unescHtml = (x) =>
  x.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const escHtml = (x) => x.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function tamper(dir, fn) {
  const p = join(dir, ...OUT);
  const h = readFileSync(p, "utf8");
  const m = JSON.parse(unescHtml(META.exec(h)[1]));
  fn(m);
  writeFileSync(p, h.replace(META, () => `<meta name="artist-design-doc-manifest" content="${escHtml(JSON.stringify(m))}">`));
}

test("inventory renders object props by name and variants as prop: a|b", () => {
  const dir = project("clean");
  const inv = {
    schema: 1,
    components: [
      {
        name: "Button",
        path: "src/Button.tsx",
        props: [
          { name: "size", type: "'sm' | 'lg'", optional: true, values: ["sm", "lg"] },
          { name: "onClick", type: "() => void", optional: false },
        ],
        variants: { size: ["sm", "lg"] },
        usage: { count: 3, files: ["src/App.tsx"] },
      },
    ],
    layouts: [],
    schemas: [],
    packages: [],
  };
  writeFileSync(join(dir, "docs", "design", "inventory.json"), JSON.stringify(inv));
  assert.equal(run(dir).status, 0);
  const h = html(dir);
  assert.ok(!h.includes("[object Object]"));
  assert.match(h, /<td>size, onClick<\/td>/);
  assert.ok(h.includes("size: sm|lg"));
  assert.ok(h.includes("count: 3"));
});

test("--reuse resolves against --project, not the cwd", () => {
  const dir = project("clean");
  const elsewhere = mkdtempSync(join(tmpdir(), "dd-cwd-"));
  const opts = { encoding: "utf8", cwd: elsewhere };
  assert.equal(spawnSync("node", [SCRIPT, "--project", dir, "--reuse", "reuse.json"], opts).status, 0);
  const m = JSON.parse(unescHtml(META.exec(html(dir))[1]));
  assert.deepEqual(m.inputs.find((e) => e.role === "reuse").path, "reuse.json");
  assert.equal(spawnSync("node", [SCRIPT, "--project", dir, "--check"], opts).status, 0);
});

test("--reuse outside the project exits 2", () => {
  const dir = project("clean");
  const outside = join(mkdtempSync(join(tmpdir(), "dd-out-")), "reuse.json");
  cpSync(join(dir, "reuse.json"), outside);
  assert.equal(run(dir, "--reuse", outside).status, 2);
});

test("--check exits 2, not stale, when the audit's reuse input is absent", () => {
  const dir = project("clean");
  mkdirSync(join(dir, ".artist", "audit"), { recursive: true });
  cpSync(join(dir, "reuse.json"), join(dir, ".artist", "audit", "reuse.json"));
  assert.equal(run(dir, "--reuse", ".artist/audit/reuse.json").status, 0);
  assert.equal(run(dir, "--check").status, 0);
  rmSync(join(dir, ".artist"), { recursive: true });
  const r = run(dir, "--check");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /reuse input \.artist\/audit\/reuse\.json absent; rerun audit to re-verify/);
  // a missing inventory input is still stale
  const d2 = project("clean");
  assert.equal(run(d2).status, 0);
  rmSync(join(d2, "docs", "design", "inventory.json"));
  assert.equal(run(d2, "--check").status, 1);
});

test("--check rejects untrusted manifest roles and paths before reading", () => {
  const cases = [
    (m) => m.inputs.push({ role: "secret", path: "DESIGN.md", sha256: "0" }),
    (m) => (m.inputs.find((e) => e.role === "design").path = "/etc/passwd"),
    (m) => (m.inputs.find((e) => e.role === "design").path = "other.md"),
    (m) => (m.inputs.find((e) => e.role === "inventory").path = "x.json"),
    (m) => m.inputs.push({ role: "reuse", path: "../../etc/passwd", sha256: "0" }),
    (m) => m.inputs.push({ role: "reuse", path: "/etc/passwd", sha256: "0" }),
    (m) => m.inputs.push({ role: "reuse", path: "docs", sha256: "0" }),
    (m) => m.inputs.push({ role: "reuse", path: 7, sha256: "0" }),
    (m) => m.inputs.push({ role: "reuse", path: "outlink/reuse.json", sha256: "0" }),
  ];
  for (const [i, fn] of cases.entries()) {
    const dir = project("clean");
    assert.equal(run(dir).status, 0);
    const outside = mkdtempSync(join(tmpdir(), "dd-link-"));
    writeFileSync(join(outside, "reuse.json"), readFileSync(join(dir, "reuse.json")));
    symlinkSync(outside, join(dir, "outlink"));
    tamper(dir, fn);
    const r = run(dir, "--check");
    assert.equal(r.status, 2, `case ${i}: ${r.stderr}`);
    assert.match(r.stderr, /manifest|input /, `case ${i}`);
  }
});

test("a supersedes naming a later row exits 2 (append-only)", () => {
  const dir = project("clean");
  const p = join(dir, "DESIGN.md");
  writeFileSync(
    p,
    readFileSync(p, "utf8")
      .replace("| 2026-01-01 | |", "| 2026-01-01 | D2 |")
      .replace("| 2026-02-01 | D1 |", "| 2026-02-01 | |"),
  );
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /earlier/);
});

test("a ratio breaking conforming + justified + unjustified === total exits 2", () => {
  const dir = project("clean");
  const reuse = join(dir, "reuse.json");
  writeFileSync(reuse, readFileSync(reuse, "utf8").replace('"total": 15', '"total": 99'));
  const r = run(dir, "--reuse", reuse);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /colours/);
});

test("hostile inventory.json and reuse.json keys and values are escaped", () => {
  const dir = project("clean");
  const bad = "<script>alert(1)</script><img src=x onerror=y>javascript:z";
  writeFileSync(
    join(dir, "docs", "design", "inventory.json"),
    JSON.stringify({ schema: 1, components: [{ name: bad, [bad]: bad, props: [{ name: bad }] }], layouts: [], schemas: [], packages: [] }),
  );
  writeFileSync(
    join(dir, "reuse.json"),
    JSON.stringify({ schema: 3, ratios: { [bad]: { conforming: 1, justified: 0, unjustified: 0, total: 1 } } }),
  );
  assert.equal(run(dir, "--reuse", join(dir, "reuse.json")).status, 0);
  const h = html(dir);
  assert.doesNotMatch(h, /<script/i);
  assert.doesNotMatch(h, /<img/i);
  assert.ok(h.includes("&lt;script&gt;"));
});

// ---- scrutinise round 2 ----------------------------------------------------
test("an in-project symlinked DESIGN.md renders and --check is fresh", () => {
  const dir = project("clean");
  cpSync(join(dir, "DESIGN.md"), join(dir, "real.md"));
  rmSync(join(dir, "DESIGN.md"));
  symlinkSync("real.md", join(dir, "DESIGN.md"));
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(run(dir, "--check").status, 0);
  assert.doesNotMatch(run(join(dir, "nowhere")).stderr, /manifest/);
});

test("design-doc never writes through a symlink that leaves the project", () => {
  const outside = mkdtempSync(join(tmpdir(), "dd-target-"));
  const d1 = project("clean");
  rmSync(join(d1, "docs", "design"), { recursive: true });
  symlinkSync(outside, join(d1, "docs", "design"));
  assert.equal(run(d1).status, 2);
  assert.equal(existsSync(join(outside, "design-system.html")), false);

  const d2 = project("clean");
  const victim = join(outside, "victim.txt");
  writeFileSync(victim, "keep");
  symlinkSync(victim, join(d2, ...OUT));
  assert.equal(run(d2).status, 2);
  assert.equal(readFileSync(victim, "utf8"), "keep");
});

// ---- scrutinise round 3 ----------------------------------------------------
const NEUTRAL = /^design-doc: input (is not a regular file|resolves outside the project)/m;

test("a docs symlink to an empty outside folder exits 2 and creates nothing there", () => {
  const outside = mkdtempSync(join(tmpdir(), "dd-docs-"));
  const dir = project("clean");
  rmSync(join(dir, "docs"), { recursive: true });
  symlinkSync(outside, join(dir, "docs"));
  const r = run(dir);
  assert.equal(r.status, 2, r.stderr);
  assert.deepEqual(readdirSync(outside), []);
});

test("an escaping DESIGN.md symlink in write mode gives the mode-neutral message", () => {
  const outside = mkdtempSync(join(tmpdir(), "dd-design-"));
  const dir = project("clean");
  cpSync(join(dir, "DESIGN.md"), join(outside, "DESIGN.md"));
  rmSync(join(dir, "DESIGN.md"));
  symlinkSync(join(outside, "DESIGN.md"), join(dir, "DESIGN.md"));
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, NEUTRAL);
  assert.doesNotMatch(r.stderr, /manifest/);
});

test("an escaping reuse input under --check gives the mode-neutral message", () => {
  const dir = project("clean");
  assert.equal(run(dir).status, 0);
  const outside = mkdtempSync(join(tmpdir(), "dd-link-"));
  writeFileSync(join(outside, "reuse.json"), readFileSync(join(dir, "reuse.json")));
  symlinkSync(outside, join(dir, "outlink"));
  tamper(dir, (m) => m.inputs.push({ role: "reuse", path: "outlink/reuse.json", sha256: "0" }));
  const r = run(dir, "--check");
  assert.equal(r.status, 2);
  assert.match(r.stderr, NEUTRAL);
  assert.doesNotMatch(r.stderr, /manifest/);
});

test("a FIFO at the output path exits 2 without hanging", () => {
  const dir = project("clean");
  const fifo = join(dir, ...OUT);
  mkdirSync(dirname(fifo), { recursive: true });
  if (spawnSync("mkfifo", [fifo]).status !== 0) return; // no mkfifo on this platform
  const r = spawnSync("node", [SCRIPT, "--project", dir], { encoding: "utf8", timeout: 10000 });
  assert.equal(r.signal, null, "design-doc hung on a FIFO");
  assert.equal(r.status, 2, r.stderr);
});
