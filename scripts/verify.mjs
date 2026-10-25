#!/usr/bin/env node
// The one source of every number artist reports (ARCH-VERIFY-01): screenshots per
// breakpoint, axe-core counts and median LCP/CLS, written as report.json (schema 1)
// under <project>/.artist/runs/<UTC timestamp>/. Exit 0 = thresholds met, 1 = missed,
// 2 = tool error; an error never reports a pass (ARCH-VERIFY-08).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_BREAKPOINTS = [375, 768, 1280];
// spread_ms: millisecond jitter on a fast page is not instability (ARCH-VERIFY-14).
export const THRESHOLDS = { lcp_ms: 2500, cls: 0.1, spread: 0.2, spread_ms: 100 };
const CWV_RUNS = 3;
const LOAD_TIMEOUT_MS = 30000;
const IMPACTS = ["critical", "serious", "moderate", "minor"];

export function parseArgs(argv) {
  const out = { breakpoints: DEFAULT_BREAKPOINTS, allowRemote: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--allow-remote") out.allowRemote = true;
    else if (arg === "--url" || arg === "--breakpoints" || arg === "--project") {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      if (arg === "--url") out.url = value;
      else if (arg === "--project") out.project = value;
      else {
        out.breakpoints = value.split(",").map((s) => Number(s.trim()));
        if (!out.breakpoints.length || out.breakpoints.some((n) => !Number.isInteger(n) || n < 200 || n > 4000)) {
          throw new Error(`--breakpoints must be widths in px, e.g. 375,768,1280 (got ${value})`);
        }
      }
    } else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else if (out.url === undefined) out.url = arg;
    else throw new Error(`unexpected argument ${arg}`);
  }
  if (!out.url) throw new Error("usage: verify.mjs <url> [--breakpoints 375,768,1280] [--allow-remote] [--project <dir>]");
  return out;
}

export function isLoopback(host) {
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "::1") return true;
  const m = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  return Boolean(m) && m.slice(1).every((o) => Number(o) <= 255);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function summariseCwv(samples) {
  const lcps = samples.map((s) => s.lcp_ms);
  const numeric = lcps.filter((x) => typeof x === "number");
  // A sample with neither LCP nor FCP makes the whole LCP unknown, never a pass.
  const lcp_ms = numeric.length === lcps.length && numeric.length ? median(numeric) : null;
  const range = numeric.length ? Math.max(...numeric) - Math.min(...numeric) : 0;
  const spread = lcp_ms > 0 ? range / lcp_ms : 0;
  return {
    lcp_ms,
    cls: median(samples.map((s) => s.cls)),
    runs: samples.length,
    spread,
    unstable: spread > THRESHOLDS.spread && range > THRESHOLDS.spread_ms,
  };
}

export function reportPathFor(result = {}) {
  if (!result.runDir) return null;
  const file = path.join(result.runDir, "report.json");
  return fs.existsSync(file) ? file : null;
}

// The single CWV pass rule, shared with review-html so the page and the exit
// code can never disagree; an unknown LCP is a miss, never a pass.
export function cwvPasses(cwv = {}) {
  return !cwv.unstable && typeof cwv.lcp_ms === "number" && cwv.lcp_ms <= THRESHOLDS.lcp_ms && cwv.cls <= THRESHOLDS.cls;
}

export function exitCodeFor({ axe, cwv, error } = {}) {
  if (error || !axe || !cwv) return 2;
  if ((axe.serious || 0) + (axe.critical || 0) > 0) return 1;
  return cwvPasses(cwv) ? 0 : 1;
}

