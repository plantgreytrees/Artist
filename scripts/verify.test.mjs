import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseArgs,
  isLoopback,
  summariseCwv,
  exitCodeFor,
  resolveDeps,
  run,
} from "./verify.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "fixtures");
const skipBrowser = process.env.ARTIST_SKIP_BROWSER === "1";

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("parseArgs", () => {
  test("default breakpoints are 375, 768, 1280", () => {
    const a = parseArgs(["--url", "http://localhost:3000"]);
    assert.deepEqual(a.breakpoints, [375, 768, 1280]);
  });
  test("positional URL is the documented CLI form", () => {
    const a = parseArgs(["http://localhost:3000", "--breakpoints", "320,1024"]);
    assert.equal(a.url, "http://localhost:3000");
    assert.deepEqual(a.breakpoints, [320, 1024]);
  });
  test("--breakpoints overrides defaults", () => {
    const a = parseArgs(["--url", "http://localhost:3000", "--breakpoints", "320,1024"]);
    assert.deepEqual(a.breakpoints, [320, 1024]);
  });
});

describe("isLoopback", () => {
  for (const h of ["localhost", "127.0.0.1", "127.9.9.9", "[::1]"]) {
    test(`true for ${h}`, () => assert.equal(isLoopback(h), true));
  }
  for (const h of ["example.com", "10.0.0.1", "localhost.evil.com"]) {
    test(`false for ${h}`, () => assert.equal(isLoopback(h), false));
  }
});

describe("remote refusal", () => {
  test("remote URL without allowRemote exits 2 and never launches", async () => {
    let called = false;
    const launch = () => {
      called = true;
      throw new Error("launch must not be called");
    };
    const res = await run({ url: "https://example.com", project: tmp("artist-proj-"), launch });
    assert.equal(res.exitCode, 2);
    assert.equal(called, false);
  });
});

describe("resolveDeps", () => {
  test("empty plugin data dir reports install command", () => {
    const res = resolveDeps({ CLAUDE_PLUGIN_DATA: tmp("artist-data-") });
    assert.equal(res.ok, false);
    assert.match(res.installCommand, /npm ci --prefix/);
  });
});

describe("summariseCwv", () => {
  test("median, spread and stable", () => {
    const s = summariseCwv([
      { lcp_ms: 1000, cls: 0.01 },
      { lcp_ms: 1100, cls: 0.02 },
      { lcp_ms: 1050, cls: 0.03 },
    ]);
    assert.equal(s.lcp_ms, 1050);
    assert.equal(s.cls, 0.02);
    assert.equal(s.runs, 3);
    assert.ok(Math.abs(s.spread - 100 / 1050) < 1e-9);
    assert.equal(s.unstable, false);
  });
  test("unstable when LCP spread > 0.20", () => {
    const s = summariseCwv([
      { lcp_ms: 1000, cls: 0 },
      { lcp_ms: 1500, cls: 0 },
      { lcp_ms: 1200, cls: 0 },
    ]);
    assert.equal(s.lcp_ms, 1200);
    assert.ok(Math.abs(s.spread - 500 / 1200) < 1e-9);
    assert.equal(s.unstable, true);
  });
});

describe("exitCodeFor", () => {
  const good = {
    axe: { critical: 0, serious: 0, moderate: 0, minor: 0 },
    cwv: { lcp_ms: 1000, cls: 0.01, unstable: false },
  };
  test("0 when all thresholds met", () => assert.equal(exitCodeFor(good), 0));
  test("1 when axe serious present", () =>
    assert.equal(exitCodeFor({ ...good, axe: { ...good.axe, serious: 1 } }), 1));
  test("1 when LCP too slow", () =>
    assert.equal(exitCodeFor({ ...good, cwv: { ...good.cwv, lcp_ms: 9000 } }), 1));
  test("1 when CLS too high", () =>
    assert.equal(exitCodeFor({ ...good, cwv: { ...good.cwv, cls: 0.9 } }), 1));
  test("1 when CWV unstable", () =>
    assert.equal(exitCodeFor({ ...good, cwv: { ...good.cwv, unstable: true } }), 1));
  test("2 on tool error", () =>
    assert.equal(exitCodeFor({ error: new Error("boom") }), 2));
});

describe("browser integration", { skip: skipBrowser }, () => {
  let server;
  let base;
  before(async () => {
    server = http.createServer((req, res) => {
      const name = path.basename((req.url || "/").split("?")[0]);
      const file = path.join(fixtures, name);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end(fs.readFileSync(file));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise((r) => server.close(r)));

  function listFiles(dir) {
    return fs.readdirSync(dir, { recursive: true }).map((f) => path.join(dir, f));
  }

  test("clean.html passes with a full report", async () => {
    const project = tmp("artist-proj-");
    const res = await run({ url: `${base}/clean.html`, project });
    assert.equal(res.error, undefined);
    assert.equal(res.exitCode, 0);
    const report = JSON.parse(fs.readFileSync(path.join(res.runDir, "report.json"), "utf8"));
    assert.equal(report.schema, 1);
    assert.equal(report.url, `${base}/clean.html`);
    assert.deepEqual(report.breakpoints, [375, 768, 1280]);
    for (const k of ["critical", "serious", "moderate", "minor"]) {
      assert.equal(typeof report.axe[k], "number");
    }
    assert.ok(Array.isArray(report.axe.violations));
    assert.equal(typeof report.cwv.lcp_ms, "number");
    assert.equal(typeof report.cwv.cls, "number");
    assert.equal(report.cwv.runs, 3);
    assert.equal(typeof report.cwv.spread, "number");
    assert.equal(typeof report.cwv.unstable, "boolean");
    for (const w of [375, 768, 1280]) {
      const f = report.screenshots[w];
      assert.ok(f, `screenshot entry for ${w}`);
      const abs = path.isAbsolute(f) ? f : path.join(res.runDir, f);
      assert.ok(fs.existsSync(abs), `screenshot file ${abs}`);
    }
    const runsRoot = path.join(project, ".artist", "runs");
    for (const f of listFiles(path.join(project, ".artist"))) {
      assert.ok(f === path.join(project, ".artist", "runs") || f.startsWith(runsRoot + path.sep), f);
    }
    assert.ok(res.runDir.startsWith(runsRoot + path.sep));
  });

  test("axe-violation.html fails with serious or critical issues", async () => {
    const project = tmp("artist-proj-");
    const res = await run({ url: `${base}/axe-violation.html`, project });
    assert.equal(res.exitCode, 1);
    const report = JSON.parse(fs.readFileSync(path.join(res.runDir, "report.json"), "utf8"));
    assert.ok(report.axe.serious + report.axe.critical >= 1);
    const runsRoot = path.join(project, ".artist", "runs");
    assert.ok(res.runDir.startsWith(runsRoot + path.sep));
    for (const f of listFiles(project)) {
      assert.ok(
        f === path.join(project, ".artist") || f === runsRoot || f.startsWith(runsRoot + path.sep),
        f,
      );
    }
  });
});
