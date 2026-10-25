#!/usr/bin/env node
// Deterministic reuse check: DESIGN.md + changed files + justifications -> reuse.json
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { buildInventory, capOf, formatOf, listProjectFiles } from "./inventory.mjs";

function sections(md) {
  const out = {};
  let cur = null;
  for (const line of md.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { cur = h[1]; out[cur] = []; continue; }
    if (cur && line.trim().startsWith("|")) {
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((s) => s.trim());
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
      out[cur].push(cells);
    }
  }
  for (const k of Object.keys(out)) out[k] = out[k].slice(1); // drop header row
  return out;
}

const hexOf = (n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0");
const COLOUR_RE = /(?<![\w&])(?<!\b(?:href|id)\s*=\s*["']?)#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])|\b(rgba?|hsla?)\(\s*([^)]*?)\s*\)/gi;

function normColour(m) {
  if (m[1] !== undefined) {
    let h = m[1].toLowerCase();
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    if (h.length === 8 && h.endsWith("ff")) h = h.slice(0, 6);
    return "#" + h;
  }
  const fn = m[2].toLowerCase();
  const parts = m[3].split(/[\s,/]+/).filter(Boolean);
  if (fn.startsWith("rgb") && parts.length >= 3 && parts.slice(0, 3).every((p) => /^\d+(\.\d+)?$/.test(p))) {
    const alpha = parts[3];
    if (alpha === undefined || Number(alpha) === 1) return "#" + parts.slice(0, 3).map(hexOf).join("");
  }
  return `${fn.replace(/a$/, "")}(${parts.join(",")})`.toLowerCase();
}

function colours(text) {
  const found = [];
  for (const m of text.matchAll(COLOUR_RE)) {
    if (m[3] !== undefined && /var\(/i.test(m[3])) continue;
    found.push({ value: normColour(m), index: m.index });
  }
  return found;
}

const lineOf = (text, idx) => text.slice(0, idx).split("\n").length;
const justify = (item, just) => {
  const key = [item.name, item.value, item.file].find((k) => k !== undefined && Object.hasOwn(just, k));
  if (key !== undefined) { item.justified = true; item.reason = String(just[key]); } else item.justified = false;
  return item;
};

const num = (x) => Number(x);
const toMs = (n, unit) => Math.round((unit === "s" ? num(n) * 1000 : num(n)) * 1000) / 1000;
const toPx = (n, unit) => (unit === "rem" ? num(n) * 16 : num(n));
const normBezier = (s) => s.toLowerCase().replace(/[\s_]+/g, "");

function tokenFiles(md) {
  const out = new Set();
  for (const line of md.split(/\r?\n/)) {
    const m = /^\s*[-*]?\s*(?:token|theme)[^:\n]*files?[^:\n]*:\s*(.+)$/i.exec(line);
    if (m) for (const f of m[1].split(",")) { const t = f.replace(/[`*]/g, "").trim().replace(/^\.\//, ""); if (t) out.add(t); }
  }
  return out;
}
const isTokenFile = (set, p) => [...set].some((t) => (t.endsWith("/") ? p.startsWith(t) : p === t));

const SPACING_PROP = String.raw`(?:padding|margin|gap|row-gap|column-gap|rowGap|columnGap)(?:-?(?:Top|Right|Bottom|Left|top|right|bottom|left|block|inline)(?:-?(?:start|end|Start|End))?)?`;
const CSS_SPACING = new RegExp(String.raw`(?<![\w-])${SPACING_PROP}\s*:\s*([^;}\n]*)`, "g");
const TW_SPACING = /(?<![\w-])(?:[\w-]+:)*-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy])-\[(\d*\.?\d+)(px|rem)\]/g;
const JS_BARE_SPACING = new RegExp(String.raw`(?<![\w-])${SPACING_PROP}\s*:\s*(\d*\.?\d+)\s*[,}]`, "g");
const LEN = /(?<![\w.#-])-?(\d*\.?\d+)(px|rem)\b/g;
const DUR = /(?<![\w.#-])(\d*\.?\d+)(ms|s)\b/g;
const CSS_MOTION_DECL = /(?<![\w-])(?:transition|animation)(?:-(?:duration|delay))?\s*:\s*([^;}\n]*)/g;
const TW_DURATION = /(?<![\w-])(?:duration|delay)-\[(\d*\.?\d+)(ms|s)\]/g;
const JS_DURATION = /(?<![\w-])duration\s*:\s*(\d*\.?\d+)\s*[,}\n]/g;
const BEZIER = /cubic-bezier\(([^)]*)\)/gi;

const ANIMATED = [
  /(?<![\w-])(?:animation|transition)(?:-[a-z-]+)?\s*:/, /@keyframes\b/,
  /\bmotion\.[A-Za-z]/, /\banimate\s*=/, /\btransition\s*=/,
  /\bgsap\./, /\bAnimated\./, /\b(?:useSharedValue|withTiming)\b/,
];
const REDUCED = /prefers-reduced-motion|motion-reduce:|motion-safe:|useReducedMotion|isReduceMotionEnabled|reduceMotion/;

function scanSpacing(text, scale) {
  const hits = [];
  const off = (px) => px !== 0 && !scale.has(px);
  for (const m of text.matchAll(CSS_SPACING)) {
    for (const l of m[1].matchAll(LEN)) if (off(toPx(l[1], l[2]))) hits.push({ value: l[1] + l[2], index: m.index });
  }
  for (const m of text.matchAll(TW_SPACING)) if (off(toPx(m[1], m[2]))) hits.push({ value: m[1] + m[2], index: m.index });
  for (const m of text.matchAll(JS_BARE_SPACING)) if (off(num(m[1]))) hits.push({ value: m[1] + "px", index: m.index });
  return hits;
}

function scanMotion(text, mo) {
  const hits = [];
  const dur = (n, u, index, label) => { const ms = toMs(n, u); if (ms !== 0 && !mo.durations.has(ms)) hits.push({ value: label, index }); };
  for (const m of text.matchAll(CSS_MOTION_DECL)) for (const d of m[1].matchAll(DUR)) dur(d[1], d[2], m.index, d[1] + d[2]);
  for (const m of text.matchAll(TW_DURATION)) dur(m[1], m[2], m.index, m[1] + m[2]);
  for (const m of text.matchAll(JS_DURATION)) { const n = num(m[1]); dur(m[1], n < 20 ? "s" : "ms", m.index, m[1] + (n < 20 ? "s" : "ms")); }
  for (const m of text.matchAll(BEZIER)) {
    const v = normBezier(m[0]);
    if (!mo.easings.has(v)) hits.push({ value: v, index: m.index });
  }
  return hits;
}

function scales(sec) {
  const spacing = new Set();
  for (const r of sec.Spacing || []) for (const c of r.slice(1)) for (const l of c.matchAll(LEN)) spacing.add(toPx(l[1], l[2]));
  const durations = new Set(), easings = new Set();
  for (const r of sec.Motion || []) for (const c of r.slice(1)) {
    for (const d of c.matchAll(DUR)) durations.add(toMs(d[1], d[2]));
    for (const b of c.matchAll(BEZIER)) easings.add(normBezier(b[0]));
  }
  return { spacing, motion: { durations, easings } };
}

const propSet = (c) => new Set((c.props || []).map((p) => p.name));

const SCAN_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|css|scss|sass|less|vue|svelte|html)$/i;
const isDesignDoc = (p) => /(^|\/)docs\/design\//.test(p);

const ROUTE_FILES = /^(page|layout|template|loading|error|not-found|route|default|_layout|_app|_document|index)\./;

export function checkReuse({ designMd, files, justifications = {}, all = false, inventory = null }) {
  if (formatOf(designMd) !== 2) throw new Error("DESIGN.md is not format 2; rerun design-system init");
  const sec = sections(designMd);
  const tokFiles = tokenFiles(designMd);
  const scale = scales(sec);
  const compNames = new Set((sec.Components || []).map((r) => r[0]));
  const compPaths = new Set((sec.Components || []).map((r) => r[1]));
  const layoutPaths = new Set((sec.Layouts || []).map((r) => r[1]));
  const pkgs = new Map((sec.Packages || []).map((r) => [r[0], r[2] || ""]));

  const res = { schema: 2, new_components: [], new_layouts: [], raw_colours: [], raw_spacing: [], raw_motion: [], missing_reduced_motion: [], new_packages: [], unjustified: 0 };
  if (all) { res.stale_inventory = []; res.near_duplicates = []; }
  const seenComp = new Set();

  for (const f of files) {
    const p = f.path.replace(/\\/g, "/");
    const base = basename(p);
    const stem = base.replace(/\.[^.]+$/, "");
    if (/(^|\/)package\.json$/.test(p)) {
      let json;
      try { json = JSON.parse(f.content); } catch (e) { throw new Error(`bad JSON in ${p}: ${e.message}`); }
      for (const sect of ["dependencies", "devDependencies"]) {
        for (const name of Object.keys(json[sect] || {})) {
          if (pkgs.has(name) || res.new_packages.some((x) => x.name === name)) continue;
          const line = lineOf(f.content, f.content.indexOf(`"${name}"`));
          const item = { name, file: p, line };
          const cap = capOf(name);
          if (cap) {
            const dup = [...pkgs.keys()].find((k) => k !== name && capOf(k) === cap);
            if (dup) item.duplicates = dup;
          }
          res.new_packages.push(justify(item, justifications));
        }
      }
      continue;
    }
    if (/(^|\/)DESIGN\.md$/.test(p) || /\.json$/.test(p)) continue;

    if (isDesignDoc(p)) continue;
    const isLayout = /^(layout|_layout)\.[^.]+$/.test(base) || /Layout\.[^.]+$/.test(base);
    if (isLayout) {
      if (!layoutPaths.has(p)) res.new_layouts.push(justify({ name: p, file: p, line: 1 }, justifications));
    } else if (/(^|\/)components\//.test(p) && /\.[jt]sx?$|\.vue$|\.svelte$/.test(base)) {
      if (!compNames.has(stem) && !compPaths.has(p) && !seenComp.has(stem)) {
        seenComp.add(stem);
        res.new_components.push(justify({ name: stem, file: p, line: 1 }, justifications));
      }
    } else if (/\.[jt]sx$/.test(base) && !ROUTE_FILES.test(base)) {
      const re = /export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z][A-Za-z0-9]*)/g;
      for (const m of f.content.matchAll(re)) {
        if (compNames.has(m[1]) || seenComp.has(m[1])) continue;
        seenComp.add(m[1]);
        res.new_components.push(justify({ name: m[1], file: p, line: lineOf(f.content, m.index) }, justifications));
      }
    }

    if (isTokenFile(tokFiles, p) || !SCAN_EXT.test(p)) continue;
    const seen = new Set();
    const report = (list, hits, key) => {
      for (const h of hits) {
        const id = key + "|" + h.value;
        if (seen.has(id)) continue;
        seen.add(id);
        list.push(justify({ value: h.value, file: p, line: lineOf(f.content, h.index) }, justifications));
      }
    };
    report(res.raw_colours, colours(f.content), "c");
    report(res.raw_spacing, scanSpacing(f.content, scale.spacing), "s");
    report(res.raw_motion, scanMotion(f.content, scale.motion), "m");
    if (ANIMATED.some((re) => re.test(f.content)) && !REDUCED.test(f.content)) {
      const idx = Math.min(...ANIMATED.map((re) => re.exec(f.content)?.index ?? Infinity));
      res.missing_reduced_motion.push(justify({ name: p, file: p, line: lineOf(f.content, idx) }, justifications));
    }
  }
  if (all) {
    const paths = new Set(files.map((f) => f.path.replace(/\\/g, "/")));
    const inv = inventory?.components || [];
    for (const group of [inv, inventory?.layouts || [], inventory?.schemas || []]) {
      for (const e of group) if (e.path && !paths.has(e.path)) res.stale_inventory.push(justify({ name: e.name, file: e.path, line: 1 }, justifications));
    }
    const code = files.filter((f) => /\.[jt]sx?$/.test(f.path) && !isTokenFile(tokFiles, f.path) && !isDesignDoc(f.path.replace(/\\/g, "/"))).map((f) => ({ path: f.path.replace(/\\/g, "/"), content: f.content }));
    const cur = buildInventory(code, { designMd }).components;
    // Generic wrapper props say nothing about duplication; need ≥2 meaningful props.
    const GENERIC = new Set(["children", "className"]);
    const sets = new Map(cur.map((c) => [c, new Set([...propSet(c)].filter((n) => !GENERIC.has(n)))]));
    const overlap = (a, b) => {
      const x = sets.get(a), y = sets.get(b);
      if (x.size < 2 || y.size < 2) return false;
      return [...x].filter((n) => y.has(n)).length / Math.max(x.size, y.size) >= 0.8;
    };
    for (const c of cur) {
      const dups = cur.filter((o) => o.path !== c.path && (o.name === c.name || overlap(c, o)));
      if (dups.length) res.near_duplicates.push(justify({ name: c.name, file: c.path, line: 1, duplicates: [...new Set(dups.map((d) => d.name))] }, justifications));
    }
  }
  for (const k of ["new_components", "new_layouts", "raw_colours", "raw_spacing", "raw_motion", "missing_reduced_motion", "new_packages", "stale_inventory", "near_duplicates"])
    res.unjustified += (res[k] || []).filter((x) => !x.justified).length;
  return res;
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === "--all") { a.all = true; i--; continue; }
    if (!argv[i].startsWith("--") || argv[i + 1] === undefined) throw new Error(`bad argument ${argv[i]}`);
    a[argv[i].slice(2)] = argv[i + 1];
  }
  return a;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.project || !a.run) throw new Error("usage: reuse-check.mjs --project <dir> --run <runDir> [--files a,b | --all] [--base <ref>]");
  const designPath = [a.design, join(a.project, "docs/design/DESIGN.md"), join(a.project, "DESIGN.md")].find((p) => p && existsSync(p));
  if (!designPath) throw new Error("DESIGN.md not found");
  const designMd = readFileSync(designPath, "utf8");
  if (formatOf(designMd) !== 2) throw new Error(`${designPath} is not format 2; rerun design-system init`);
  const jPath = a.justifications || join(a.run, "justifications.json");
  let justifications = {};
  if (existsSync(jPath)) {
    try { justifications = JSON.parse(readFileSync(jPath, "utf8")); } catch (e) { throw new Error(`bad JSON in ${jPath}: ${e.message}`); }
  } else if (a.justifications) throw new Error(`cannot read ${jPath}`);
  // New files are usually untracked until committed, so the diff alone would miss them.
  const gitList = (args) => execFileSync("git", args, { cwd: a.project, encoding: "utf8" }).split("\n").filter(Boolean);
  const names = a.all
    ? listProjectFiles(a.project)
    : a.files
    ? a.files.split(",").map((s) => s.trim()).filter(Boolean)
    : [...new Set([...gitList(["diff", "--name-only", "--relative", "--diff-filter=d", a.base || "HEAD"]), ...gitList(["ls-files", "--others", "--exclude-standard"])])];
  const SKIP = /(^|\/)(\.artist|node_modules|\.git|\.worktrees)\/|\.(png|jpe?g|webp|gif|ico|avif|woff2?|ttf|otf|mp4|webm|pdf|zip)$/i;
  const files = names.filter((n) => !SKIP.test(n.replace(/\\/g, "/"))).map((n) => {
    try { return { path: n, content: readFileSync(join(a.project, n), "utf8") }; } catch (e) { throw new Error(`cannot read ${n}: ${e.message}`); }
  });
  let inventory = null;
  const invPath = join(a.project, "docs/design/inventory.json");
  if (a.all && existsSync(invPath)) {
    try { inventory = JSON.parse(readFileSync(invPath, "utf8")); } catch (e) { throw new Error(`bad JSON in ${invPath}: ${e.message}`); }
  }
  const result = checkReuse({ designMd, files, justifications, all: !!a.all, inventory });
  mkdirSync(a.run, { recursive: true });
  writeFileSync(join(a.run, "reuse.json"), JSON.stringify(result, null, 2) + "\n");
  return result.unjustified ? 1 : 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (e) { console.error(`reuse-check: ${e.message}`); process.exitCode = 2; }
}