// Dependencies live in ${CLAUDE_PLUGIN_DATA}/node_modules, never in the target
// project (ARCH-VERIFY-05); scripts/node_modules is the fallback for local runs.
export function resolveDeps(env = process.env) {
  const prefix = env.CLAUDE_PLUGIN_DATA || here;
  const dir = path.join(prefix, "node_modules");
  const needed = ["playwright/package.json", "@axe-core/playwright/package.json", "web-vitals/dist/web-vitals.umd.cjs"];
  if (needed.every((p) => fs.existsSync(path.join(dir, p)))) return { ok: true, dir };
  const installCommand = env.CLAUDE_PLUGIN_DATA
    ? `cp "${path.join(here, "package.json")}" "${path.join(here, "package-lock.json")}" "${env.CLAUDE_PLUGIN_DATA}/" && npm ci --prefix "${env.CLAUDE_PLUGIN_DATA}"`
    : `npm ci --prefix "${here}"`;
  return { ok: false, dir, installCommand };
}

function loadDeps(dir) {
  const req = createRequire(path.join(dir, "artist-verify.cjs"));
  const axeModule = req("@axe-core/playwright");
  return {
    chromium: req("playwright").chromium,
    AxeBuilder: axeModule.default || axeModule.AxeBuilder,
    vitalsSource: fs.readFileSync(path.join(dir, "web-vitals/dist/web-vitals.umd.cjs"), "utf8"),
  };
}

function makeRunDir(project) {
  const root = path.join(project, ".artist", "runs");
  fs.mkdirSync(root, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  for (let suffix = ""; ; suffix = "-" + randomBytes(2).toString("hex")) {
    const dir = path.join(root, stamp + suffix);
    try { fs.mkdirSync(dir); return dir; } catch (e) { if (e.code !== "EEXIST") throw e; }
  }
}

class RemoteRedirect extends Error {}

const offLoopback = (host) => new RemoteRedirect(`page redirected off loopback to ${host}; pass --allow-remote to measure it`);

// Stops a navigation before it leaves loopback: JS-driven navigations are aborted,
// and HTTP redirects are fetched without following so their Location is checked first.
// Only main-frame navigations of the measured page (state.page, set after newPage)
// fail the run; off-loopback sub-frames and popups are aborted silently.
async function guardNavigation(context, allowRemote) {
  const state = { blocked: null, page: null };
  if (allowRemote) return state;
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (!request.isNavigationRequest()) return route.continue();
    const target = new URL(request.url());
    const main = !state.page || request.frame() === state.page.mainFrame();
    const block = (host) => { if (main) state.blocked = host; return route.abort("blockedbyclient"); };
    if (!isLoopback(target.hostname)) return block(target.hostname);
    const response = await route.fetch({ maxRedirects: 0 });
    const location = response.headers().location;
    if (response.status() >= 300 && response.status() < 400 && location) {
      const next = new URL(location, request.url());
      if (!isLoopback(next.hostname)) return block(next.hostname);
    }
    return route.fulfill({ response });
  });
  return state;
}

async function gotoLocal(page, url, guard, allowRemote) {
  try {
    await page.goto(url, { waitUntil: "load", timeout: LOAD_TIMEOUT_MS });
  } catch (error) {
    if (guard.blocked) throw offLoopback(guard.blocked);
    throw error;
  }
  const host = new URL(page.url()).hostname;
  if (guard.blocked || (!allowRemote && !isLoopback(host))) throw offLoopback(guard.blocked || host);
}

const VITALS_HOOK = `;(function () {
  var v = (window.__artistVitals = { lcp: null, cls: 0 });
  webVitals.onLCP(function (m) { v.lcp = m.value; }, { reportAllChanges: true });
  webVitals.onCLS(function (m) { v.cls = m.value; }, { reportAllChanges: true });
})();`;

async function measureVitals(browser, url, width, deps, allowRemote) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  try {
    const guard = await guardNavigation(context, allowRemote);
    await context.addInitScript({ content: deps.vitalsSource + VITALS_HOOK });
    const page = await context.newPage();
    guard.page = page;
    await gotoLocal(page, url, guard, allowRemote);
    await page.waitForTimeout(1000);
    return await page.evaluate(() => {
      const v = window.__artistVitals || {};
      // A page with no LCP candidate falls back to first contentful paint.
      const fcp = performance.getEntriesByName("first-contentful-paint")[0];
      const lcp = v.lcp ?? (fcp ? fcp.startTime : null);
      return { lcp_ms: lcp === null ? null : Math.round(lcp), cls: Number(v.cls || 0) };
    });
  } finally {
    await context.close().catch(() => {});
  }
}

export async function run({ url, project = process.cwd(), breakpoints = DEFAULT_BREAKPOINTS, allowRemote = false, launch, env = process.env } = {}) {
  let target;
  try { target = new URL(url); } catch { return { exitCode: 2, error: `not a URL: ${url}` }; }
  if (target.protocol !== "http:" && target.protocol !== "https:") return { exitCode: 2, error: `only http(s) URLs can be measured, got ${target.protocol}` };
  if (!allowRemote && !isLoopback(target.hostname)) {
    return { exitCode: 2, error: `refusing ${target.hostname}: only loopback URLs are measured unless --allow-remote is passed` };
  }
  const resolved = resolveDeps(env);
  if (!resolved.ok) return { exitCode: 2, error: `dependencies missing; install them with: ${resolved.installCommand}` };

  let deps, browser, runDir;
  try {
    deps = loadDeps(resolved.dir);
    browser = await (launch || ((opts) => deps.chromium.launch(opts)))({ headless: true });
    runDir = makeRunDir(path.resolve(project));

    const axe = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    const violations = new Map();
    const screenshots = {};
    for (const width of breakpoints) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      try {
        const guard = await guardNavigation(context, allowRemote);
        const page = await context.newPage();
        guard.page = page;
        await gotoLocal(page, url, guard, allowRemote);
        const file = `${width}.png`;
        await page.screenshot({ path: path.join(runDir, file), fullPage: true, timeout: LOAD_TIMEOUT_MS });
        screenshots[width] = file;
        const result = await new deps.AxeBuilder({ page }).analyze();
        const counts = Object.fromEntries(IMPACTS.map((k) => [k, 0]));
        for (const v of result.violations) {
          if (counts[v.impact] !== undefined) counts[v.impact]++;
          const seen = violations.get(v.id) || { id: v.id, impact: v.impact, help: v.help, nodes: 0, breakpoints: [], targets: [] };
          seen.nodes = Math.max(seen.nodes, v.nodes.length);
          seen.breakpoints.push(width);
          for (const n of v.nodes) {
            const t = Array.isArray(n.target) ? n.target.join(" ") : String(n.target);
            if (seen.targets.length < 5 && t && !seen.targets.includes(t)) seen.targets.push(t);
          }
          violations.set(v.id, seen);
        }
        for (const k of IMPACTS) axe[k] = Math.max(axe[k], counts[k]);
      } finally {
        await context.close().catch(() => {});
      }
    }

    const widest = Math.max(...breakpoints);
    const samples = [];
    for (let i = 0; i < CWV_RUNS; i++) samples.push(await measureVitals(browser, url, widest, deps, allowRemote));
    const cwv = summariseCwv(samples);

    const report = {
      schema: 1,
      url,
      generated_at: new Date().toISOString(),
      breakpoints,
      axe: { ...axe, violations: [...violations.values()] },
      cwv,
      screenshots,
    };
    fs.writeFileSync(path.join(runDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
    return { exitCode: exitCodeFor(report), runDir };
  } catch (error) {
    return { exitCode: 2, runDir, error: error instanceof RemoteRedirect ? error.message : `browser run failed: ${error.message}` };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

const invokedDirectly = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`verify: ${e.message}`); process.exitCode = 2; }
  if (args) {
    const result = await run({ ...args, project: args.project || process.cwd() });
    if (result.error) console.error(`verify: ${result.error}`);
    const reportPath = reportPathFor(result);
    if (reportPath) console.log(reportPath);
    process.exitCode = result.exitCode;
  }
}
